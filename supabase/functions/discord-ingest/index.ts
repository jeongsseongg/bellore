// ============================================================
// 벨로르(BELLORE) · Discord/Slack 메시지 수집 Edge Function
// ------------------------------------------------------------
// 목적: 내부 팀(전문가) Discord/Slack 대화·이미지를 수집해 team_messages /
//   team_message_attachments 에 저장하고, 시계 키워드(브랜드/레퍼런스)를 태깅한다.
//   → 누적된 팀 지식은 ai-learn 으로 전문가 지식(expert_knowledge_notes)으로 승격.
//
// 왜 Edge Function 인가:
//   - Discord 는 채널 메시지를 임의 URL 로 자동 전송하지 않는다(봇 필요).
//   - 그래서 "작은 봇"(Discord Gateway 를 듣는 프로세스: Cloudflare Worker /
//     Deno Deploy / 라즈베리파이 등 아무 곳)이 메시지를 받아 이 함수로 POST 한다.
//   - 봇 토큰은 봇 쪽에만 두고, 이 함수는 공유 시크릿(헤더)으로 인증한다.
//     → 클라이언트/깃에 토큰이 노출되지 않는다.
//
// 배포:
//   supabase secrets set DISCORD_INGEST_SECRET=<길고-임의의-문자열>
//   supabase functions deploy discord-ingest --no-verify-jwt
//
// 봇이 보내는 요청(예):
//   POST /functions/v1/discord-ingest
//   Header: x-ingest-secret: <DISCORD_INGEST_SECRET>
//   Body(JSON):
//   {
//     "platform": "discord",                 // or "slack"
//     "channel_id": "123", "channel_name": "#시세-정보",
//     "sender_id": "u1", "sender_name": "감정사 박",
//     "message": "서브마리너 124060 풀세트 시세 1450 정도",
//     "attachments": [                        // 선택(이미지/파일)
//       { "url": "https://cdn.discord.../a.jpg", "file_name": "a.jpg",
//         "file_type": "image/jpeg", "file_size": 123456 }
//     ],
//     "created_at": "2026-06-29T08:00:00Z"    // 선택
//   }
//
// 첨부 처리: 봇이 보낸 url 을 그대로 Storage(team-message-attachments)에 미러링
//   저장하고 공개/서명 URL 을 DB 에 기록한다(원본 CDN 만료 대비). 다운로드 실패 시
//   url 만 기록(끊김 없음).
//
// ── 비교견적 자동 등록 (디스코드 → 비회원 견적) ──────────────
//   이미지 + 모델명(텍스트)이 함께 올라오면 quote_requests 에 비회원
//   (customer_id NULL) 견적을 status='open' 으로 즉시 생성한다(승인 생략).
//   → 기존 트리거(notify_vendors_on_open / notify_admin_quote)가 승인업체
//     전체 + 관리자에게 앱 알림을 발송한다. 메일은 발송하지 않는다.
//   금액이 "100", "1200", "1,450만원" 처럼 있으면 만원 단위로 환산해
//   관리자 명의 '벨로르 1차 견적' 입찰(bids)을 자동 등록한다.
//   "검수 후 최대 1300만원" 처럼 조건부 금액이면 입찰 문구에 그대로 안내.
//   사진 없이 금액만 뒤이어 올라온 메시지는 같은 채널의 최근 30분 내
//   자동 견적에 1차 견적으로 붙는다(사진→금액 순서로 나눠 올려도 됨).
//   ⚠️ 선행 조건: discord_quote.sql + discord_quote_v2.sql 실행.
//   (선택) 특정 채널만 견적으로 받으려면 Secrets 에
//   DISCORD_QUOTE_CHANNELS=채널ID,채널ID … 설정. 미설정 시 수집 채널 전체.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INGEST_SECRET = Deno.env.get("DISCORD_INGEST_SECRET") ?? "";
const BUCKET = "team-message-attachments";

