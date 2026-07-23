// ============================================================
// 벨로르(BELLORE) · 포트원 V2 결제취소/환불 Edge Function
// ------------------------------------------------------------
// 배포:
//   supabase secrets set PORTONE_API_SECRET=...
//   supabase functions deploy cancel-payment
//   ※ 관리자 인증이 필요하므로 JWT 검증을 유지합니다.
//
// 보안:
//   - 호출자의 JWT를 검증하고 profiles.role = 'admin'인 경우에만 실행합니다.
//   - 결제 ID와 환불 금액은 DB의 서버 확정 주문만 신뢰합니다.
//   - 실제 취소가 완료되기 전에는 주문을 refunded로 변경하지 않습니다.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = Deno.env.get("PORTONE_API_BASE") ?? "https://api.portone.io";
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
    if (!PORTONE_API_SECRET) return json({ error: "not_configured" }, 503);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) 호출자 관리자 인증
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userResult } = await admin.auth.getUser(token);
    const uid = userResult?.user?.id;
    if (!uid) return json({ error: "unauthorized" }, 401);
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", uid)
      .single();
    if (profile?.role !== "admin") return json({ error: "forbidden" }, 403);

    // 2) 서버 확정 주문 조회
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("*")
      .eq("order_no", orderNo)
      .single();
    if (orderError || !order) return json({ error: "order_not_found" }, 404);
    if (order.status === "refunded") {
      return json({ ok: true, alreadyRefunded: true });
    }
    if (!order.payment_key || !order.amount || order.status === "pending") {
      return json({ error: "paid_payment_not_found" }, 400);
    }

    // 3) 포트원 V2를 통한 전액 취소
    const cancelResponse = await fetch(
      `${PORTONE_API_BASE}/payments/${encodeURIComponent(order.payment_key)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `PortOne ${PORTONE_API_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: reason || "고객 요청 환불" }),
      },
    );
    const cancelResult = await cancelResponse.json();
    if (!cancelResponse.ok) {
      return json({ error: "portone_cancel_failed", detail: cancelResult }, 400);
    }

    const cancelStatus = cancelResult?.cancellation?.status ?? "";
    if (cancelStatus === "FAILED") {
      return json({ error: "portone_cancel_failed", detail: cancelResult }, 400);
    }
    if (cancelStatus === "REQUESTED") {
      await admin.from("orders").update({
        status: "refund_pending",
        cancel_reason: reason || order.cancel_reason || "고객 요청 환불",
      }).eq("id", order.id);
      return json({ ok: true, pending: true, cancellation: cancelResult.cancellation });
    }
    if (cancelStatus !== "SUCCEEDED") {
      return json({ error: "unknown_cancel_status", detail: cancelResult }, 400);
    }

    // 4) 취소 성공 후에만 주문 환불 완료, 쿠폰 복구
    await admin.from("orders").update({
      status: "refunded",
      refund_amount: order.amount,
      refunded_at: new Date().toISOString(),
      cancel_reason: reason || order.cancel_reason || "고객 요청 환불",
    }).eq("id", order.id);

    if (order.coupon_user_id) {
      await admin.from("user_coupons")
        .update({ status: "active", used_at: null, order_id: null, used_context: null })
        .eq("id", order.coupon_user_id);
    }

    // 5) 결제로 적립된 포인트 회수. 부가 테이블 미설치 시 환불 자체에는 영향 없음.
    try {
      if (order.customer_id) {
        const { data: ledgerRows } = await admin
          .from("point_ledger")
          .select("delta")
          .eq("order_id", order.id)
          .eq("reason", "order_earn");
        const earned = (ledgerRows ?? []).reduce(
          (sum: number, row: { delta?: number }) => sum + Math.max(0, Number(row.delta) || 0),
          0,
        );
        if (earned > 0) {
          const { data: currentProfile } = await admin
            .from("profiles")
            .select("points")
            .eq("id", order.customer_id)
            .single();
          const next = Math.max(0, (Number(currentProfile?.points) || 0) - earned);
          await admin.from("profiles").update({ points: next }).eq("id", order.customer_id);
          await admin.from("point_ledger").insert({
            user_id: order.customer_id,
            delta: -earned,
            balance_after: next,
            reason: "order_refund",
            order_id: order.id,
          });
        }
      }
    } catch (_error) {
      // 포인트 부가 기능 오류로 실제 결제 취소를 실패 처리하지 않습니다.
    }

    return json({ ok: true, cancellation: cancelResult.cancellation });
  } catch (error) {
    return json({ error: "server_error", detail: String(error) }, 500);
  }
});
