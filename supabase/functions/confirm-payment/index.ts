// ============================================================
// 벨로르(BELLORE) · 포트원(PortOne V2) 결제 검증 Edge Function
// ------------------------------------------------------------
// 배포:
//   1) Supabase CLI 또는 대시보드로
//   2) PORTONE_API_SECRET 시크릿 등록 (포트원 콘솔 > 결제연동 > API Keys 의 "V2 API Secret")
//        supabase secrets set PORTONE_API_SECRET=xxxxxxxx
//      (선택) supabase secrets set DEPOSIT_RATE=0.10 DEPOSIT_MIN=500000 \
//             DEPOSIT_MAX=5000000 SHIPPING_FEE=35000
//   3) supabase functions deploy confirm-payment --no-verify-jwt
//
// 보안 핵심(억대 거래 필수):
//   - 결제금액·상품가는 프런트가 보낸 값이라 신뢰하지 않는다.
//   - order.listing_id 로 DB의 진짜 시세(listings)를 직접 조회해
//     예약금/전액/배송비/쿠폰할인을 "서버에서 다시 계산"한다.
//   - 포트원 API로 실제 결제건(paymentId)을 조회해 status=PAID 이고
//     결제금액이 서버 재계산값과 정확히 일치할 때만 주문을 확정한다.
//   - 이렇게 해야 "1억 시계를 1,000원에 결제" 같은 금액 위·변조를 차단한다.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = Deno.env.get("PORTONE_API_BASE") ?? "https://api.portone.io";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// 결제 정책 상수 — 프런트(supabase-config.js / payments.js)와 반드시 동일하게 유지.
//   필요 시 secrets 로 덮어쓸 수 있게 env 우선.
const DEPOSIT_RATE = Number(Deno.env.get("DEPOSIT_RATE") ?? "0.10");
const DEPOSIT_MIN = Number(Deno.env.get("DEPOSIT_MIN") ?? "500000");
const DEPOSIT_MAX = Number(Deno.env.get("DEPOSIT_MAX") ?? "5000000");
const SHIPPING_FEE = Number(Deno.env.get("SHIPPING_FEE") ?? "35000");
const PREMIUM_SHIP_THRESHOLD = Number(Deno.env.get("PREMIUM_SHIP_THRESHOLD") ?? "5000000");
// 포인트 적립률 — 결제 확정 금액의 1%(기본). secrets 로 조정 가능. 0 이면 적립 안 함.
const POINT_EARN_RATE = Number(Deno.env.get("POINT_EARN_RATE") ?? "0.01");

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

// payments.js calcDeposit 과 동일한 계산
function calcDeposit(price: number): number {
  let d = Math.round((price * DEPOSIT_RATE) / 1000) * 1000;
  d = Math.max(DEPOSIT_MIN, Math.min(d, DEPOSIT_MAX || price));
  return Math.min(d, price);
}
function calcFull(price: number): number {
  // 기본 무료배송. 프리미엄배송 기준액 이상 고가 상품만 프리미엄배송비 가산.
  return price + (price >= PREMIUM_SHIP_THRESHOLD ? SHIPPING_FEE : 0);
}