// 비교견적 자동 등록 설정
const QUOTE_CHANNELS = (Deno.env.get("DISCORD_QUOTE_CHANNELS") ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean); // 비어 있으면 전 채널 허용
const PHOTOS_BUCKET = "photos";                      // 견적 사진 공개 버킷(앱과 동일)
const ADMIN_EMAIL = "bellorekr@gmail.com";           // 1차 견적 입찰 명의(관리자)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ingest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// 시계 브랜드 키워드(한/영) — 클라이언트 ruleExtractor 와 동일 철학
const BRANDS: [string, string[]][] = [
  ["롤렉스", ["rolex", "롤렉스", "롤"]],
  ["오메가", ["omega", "오메가"]],
  ["까르띠에", ["cartier", "까르띠에"]],
  ["태그호이어", ["tag heuer", "tagheuer", "태그호이어"]],
  ["리차드밀", ["richard mille", "리차드밀"]],
  ["파텍필립", ["patek", "파텍필립", "파텍"]],
  ["오데마피게", ["audemars", "오데마피게", "오데마", "ap"]],
  ["바쉐론 콘스탄틴", ["vacheron", "바쉐론"]],
  ["IWC", ["iwc"]],
  ["파네라이", ["panerai", "파네라이"]],
  ["튜더", ["tudor", "튜더"]],
  ["브라이틀링", ["breitling", "브라이틀링"]],
  ["위블로", ["hublot", "위블로"]],
  ["예거 르쿨트르", ["jaeger", "jlc", "예거"]],
  ["브레게", ["breguet", "브레게"]],
  ["블랑팡", ["blancpain", "블랑팡"]],
];

function tagBrand(text: string): string | null {
  const low = (text ?? "").toLowerCase();
  for (const [name, keys] of BRANDS) {
    if (keys.some((k) => low.includes(k))) return name;
  }
  return null;
}
function tagReference(text: string): string | null {
  const m = (text ?? "").match(/\b(\d{4,6}[A-Za-z]{0,4})\b/);
  if (!m) return null;
  const t = m[1];
  if (/^\d{4}$/.test(t) && +t > 1900 && +t < 2100) return null; // 연도 제외
  return t.toUpperCase();
}

// ── 비교견적 자동 등록 ──────────────────────────────────────
// 금액 파싱: 만원 단위. "1,450만원"/"850만" 이 최우선, 없으면 단독 숫자.
//   단독 숫자는 2~4자리(10만~9,999만원)만 금액으로 본다 — 5~6자리 숫자는
//   레퍼런스(예: 124060)일 가능성이 높아 제외. 콤마 표기("12,000")는
//   금액이 확실하므로 자릿수 제한 없이 허용. 1억 이상은 "만원"을 붙여 쓴다.
function parsePriceManwon(text: string): { man: number; token: string } | null {
  const t = String(text ?? "");
  const unit = [...t.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)\s*만\s*원?(?![가-힣\w])/g)];
  for (let i = unit.length - 1; i >= 0; i--) {
    const n = Number(unit[i][1].replace(/,/g, ""));
    if (n > 0 && n <= 999999) return { man: n, token: unit[i][0] };
  }
  const bare = [...t.matchAll(/(?<![\w.,-])(\d{1,3}(?:,\d{3})+|\d{2,4})(?![\w.,-]|\s*년)/g)];
  for (let i = bare.length - 1; i >= 0; i--) {
    const n = Number(bare[i][1].replace(/,/g, ""));
    if (n >= 10 && n <= 999999) return { man: n, token: bare[i][0] };
  }
  return null;
}

// 모델명: 원문에서 URL·금액 표기·금액 수식어("검수 후 최대" 등)를 걷어낸 텍스트
function extractModelName(text: string, priceToken?: string): string {
  let t = String(text ?? "").replace(/https?:\/\/\S+/g, " ");
  if (priceToken) t = t.replace(priceToken, " ");
  t = t.replace(/(\d{1,3}(?:,\d{3})+|\d+)\s*만\s*원(?![가-힣\w])/g, " ");
  t = t.replace(/검수\s*후\s*(최대)?/g, " ").replace(/(?<![가-힣])최대(?![가-힣])/g, " ");
  return t.replace(/\s+/g, " ").trim().slice(0, 60).trim();
}

// 1차 견적 입찰 문구 — "검수 후 최대" 등 조건부 금액이면 안내 문구를 붙인다
function bidMessageFor(text: string, man: number): string {
  const pretty = man.toLocaleString("ko-KR") + "만원";
  if (/검수\s*후\s*최대/.test(text)) {
    return "검수 후 최대 " + pretty + " — 벨로르 1차 견적입니다. 실물 검수 결과에 따라 최종 금액이 확정됩니다.";
  }
  if (/(?<![가-힣])최대(?![가-힣])/.test(text)) {
    return "최대 " + pretty + " — 벨로르 1차 견적입니다. 상태 확인 후 최종 금액이 확정됩니다.";
  }
  return "벨로르 1차 견적";
}

// 관리자 명의 1차 견적 입찰 등록/갱신 (upsert: 같은 견적에 다시 오면 금액 갱신)
async function placeFirstBid(
  admin: ReturnType<typeof createClient>,
  quoteId: string,
  price: { man: number },
  text: string,
): Promise<number> {
  const prof = await admin.from("profiles").select("id").ilike("email", ADMIN_EMAIL).maybeSingle();
  if (!prof.data?.id) return 0;
  const bid = await admin.from("bids").upsert({
    quote_request_id: quoteId,
    vendor_id: prof.data.id,
    amount: price.man * 10000,
    message: bidMessageFor(text, price.man),
  }, { onConflict: "quote_request_id,vendor_id" });
  return bid.error ? 0 : price.man * 10000;
}

