// ============================================================
// ⚠️ 폐기(2026-07): GitHub Actions 봇(tools/discord-poll + discord-poll.yml)으로
//    대체되었다. 이 파일은 참고용으로만 남겨둔다 — 새로 배포하지 말 것.
// ============================================================
// 벨로르(BELLORE) · Discord 대화 수집 릴레이 (Deno Deploy 용, 무료·브라우저 배포)
// ------------------------------------------------------------
// 하는 일:
//   - 지정한 디스코드 채널들의 새 메시지를 몇 분마다 읽어서(REST 폴링),
//     Supabase 의 discord-ingest Edge Function 으로 보내 team_messages 에 저장한다.
//   - 지속 연결(게이트웨이) 없이 "정기 폴링"이라 서버리스(Deno Deploy)에서 무료로 돈다.
//   - 마지막으로 읽은 메시지 ID 는 Deno KV(무료 내장)에 저장해 중복 없이 이어읽는다.
//
// 필요한 환경변수(Deno Deploy 프로젝트 Settings → Environment Variables):
//   DISCORD_BOT_TOKEN   : 디스코드 봇 토큰 (Bot 페이지의 Reset Token)
//   DISCORD_CHANNELS    : 수집할 채널 ID들(쉼표로 구분). 예: 123,456
//   INGEST_URL          : https://iumsnacuxgssnnbckurq.supabase.co/functions/v1/discord-ingest
//   INGEST_SECRET       : Supabase 시크릿 DISCORD_INGEST_SECRET 과 "똑같은" 값
//   SUPABASE_ANON       : Supabase anon 키(함수 호출 인증용). 공개키라 안전.
//
// 배포: dash.deno.com → New Project → GitHub 저장소 연결 → 진입 파일
//        tools/discord-relay/main.ts 선택 → 위 환경변수 입력 → 저장. 끝.
//        (Deno.cron 이 2분마다 자동 실행. 별도 스케줄 설정 불필요)
// ============================================================

const TOKEN = Deno.env.get("DISCORD_BOT_TOKEN") ?? "";
const CHANNELS = (Deno.env.get("DISCORD_CHANNELS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const INGEST_URL = Deno.env.get("INGEST_URL") ?? "";
const INGEST_SECRET = Deno.env.get("INGEST_SECRET") ?? "";
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON") ?? "";

const DISCORD_API = "https://discord.com/api/v10";
const kv = await Deno.openKv();
const nameCache = new Map<string, string>();

async function discord(path: string): Promise<any> {
  const res = await fetch(DISCORD_API + path, {
    headers: { Authorization: `Bot ${TOKEN}` },
  });
  if (res.status === 429) { // 레이트리밋 → 잠깐 쉬고 스킵
    return null;
  }
  if (!res.ok) throw new Error(`discord ${res.status} ${await res.text()}`);
  return res.json();
}

async function channelName(id: string): Promise<string> {
  if (nameCache.has(id)) return nameCache.get(id)!;
  try {
    const ch = await discord(`/channels/${id}`);
    const nm = ch?.name ? `#${ch.name}` : id;
    nameCache.set(id, nm);
    return nm;
  } catch { return id; }
}

async function forward(payload: unknown) {
  const res = await fetch(INGEST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ingest-secret": INGEST_SECRET,
      // 함수가 JWT 검증 켜져 있어도 통과하도록 anon 키 동봉
      "apikey": SUPABASE_ANON,
      "Authorization": `Bearer ${SUPABASE_ANON}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error("ingest 실패", res.status, await res.text());
}

async function pollChannel(id: string) {
  const key = ["lastId", id];
  const stored = (await kv.get<string>(key)).value;
  const qs = stored ? `?after=${stored}&limit=50` : `?limit=15`;
  const msgs = await discord(`/channels/${id}/messages${qs}`);
  if (!Array.isArray(msgs) || !msgs.length) return;

  // 디스코드는 최신순 → 오래된 순으로 뒤집어 전송
  const ordered = msgs.slice().reverse();
  const chName = await channelName(id);
  let newest = stored ?? "";

  for (const m of ordered) {
    newest = m.id;
    if (m.author?.bot) continue;                       // 봇 메시지 제외
    const text = String(m.content ?? "");
    const attachments = (m.attachments ?? []).map((a: any) => ({
      url: a.url, file_name: a.filename, file_type: a.content_type, file_size: a.size,
    }));
    if (!text && !attachments.length) continue;        // 빈 메시지 제외

    await forward({
      platform: "discord",
      channel_id: id,
      channel_name: chName,
      sender_id: m.author?.id ?? null,
      sender_name: m.author?.global_name ?? m.author?.username ?? null,
      message: text,
      attachments,
      created_at: m.timestamp ?? new Date().toISOString(),
    });
  }
  if (newest) await kv.set(key, newest);
}

async function runOnce() {
  if (!TOKEN || !INGEST_URL || !CHANNELS.length) {
    console.warn("환경변수 미설정 — DISCORD_BOT_TOKEN / DISCORD_CHANNELS / INGEST_URL 확인");
    return;
  }
  for (const id of CHANNELS) {
    try { await pollChannel(id); } catch (e) { console.error("poll 오류", id, String(e)); }
  }
}

// 2분마다 자동 수집
Deno.cron("bellore-discord-poll", "*/2 * * * *", runOnce);

// 상태확인/수동 트리거용 HTTP (Deno Deploy 는 HTTP 엔트리 필요)
Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/run") { await runOnce(); return new Response("polled\n"); }
  return new Response(
    `벨로르 디스코드 릴레이 작동 중\n채널 ${CHANNELS.length}개 · 2분마다 수집\n수동 실행: /run\n`,
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
});