// supabase.js couponDiscount 와 동일한 계산
function couponDiscount(c: any, base: number): number {
  base = Number(base) || 0;
  if (!c || base <= 0) return 0;
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return 0;
  if (c.min_order && base < Number(c.min_order)) return 0;
  let d = 0;
  if (c.discount_type === "percent") {
    d = Math.floor((base * (Number(c.discount_value) || 0)) / 100);
    if (c.max_discount) d = Math.min(d, Number(c.max_discount));
  } else {
    d = Number(c.discount_value) || 0;
  }
  return Math.max(0, Math.min(d, base));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    // 포트원: paymentId(=order_no) 로 검증. (구버전 orderId 도 허용)
    const paymentId: string = body.paymentId || body.orderId || "";
    if (!paymentId) return json({ error: "missing_params" }, 400);
    if (!PORTONE_API_SECRET) return json({ error: "not_configured" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) 주문 조회
    const { data: order, error: selErr } = await admin
      .from("orders")
      .select("*")
      .eq("order_no", paymentId)
      .single();

    if (selErr || !order) return json({ error: "order_not_found" }, 404);
    if (order.status === "paid") {
      return json({ ok: true, alreadyPaid: true, order });
    }

    // 2) 서버 측 금액 재계산 (위·변조 방지의 핵심)
    //    - 프런트가 보낸 order.amount / order.product_price 는 신뢰하지 않는다.
    //    - listings 의 실제 가격으로 예약금/전액을 다시 계산한다.
    if (!order.listing_id) {
      return json({ error: "price_unverifiable_no_listing" }, 400);
    }
    const { data: listing, error: lErr } = await admin
      .from("listings")
      .select("price, sale_price")
      .eq("id", order.listing_id)
      .single();
    if (lErr || !listing) return json({ error: "listing_not_found" }, 404);

    // 체크아웃은 정가(price) 기준으로 동작한다(script.js currentProduct.price = price).
    const truePrice = Number(listing.price) || 0;
    if (truePrice <= 0) return json({ error: "invalid_listing_price" }, 400);

    const base =
      order.pay_type === "full" ? calcFull(truePrice) : calcDeposit(truePrice);

    // 3) 쿠폰 할인도 서버에서 재검증 (프런트가 보낸 discount 무시)
    let serverDiscount = 0;
    if (order.coupon_user_id) {
      const { data: uc } = await admin
        .from("user_coupons")
        .select("id, status, user_id, coupons:coupon_id(*)")
        .eq("id", order.coupon_user_id)
        .single();
      const valid =
        uc &&
        uc.status === "active" &&
        uc.user_id === order.customer_id &&
        uc.coupons &&
        (uc.coupons.apply_to === "order" || uc.coupons.apply_to === "both");
      if (valid) serverDiscount = couponDiscount(uc.coupons, base);
    }

    const expected = Math.max(0, base - serverDiscount);

    // 4) 포트원 API로 실제 결제건 조회 (결제금액·상태는 포트원이 진실의 원천)
    const pres = await fetch(
      `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` } },
    );
    const payment = await pres.json();

    if (!pres.ok) {
      return json({ error: "portone_lookup_failed", detail: payment }, 400);
    }

    // 5) 상태/금액 대조 — PAID 이고 실제 결제금액이 서버 재계산값과 일치해야 함
    const paidAmount = Number(payment?.amount?.total ?? payment?.amount ?? -1);
    if (payment?.status !== "PAID") {
      await admin.from("orders").update({ status: "failed" }).eq("id", order.id);
      return json({ error: "not_paid", status: payment?.status }, 400);
    }
    if (paidAmount !== expected) {
      // 금액 위·변조 의심 → 결제 취소 시도 후 실패 처리
      try {
        await fetch(
          `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}/cancel`,
          {
            method: "POST",
            headers: {
              Authorization: `PortOne ${PORTONE_API_SECRET}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ reason: "amount_mismatch_auto_cancel" }),
          },
        );
      } catch (_e) { /* 취소 실패해도 주문은 확정하지 않음 */ }
      await admin.from("orders").update({ status: "failed" }).eq("id", order.id);
      return json({ error: "amount_mismatch", expected, got: paidAmount }, 400);
    }

    // 6) 주문 확정 (서버 재계산값으로 amount/discount 를 정정 저장)
    const method = payment?.method?.type ?? payment?.method?.provider ?? null;
    const receiptUrl = payment?.receiptUrl ?? null;
    const { data: updated } = await admin
      .from("orders")
      .update({
        status: "paid",
        amount: expected,
        discount: serverDiscount,
        method,
        payment_key: paymentId,
        receipt_url: receiptUrl,
        paid_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .select()
      .single();

    // 7) 쿠폰 사용 확정 (결제 성공 시에만)
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

    // 8) 포인트 적립 (결제 확정 금액의 POINT_EARN_RATE) — 실패해도 결제는 성공 처리
    //    profiles.points 를 올리고 point_ledger 에 내역을 남긴다(service_role = RLS 우회).
    let earnedPoints = 0;
    try {
      if (POINT_EARN_RATE > 0 && order.customer_id) {
        earnedPoints = Math.floor(expected * POINT_EARN_RATE);
        if (earnedPoints > 0) {
          const { data: prof } = await admin
            .from("profiles")
            .select("points")
            .eq("id", order.customer_id)
            .single();
          const cur = Number(prof?.points) || 0;
          const next = cur + earnedPoints;
          await admin.from("profiles").update({ points: next }).eq("id", order.customer_id);
          await admin.from("point_ledger").insert({
            user_id: order.customer_id,
            delta: earnedPoints,
            balance_after: next,
            reason: "order_earn",
            order_id: order.id,
          });
        }
      }
    } catch (_e) { /* 포인트 적립 실패는 결제 확정에 영향 주지 않음 */ }

    return json({ ok: true, order: updated, payment, earnedPoints });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