// 사진 없이 금액만 뒤이어 올라온 경우(예: 사진 먼저 → "검수 후 최대 1300만원"):
// 같은 채널에서 최근 30분 내 자동 생성된 비회원 견적을 찾아 1차 견적을 붙인다.
// 이미 1차 견적이 있으면 "만원" 표기가 명시된 경우에만 금액을 갱신(잡담 숫자로
// 기존 견적이 덮이는 것 방지).
async function attachPriceToRecentQuote(
  admin: ReturnType<typeof createClient>,
  it: { channel_id?: unknown },
  text: string,
) {
  const price = parsePriceManwon(text);
  if (!price) return null;
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  let sel = await admin.from("quote_requests").select("id")
    .is("customer_id", null).eq("status", "open").gte("created_at", since)
    .eq("source_channel_id", String(it.channel_id ?? ""))
    .order("created_at", { ascending: false }).limit(1);
  if (sel.error && /column/i.test(sel.error.message ?? "")) {
    // source_channel_id 컬럼 미생성(discord_quote_v2.sql 미실행) → 채널 구분 없이 최근 견적
    sel = await admin.from("quote_requests").select("id")
      .is("customer_id", null).eq("status", "open").gte("created_at", since)
      .order("created_at", { ascending: false }).limit(1);
  }
  const quote = sel.data?.[0];
  if (!quote) return null;

  const prof = await admin.from("profiles").select("id").ilike("email", ADMIN_EMAIL).maybeSingle();
  if (prof.data?.id) {
    const existing = await admin.from("bids").select("id")
      .eq("quote_request_id", quote.id).eq("vendor_id", prof.data.id).maybeSingle();
    if (existing.data && !/만\s*원?/.test(text)) return { skipped: "bid_exists" };
  }
  const firstBid = await placeFirstBid(admin, quote.id, price, text);
  return firstBid ? { id: quote.id, first_bid: firstBid, attached: true } : { error: "bid_failed" };
}

function isImageAttachment(att: { url?: string; file_name?: string; file_type?: string }): boolean {
  if ((att.file_type ?? "").startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)(\?|$)/i.test(att.file_name ?? att.url ?? "");
}

// 이미지+모델명 → 비회원 견적(open) 생성 + 금액 있으면 1차 견적 입찰
// 반환: null=대상 아님(수집만), {id,...}=생성됨, {error}=실패(로그용)
async function createGuestQuote(
  admin: ReturnType<typeof createClient>,
  it: { channel_id?: unknown; channel_name?: unknown; sender_name?: unknown },
  text: string,
  attachments: { url?: string; file_name?: string; file_type?: string }[],
) {
  if (QUOTE_CHANNELS.length && !QUOTE_CHANNELS.includes(String(it.channel_id ?? ""))) return null;
  const images = attachments.filter(isImageAttachment);
  if (!images.length) return null;                       // 이미지 필수
  const price = parsePriceManwon(text);
  const model = extractModelName(text, price?.token);
  if (!model) return null;                               // 모델명 필수

  // 사진을 공개 버킷(photos)에 올려 견적 카드에 바로 표시되게 한다
  const urls: string[] = [];
  for (const att of images.slice(0, 10)) {
    try {
      const res = await fetch(att.url ?? "");
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      const ext = ((att.file_name ?? "").split(".").pop() || "jpg")
        .toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `discord/${crypto.randomUUID()}.${ext}`;
      const up = await admin.storage.from(PHOTOS_BUCKET).upload(path, buf, {
        contentType: att.file_type || res.headers.get("content-type") || "image/jpeg",
        upsert: false,
      });
      if (!up.error) urls.push(admin.storage.from(PHOTOS_BUCKET).getPublicUrl(path).data.publicUrl);
    } catch (_e) { /* 개별 사진 실패는 건너뜀 */ }
  }
  if (!urls.length) return { error: "photo_upload_failed" };

  const brand = tagBrand(text);
  const ref = tagReference(model); // 금액을 걷어낸 텍스트에서 레퍼런스 추출(금액 오인 방지)
  const detail = [
    ref ? `[레퍼런스] ${ref}` : "",
    `[출처] 디스코드 ${String(it.channel_name ?? "")} / ${String(it.sender_name ?? "익명")} · 비회원 자동 접수`,
    text ? `[원문] ${text}` : "",
  ].filter(Boolean).join("\n");

  const row: Record<string, unknown> = {
    customer_id: null,          // 비회원 — discord_quote.sql 로 NULL 허용 필요
    item_name: model,
    item_brand: brand,
    item_ref: ref,
    item_detail: detail,
    photo_urls: urls,
    photo_url: urls[0],
    status: "open",             // 승인 생략, 즉시 공개 → 트리거가 업체·관리자 앱 알림(메일 없음)
    source_channel_id: String(it.channel_id ?? ""), // 뒤이어 오는 금액 메시지 매칭용
  };
  let ins = await admin.from("quote_requests").insert(row).select("id").single();
  if (ins.error && /column/i.test(ins.error.message ?? "")) {
    delete row.item_ref;              // 컬럼 미생성 환경 폴백(quote_compare.sql 미실행)
    delete row.source_channel_id;     // (discord_quote_v2.sql 미실행)
    ins = await admin.from("quote_requests").insert(row).select("id").single();
  }
  if (ins.error) return { error: ins.error.message };

  // 금액(만원) → 관리자 명의 '벨로르 1차 견적' 입찰
  const firstBid = price ? await placeFirstBid(admin, ins.data.id, price, text) : 0;
  return { id: ins.data.id, photos: urls.length, first_bid: firstBid };
}

