// ============================================================
// 벨로르(BELLORE) · 토스페이먼츠 결제 승인(검증) Edge Function
// ------------------------------------------------------------
// 배포:
//   1) Supabase CLI 설치 후
//   2) supabase secrets set TOSS_SECRET_KEY=test_gsk_xxx   (테스트/라이브 시크릿키)
//   3) supabase functions deploy confirm-payment --no-verify-jwt
//
// 동작:
//   - 클라이언트가 결제창에서 결제 후 successUrl 로 돌아오면
//     { paymentKey, orderId, amount } 를 이 함수로 보냅니다.
//   - DB의 orders(order_no = orderId) 와 금액이 일치하는지 검증한 뒤
//     토스 승인 API 를 호출하고, 성공 시 status=paid 로 갱신합니다.
//   - 금액 위·변조를 막는 핵심 보안 단계입니다.
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
    const { paymentKey, orderId, amount } = await req.json();
    if (!paymentKey || !orderId || !amount) {
      return json({ error: "missing_params" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) 주문 조회 + 금액 검증 (위·변조 방지)
    const { data: order, error: selErr } = await admin
      .from("orders")
      .select("*")
      .eq("order_no", orderId)
      .single();

    if (selErr || !order) return json({ error: "order_not_found" }, 404);
    if (Number(order.amount) !== Number(amount)) {
      return json({ error: "amount_mismatch" }, 400);
    }
    if (order.status === "paid") {
      return json({ ok: true, alreadyPaid: true, order });
    }

    // 2) 토스 결제 승인
    const auth = btoa(`${TOSS_SECRET_KEY}:`);
    const tossRes = await fetch(
      "https://api.tosspayments.com/v1/payments/confirm",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      },
    );
    const toss = await tossRes.json();

    if (!tossRes.ok) {
      await admin.from("orders").update({ status: "failed" }).eq("id", order.id);
      return json({ error: "toss_confirm_failed", detail: toss }, 400);
    }

    // 3) 주문 확정
    const method = toss.method ?? null;
    const receiptUrl = toss.receipt?.url ?? null;
    const { data: updated } = await admin
      .from("orders")
      .update({
        status: "paid",
        method,
        payment_key: paymentKey,
        receipt_url: receiptUrl,
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .select()
      .single();

    // 4) 쿠폰 사용 확정 (결제 성공 시에만)
    if (order.coupon_user_id) {
      await admin
        .from("user_coupons")
        .update({
          status: "used",
          used_at: new Date().toISOString(),
          order_id: order.id,
          used_context: "order",
        })
        .eq("id", order.coupon_user_id)
        .eq("status", "active");
    }

    return json({ ok: true, order: updated, payment: toss });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
