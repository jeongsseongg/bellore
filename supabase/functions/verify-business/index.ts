// ============================================================
// 벨로르(BELLORE) · 사업자등록 진위확인 Edge Function (국세청 무료 API)
// ------------------------------------------------------------
// 무엇을 하나:
//   - 제휴사가 입력한 (사업자번호 b_no, 개업일 start_dt, 대표자명 p_nm) 을
//     국세청 "사업자등록정보 진위확인" API 로 검증한다.
//   - 통과하면 service_role 로 호출자(로그인 사용자)의 profiles.biz_verified=true 로 설정.
//
// 준비물(무료):
//   1) 공공데이터포털(data.go.kr) 가입 → "국세청_사업자등록정보 진위확인 및 상태조회 서비스" 활용신청
//   2) 발급받은 "일반 인증키(Decoding)" 를 시크릿으로 등록:
//        supabase secrets set NTS_SERVICE_KEY=발급키
//   3) supabase functions deploy verify-business
//
// 키 미설정이면 { ok:false, code:"NOT_CONFIGURED" } 를 돌려주므로
// 프런트는 "관리자 수동 확인"으로 폴백한다.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NTS_SERVICE_KEY = Deno.env.get("NTS_SERVICE_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const { b_no, start_dt, p_nm } = await req.json();
    const bno = String(b_no ?? "").replace(/[^0-9]/g, "");
    const sdt = String(start_dt ?? "").replace(/[^0-9]/g, "");
    const pnm = String(p_nm ?? "").trim();
    if (bno.length !== 10) return json({ ok: false, code: "BAD_BNO", message: "사업자등록번호 10자리를 확인하세요." }, 400);

    if (!NTS_SERVICE_KEY) {
      // 키 미설정 → 프런트가 관리자 수동확인으로 폴백
      return json({ ok: false, valid: false, code: "NOT_CONFIGURED" });
    }

    // 진위확인은 (사업자번호 + 개업일 + 대표자명) 3개가 모두 일치해야 valid="01"
    const url = "https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey="
      + encodeURIComponent(NTS_SERVICE_KEY);
    const ntsRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businesses: [{ b_no: bno, start_dt: sdt, p_nm: pnm }],
      }),
    });
    const data = await ntsRes.json().catch(() => ({}));
    const item = data && data.data && data.data[0];
    const valid = !!item && item.valid === "01";

    if (!valid) {
      return json({
        ok: true, valid: false, code: "MISMATCH",
        message: "사업자번호·개업일·대표자명이 일치하지 않습니다. 다시 확인해주세요.",
        detail: item || null,
      });
    }

    // 통과 → service_role 로 호출자 프로필에 biz_verified 설정
    if (SUPABASE_URL && SERVICE_ROLE) {
      const auth = req.headers.get("Authorization") || "";
      let uid: string | null = null;
      if (auth && ANON_KEY) {
        const asUser = createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: auth } },
        });
        const u = await asUser.auth.getUser();
        uid = u.data?.user?.id ?? null;
      }
      if (uid) {
        const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
        await admin.from("profiles").update({
          biz_verified: true,
          biz_verified_at: new Date().toISOString(),
          business_no: bno,
          biz_open_date: sdt || null,
          ceo_name: pnm || null,
        }).eq("id", uid);
      }
    }

    return json({ ok: true, valid: true });
  } catch (e) {
    return json({ ok: false, code: "ERROR", message: String((e as Error)?.message || e) }, 500);
  }
});