async function mirrorAttachment(
  admin: ReturnType<typeof createClient>,
  msgId: string,
  att: { url?: string; file_name?: string; file_type?: string; file_size?: number },
) {
  let storagePath = "";
  let fileUrl = att.url ?? null;
  try {
    if (att.url) {
      const res = await fetch(att.url);
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        const ext = (att.file_name?.split(".").pop() || "bin").toLowerCase();
        storagePath = `${msgId}/${crypto.randomUUID()}.${ext}`;
        const up = await admin.storage.from(BUCKET).upload(storagePath, buf, {
          contentType: att.file_type || res.headers.get("content-type") || "application/octet-stream",
          upsert: false,
        });
        if (up.error) { storagePath = ""; }
        else {
          const signed = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60 * 24 * 365);
          fileUrl = signed.data?.signedUrl ?? fileUrl;
        }
      }
    }
  } catch (_e) { /* 미러링 실패 → 원본 url 만 기록 */ }

  await admin.from("team_message_attachments").insert({
    team_message_id: msgId,
    storage_path: storagePath || (att.url ?? ""),
    file_url: fileUrl,
    file_name: att.file_name ?? null,
    file_type: att.file_type ?? null,
    file_size: att.file_size ?? null,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 공유 시크릿 인증(봇만 호출 가능)
  if (!INGEST_SECRET) return json({ error: "DISCORD_INGEST_SECRET_not_set" }, 503);
  if (req.headers.get("x-ingest-secret") !== INGEST_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const items = Array.isArray(body) ? body : [body]; // 단건/배치 모두 허용
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const results: unknown[] = [];

    for (const it of items) {
      const text = String(it.message ?? "");
      const attachments = Array.isArray(it.attachments) ? it.attachments : [];
      const row = {
        platform: String(it.platform ?? "discord"),
        channel_id: it.channel_id ?? null,
        channel_name: it.channel_name ?? null,
        sender_id: it.sender_id ?? null,
        sender_name: it.sender_name ?? null,
        message: text,
        has_attachment: attachments.length > 0,
        metadata: {
          brand: tagBrand(text),
          reference_number: tagReference(text),
          raw: it.metadata ?? {},
        },
        created_at: it.created_at ?? new Date().toISOString(),
      };
      const { data, error } = await admin.from("team_messages").insert(row).select("id").single();
      if (error) { results.push({ error: error.message }); continue; }

      for (const att of attachments) {
        await mirrorAttachment(admin, data.id, att);
      }

      // 이미지+모델명 → 비회원 비교견적 자동 등록(실패해도 수집은 유지)
      let quote: unknown = null;
      try {
        quote = await createGuestQuote(admin, it, text, attachments);
        // 사진 없이 금액만 온 메시지("검수 후 최대 1300만원" 등)는
        // 같은 채널의 직전 자동 견적에 1차 견적으로 붙인다
        if (!quote && !attachments.some(isImageAttachment)) {
          if (!QUOTE_CHANNELS.length || QUOTE_CHANNELS.includes(String(it.channel_id ?? ""))) {
            quote = await attachPriceToRecentQuote(admin, it, text);
          }
        }
      } catch (e) { quote = { error: String(e) }; }

      results.push({ id: data.id, attachments: attachments.length, ...(quote ? { quote } : {}) });
    }

    return json({ ok: true, ingested: results.length, results });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
