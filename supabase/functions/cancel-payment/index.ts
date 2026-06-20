// ============================================================
// 벨로르(BELLORE) · 토스페이먼츠 결제취소/환불 Edge Function
// ------------------------------------------------------------
// 배포:
//   supabase secrets set TOSS_SECRET_KEY=live_gsk_xxx
//   supabase functions deploy cancel-payment
//   ※ 관리자 인증이 필요하므로 --no-verify-jwt 를 쓰지 않는다(JWT 검증 ON).
//
// 보안:
//   - 호출자의 JWT 를 검증하고, profiles.role = 'admin' 인 경우에만 환불 실행.
//   - 환불 금액은 DB orders.amount(=서버 확정금액) 기준. 프런트 값 불신.
//   - 실제 결제취소는 service_role + TOSS_SECRET_KEY 로 서버에서만 수행.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOSS_SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
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
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { orderNo, reason } = await req.json();
    if (!orderNo) return json({ error: "missing_params" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) 호출자 = 관리자 인증
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: ures } = await admin.auth.getUser(token);
    const uid = ures?.user?.id;
    if (!uid) return json({ error: "unauthorized" }, 401);
    const { data: prof } = await admin
      .from("profiles").select("role").eq("id", uid).single();
    if (!prof || prof.role !== "admin") return json({ error: "forbidden" }, 403);

    // 2) 주문 조회
    const { data: order, error: selErr } = await admin
      .from("orders").select("*").eq("order_no", orderNo).single();
    if (selErr || !order) return json({ error: "order_not_found" }, 404);
    if (order.status === "refunded") {
      return json({ ok: true, alreadyRefunded: true });
    }

    // 3) 결제건이면 토스 취소 (미결제/데모면 DB 상태만 변경)
    if (order.payment_key && TOSS_SECRET_KEY) {
      const auth = btoa(`${TOSS_SECRET_KEY}:`);
      const tossRes = await fetch(
        `https://api.tosspayments.com/v1/payments/${order.payment_key}/cancel`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cancelReason: reason || "관리자 환불" }),
        },
      );
      const toss = await tossRes.json();
      if (!tossRes.ok) {
        return json({ error: "toss_cancel_failed", detail: toss }, 400);
      }
    }

    // 4) 주문 환불 상태로 갱신 + 쿠폰 복구
    await admin.from("orders").update({
      status: "refunded",
      refund_amount: order.amount,
      refunded_at: new Date().toISOString(),
      cancel_reason: reason || order.cancel_reason || "관리자 환불",
    }).eq("id", order.id);

    if (order.coupon_user_id) {
      await admin.from("user_coupons")
        .update({ status: "active", used_at: null, order_id: null, used_context: null })
        .eq("id", order.coupon_user_id);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
