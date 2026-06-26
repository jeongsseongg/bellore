// ============================================================
// 벨로르(BELLORE) · 계좌 실명조회(예금주 대조) Edge Function — 스캐폴드
// ------------------------------------------------------------
// 동작:
//   - { bank, account, holder } 를 받아 예금주 실명을 대조한다.
//   - 실명조회 API 키(ACCOUNT_VERIFY_API_KEY)가 없으면 NOT_CONFIGURED 를 돌려주고
//     프런트는 "준비 중 — 입력만으로 가입" 으로 폴백한다.
//
// 활성화(키 준비되면):
//   1) 실명조회 제공사(토스/나이스/핀테크 API 등) 계약 후 키 발급
//   2) supabase secrets set ACCOUNT_VERIFY_API_KEY=xxxx
//      (필요 시 ACCOUNT_VERIFY_API_URL 도 등록)
//   3) supabase functions deploy verify-account --no-verify-jwt
//   4) supabase-config.js 의 BELLORE_VERIFY.account.enabled = true
//   ※ 아래 "실제 호출" 부분을 계약한 API 규격에 맞게 채우면 됩니다.
// ============================================================

const API_KEY = Deno.env.get("ACCOUNT_VERIFY_API_KEY") ?? "";
const API_URL = Deno.env.get("ACCOUNT_VERIFY_API_URL") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD" }, 405);

  try {
    const { bank, account, holder } = await req.json();
    const acc = String(account ?? "").replace(/[^0-9]/g, "");
    const nm = String(holder ?? "").trim();
    const bk = String(bank ?? "").trim();
    if (!bk || !acc || !nm) {
      return json({ ok: false, code: "MISSING", message: "은행·계좌번호·예금주를 입력하세요." }, 400);
    }

    if (!API_KEY || !API_URL) {
      // 키 미설정 → 프런트가 "준비 중(입력만으로 가입)"으로 폴백
      return json({ ok: false, valid: false, code: "NOT_CONFIGURED" });
    }

    // ===== 실제 실명조회 호출 (계약한 API 규격에 맞게 작성) =====
    //   예시 골격:
    //   const res = await fetch(API_URL, {
    //     method: "POST",
    //     headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    //     body: JSON.stringify({ bankCode: bk, account: acc }),
    //   });
    //   const data = await res.json();
    //   const realName = data.accountHolder ?? "";
    //   const valid = realName.replace(/\s/g, "") === nm.replace(/\s/g, "");
    //   return json({ ok: true, valid, holderName: realName });

    return json({ ok: false, valid: false, code: "NOT_CONFIGURED" });
  } catch (e) {
    return json({ ok: false, code: "ERROR", message: String((e as Error)?.message || e) }, 500);
  }
});
