// ============================================================
// 벨로르(BELLORE) · 디스코드 수집 봇 (GitHub Actions 판)
// ------------------------------------------------------------
// 기존 Deno Deploy 릴레이(tools/discord-relay)를 대체한다.
// GitHub Actions(.github/workflows/discord-poll.yml)가 5분마다 실행:
//   1) 디스코드 채널의 최근 메시지를 읽는다 (봇 토큰, REST)
//   2) Supabase DB에 직접 저장한다 (SUPABASE_DB_URL — db-backup과 동일 시크릿)
//      - team_messages / team_message_attachments (AI 학습용)
//      - 이미지+모델명 → quote_requests 비회원 견적 즉시 open (승인 생략)
//        알림은 DB 트리거(notify_vendors_on_open/notify_admin_quote)가 발송
//      - 금액(만원)  → 관리자 명의 '벨로르 1차 견적' 입찰(bids)
//      - 사진 없이 금액만 온 메시지 → 같은 채널 30분 내 직전 견적에 입찰
//   3) 중복 수집은 디스코드 메시지 ID(metadata.raw.id)로 방지 → 상태 저장 불필요
//
// 필요한 GitHub Secrets:
//   DISCORD_BOT_TOKEN : 디스코드 봇 토큰 (필수 — 없으면 조용히 건너뜀)
//   SUPABASE_DB_URL   : 이미 등록되어 있음 (db-backup 과 공용)
//   DISCORD_CHANNELS  : (선택) 수집 채널 ID 쉼표구분. 미설정 시 봇이 볼 수 있는
//                       모든 텍스트 채널을 자동 수집
//   DISCORD_QUOTE_CHANNELS : (선택) 견적 변환 허용 채널. 미설정 시 수집 채널 전체
//
// 금액/모델명 파싱 규칙은 supabase/functions/discord-ingest 와 동일하게 유지할 것.
// ============================================================
import pg from "pg";

const TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const CHANNELS = (process.env.DISCORD_CHANNELS ?? "").split(",").map(s => s.trim()).filter(Boolean);
const QUOTE_CHANNELS = (process.env.DISCORD_QUOTE_CHANNELS ?? "").split(",").map(s => s.trim()).filter(Boolean);

const SB_URL = "https://iumsnacuxgssnnbckurq.supabase.co";
// anon 공개키 (supabase-config.js 와 동일 — 공개되어도 안전)
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bXNuYWN1eGdzc25uYmNrdXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDQ5ODQsImV4cCI6MjA5NjIyMDk4NH0.lwej8g4YCaiYuoQSXczwRp6ez-X26DD5d1ycMkYwpIk";
const ADMIN_EMAIL = "bellorekr@gmail.com";
const DISCORD_API = "https://discord.com/api/v10";
const PER_CHANNEL_LIMIT = 20;

if (!TOKEN) { console.log("DISCORD_BOT_TOKEN 미설정 — 수집 건너뜀 (GitHub Secrets 에 등록 필요)"); process.exit(0); }
if (!DB_URL) { console.log("SUPABASE_DB_URL 미설정 — 수집 건너뜀"); process.exit(0); }

/* ---------- 디스코드 REST ---------- */
async function discord(path) {
  const res = await fetch(DISCORD_API + path, { headers: { Authorization: `Bot ${TOKEN}` } });
  if (res.status === 429) { await new Promise(r => setTimeout(r, 2000)); return discord(path); }
  if (res.status === 403 || res.status === 404) return null; // 접근 불가 채널 등 → 건너뜀
  if (!res.ok) throw new Error(`discord ${res.status} ${path}: ${await res.text()}`);
  return res.json();
}

async function discoverChannels() {
  const out = [];
  const guilds = await discord("/users/@me/guilds") ?? [];
  for (const g of guilds) {
    const chans = await discord(`/guilds/${g.id}/channels`) ?? [];
    for (const c of chans) if (c.type === 0 || c.type === 5) out.push({ id: c.id, name: "#" + (c.name ?? c.id) });
  }
  return out;
}

/* ---------- 파싱 (discord-ingest 와 동일 규칙) ---------- */
const BRANDS = [
  ["롤렉스", ["rolex", "롤렉스", "롤"]], ["오메가", ["omega", "오메가"]],
  ["까르띠에", ["cartier", "까르띠에"]], ["태그호이어", ["tag heuer", "tagheuer", "태그호이어"]],
  ["리차드밀", ["richard mille", "리차드밀"]], ["파텍필립", ["patek", "파텍필립", "파텍"]],
  ["오데마피게", ["audemars", "오데마피게", "오데마", "ap"]], ["바쉐론 콘스탄틴", ["vacheron", "바쉐론"]],
  ["IWC", ["iwc"]], ["파네라이", ["panerai", "파네라이"]], ["튜더", ["tudor", "튜더"]],
  ["브라이틀링", ["breitling", "브라이틀링"]], ["위블로", ["hublot", "위블로"]],
  ["예거 르쿨트르", ["jaeger", "jlc", "예거"]], ["브레게", ["breguet", "브레게"]],
  ["블랑팡", ["blancpain", "블랑팡"]],
];
function tagBrand(text) {
  const low = (text ?? "").toLowerCase();
  for (const [name, keys] of BRANDS) if (keys.some(k => low.includes(k))) return name;
  return null;
}
function tagReference(text) {
  const m = (text ?? "").match(/\b(\d{4,6}[A-Za-z]{0,4})\b/);
  if (!m) return null;
  const t = m[1];
  if (/^\d{4}$/.test(t) && +t > 1900 && +t < 2100) return null;
  return t.toUpperCase();
}
function parsePriceManwon(text) {
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
function extractModelName(text, priceToken) {
  let t = String(text ?? "").replace(/https?:\/\/\S+/g, " ");
  if (priceToken) t = t.replace(priceToken, " ");
  t = t.replace(/(\d{1,3}(?:,\d{3})+|\d+)\s*만\s*원(?![가-힣\w])/g, " ");
  t = t.replace(/검수\s*후\s*(최대)?/g, " ").replace(/(?<![가-힣])최대(?![가-힣])/g, " ");
  return t.replace(/\s+/g, " ").trim().slice(0, 60).trim();
}
function bidMessageFor(text, man) {
  const pretty = man.toLocaleString("ko-KR") + "만원";
  if (/검수\s*후\s*최대/.test(text)) return "검수 후 최대 " + pretty + " — 벨로르 1차 견적입니다. 실물 검수 결과에 따라 최종 금액이 확정됩니다.";
  if (/(?<![가-힣])최대(?![가-힣])/.test(text)) return "최대 " + pretty + " — 벨로르 1차 견적입니다. 상태 확인 후 최종 금액이 확정됩니다.";
  return "벨로르 1차 견적";
}
function isImageAttachment(att) {
  if ((att.content_type ?? "").startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)(\?|$)/i.test(att.filename ?? att.url ?? "");
}

/* ---------- 사진 업로드 (photos/discord/* — anon 정책은 discord_quote_v3.sql) ---------- */
async function uploadPhoto(att) {
  const res = await fetch(att.url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = ((att.filename ?? "").split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `discord/${crypto.randomUUID()}.${ext}`;
  const up = await fetch(`${SB_URL}/storage/v1/object/photos/${path}`, {
    method: "POST",
    headers: {
      apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`,
      "Content-Type": att.content_type || res.headers.get("content-type") || "image/jpeg",
    },
    body: buf,
  });
  if (!up.ok) { console.log("  사진 업로드 실패:", up.status, (await up.text()).slice(0, 120)); return null; }
  return `${SB_URL}/storage/v1/object/public/photos/${path}`;
}

/* ---------- DB ---------- */
const db = new pg.Client({
  connectionString: DB_URL.replace(/\?sslmode=[a-z-]+/i, ""),
  ssl: { rejectUnauthorized: false },
});

async function adminId() {
  const r = await db.query("select id from public.profiles where lower(email)=lower($1) limit 1", [ADMIN_EMAIL]);
  return r.rows[0]?.id ?? null;
}

// photo_urls 컬럼 타입(text[] 또는 json/jsonb)에 맞춰 값 변환
let photoUrlsIsArray = null;
async function photoUrlsValue(urls) {
  if (photoUrlsIsArray === null) {
    const r = await db.query(
      `select data_type from information_schema.columns
        where table_schema='public' and table_name='quote_requests' and column_name='photo_urls'`);
    photoUrlsIsArray = (r.rows[0]?.data_type ?? "") === "ARRAY";
  }
  return photoUrlsIsArray ? urls : JSON.stringify(urls);
}

async function placeFirstBid(quoteId, price, text) {
  const admin = await adminId();
  if (!admin) return 0;
  await db.query(
    `insert into public.bids (quote_request_id, vendor_id, amount, message)
     values ($1, $2, $3, $4)
     on conflict (quote_request_id, vendor_id)
     do update set amount = excluded.amount, message = excluded.message`,
    [quoteId, admin, price.man * 10000, bidMessageFor(text, price.man)],
  );
  return price.man * 10000;
}

async function createGuestQuote(ch, m, text) {
  if (QUOTE_CHANNELS.length && !QUOTE_CHANNELS.includes(ch.id)) return null;
  const images = (m.attachments ?? []).filter(isImageAttachment);
  if (!images.length) return null;
  const price = parsePriceManwon(text);
  const model = extractModelName(text, price?.token);
  if (!model) return null;

  const urls = [];
  for (const att of images.slice(0, 10)) {
    try { const u = await uploadPhoto(att); urls.push(u ?? att.url); } catch { urls.push(att.url); }
  }
  const brand = tagBrand(text);
  const ref = tagReference(model);
  const detail = [
    ref ? `[레퍼런스] ${ref}` : "",
    `[출처] 디스코드 ${ch.name} / ${m.author?.global_name ?? m.author?.username ?? "익명"} · 비회원 자동 접수`,
    text ? `[원문] ${text}` : "",
  ].filter(Boolean).join("\n");

  const q = await db.query(
    `insert into public.quote_requests
       (customer_id, item_name, item_brand, item_ref, item_detail, photo_urls, photo_url, status, source_channel_id)
     values (null, $1, $2, $3, $4, $5, $6, 'open', $7)
     returning id`,
    [model, brand, ref, detail, await photoUrlsValue(urls), urls[0], ch.id],
  );
  const quoteId = q.rows[0].id;
  const firstBid = price ? await placeFirstBid(quoteId, price, text) : 0;
  return { id: quoteId, first_bid: firstBid, photos: urls.length };
}

async function attachPriceToRecentQuote(ch, text) {
  const price = parsePriceManwon(text);
  if (!price) return null;
  const r = await db.query(
    `select id from public.quote_requests
      where customer_id is null and status = 'open'
        and source_channel_id = $1
        and created_at > now() - interval '30 minutes'
      order by created_at desc limit 1`,
    [ch.id],
  );
  const quote = r.rows[0];
  if (!quote) return null;
  const admin = await adminId();
  if (admin) {
    const ex = await db.query(
      "select 1 from public.bids where quote_request_id=$1 and vendor_id=$2 limit 1",
      [quote.id, admin],
    );
    if (ex.rows.length && !/만\s*원?/.test(text)) return { skipped: "bid_exists" };
  }
  const firstBid = await placeFirstBid(quote.id, price, text);
  return firstBid ? { id: quote.id, first_bid: firstBid, attached: true } : null;
}

async function ingestMessage(ch, m) {
  const text = String(m.content ?? "");
  const atts = m.attachments ?? [];
  if (m.author?.bot) return null;
  if (!text && !atts.length) return null;

  // 중복 방지: 디스코드 메시지 ID
  const dup = await db.query(
    "select id from public.team_messages where platform='discord' and metadata->'raw'->>'id' = $1 limit 1",
    [m.id],
  );
  if (dup.rows.length) return null;

  const meta = {
    brand: tagBrand(text),
    reference_number: tagReference(text),
    raw: { id: m.id, channel_id: ch.id },
  };
  const ins = await db.query(
    `insert into public.team_messages
       (platform, channel_id, channel_name, sender_id, sender_name, message, has_attachment, metadata, created_at)
     values ('discord', $1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [ch.id, ch.name, m.author?.id ?? null,
     m.author?.global_name ?? m.author?.username ?? null,
     text, atts.length > 0, JSON.stringify(meta),
     m.timestamp ?? new Date().toISOString()],
  );
  const msgId = ins.rows[0].id;
  for (const a of atts) {
    await db.query(
      `insert into public.team_message_attachments
         (team_message_id, storage_path, file_url, file_name, file_type, file_size)
       values ($1, $2, $3, $4, $5, $6)`,
      [msgId, a.url ?? "", a.url ?? null, a.filename ?? null, a.content_type ?? null, a.size ?? null],
    );
  }

  // 견적 자동 등록 / 금액 후속 매칭
  let quote = null;
  try {
    quote = await createGuestQuote(ch, m, text);
    if (!quote && !atts.some(isImageAttachment)) {
      if (!QUOTE_CHANNELS.length || QUOTE_CHANNELS.includes(ch.id)) {
        quote = await attachPriceToRecentQuote(ch, text);
      }
    }
  } catch (e) { console.log("  견적 처리 오류:", String(e).slice(0, 200)); }
  return { new: true, quote };
}

/* ---------- 메인 ---------- */
async function main() {
  await db.connect();
  const channels = CHANNELS.length
    ? CHANNELS.map(id => ({ id, name: id }))
    : await discoverChannels();
  if (CHANNELS.length) {
    for (const ch of channels) {
      const info = await discord(`/channels/${ch.id}`);
      if (info?.name) ch.name = "#" + info.name;
    }
  }
  console.log(`채널 ${channels.length}개 수집 시작`);

  let newCount = 0, quoteCount = 0;
  for (const ch of channels) {
    const msgs = await discord(`/channels/${ch.id}/messages?limit=${PER_CHANNEL_LIMIT}`);
    if (!Array.isArray(msgs)) { console.log(`  ${ch.name}: 접근 불가 → 건너뜀`); continue; }
    for (const m of msgs.slice().reverse()) { // 오래된 것부터
      const r = await ingestMessage(ch, m);
      if (r?.new) newCount++;
      if (r?.quote?.id) {
        quoteCount++;
        console.log(`  견적 ${r.quote.attached ? "1차금액 연결" : "생성"}: ${ch.name} → ${r.quote.id}` +
          (r.quote.first_bid ? ` (1차 견적 ${(r.quote.first_bid / 10000).toLocaleString("ko-KR")}만원)` : ""));
      }
    }
  }
  console.log(`완료 — 새 메시지 ${newCount}건, 견적 처리 ${quoteCount}건`);
  await db.end();
}

main().catch(e => { console.error("실행 오류:", e); process.exitCode = 1; });
