// ============================================================
// 벨로르(BELLORE) · 토스페이먼츠 결제 승인(검증) Edge Function
// ------------------------------------------------------------
// 배포:
//   1) Supabase CLI 설치 후
//   2) supabase secrets set TOSS_SECRET_KEY=live_gsk_xxx   (라이브 시크릿키)
//      (선택) supabase secrets set DEPOSIT_RATE=0.10 DEPOSIT_MIN=500000 \
//             DEPOSIT_MAX=5000000 SHIPPING_FEE=35000
//   3) supabase functions deploy confirm-payment --no-verify-jwt
//
// 보안 핵심(억대 거래 필수):
//   - 결제금액(amount)·상품가(product_price)는 프런트가 보낸 값이라 신뢰하지 않는다.
//   - order.listing_id 로 DB의 진짜 시세(listings)를 직접 조회해
//     예약금/전액/배송비/쿠폰할인을 "서버에서 다시 계산"한 뒤 결제금액과 대조한다.
//   - 이렇게 해야 "1억 시계를 1,000원에 결제" 같은 금액 위·변조를 차단한다.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOSS_SECRET_KEY = Deno.env.get("TOSS_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// 결제 정책 상수 — 프런트(supabase-config.js / payments.js)와 반드시 동일하게 유지.
//   필요 시 secrets 로 덮어쓸 수 있게 env 우선.
const DEPOSIT_RATE = Number(Deno.env.get("DEPOSIT_RATE") ?? "0.10");
const DEPOSIT_MIN = Number(Deno.env.get("DEPOSIT_MIN") ?? "500000");
const DEPOSIT_MAX = Number(Deno.env.get("DEPOSIT_MAX") ?? "5000000");
const SHIPPING_FEE = Number(Deno.env.get("SHIPPING_FEE") ?? "35000");

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
  return price + SHIPPING_FEE;
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
    const { paymentKey, orderId, amount } = await req.json();
    if (!paymentKey || !orderId || !amount) {
      return json({ error: "missing_params" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) 주문 조회
    const { data: order, error: selErr } = await admin
      .from("orders")
      .select("*")
      .eq("order_no", orderId)
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

    // 4) 결제금액이 서버 재계산값과 일치하는지 확인
    if (Number(amount) !== expected) {
      return json(
        {
          error: "amount_mismatch",
          expected,
          got: Number(amount),
        },
        400,
      );
    }

    // 5) 토스 결제 승인 (실제 결제금액도 토스가 한 번 더 검증)
    const auth = btoa(`${TOSS_SECRET_KEY}:`);
    const tossRes = await fetch(
      "https://api.tosspayments.com/v1/payments/confirm",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paymentKey, orderId, amount: expected }),
      },
    );
    const toss = await tossRes.json();

    if (!tossRes.ok) {
      await admin.from("orders").update({ status: "failed" }).eq("id", order.id);
      return json({ error: "toss_confirm_failed", detail: toss }, 400);
    }

    // 6) 주문 확정 (서버 재계산값으로 amount/discount 를 정정 저장)
    const method = toss.method ?? null;
    const receiptUrl = toss.receipt?.url ?? null;
    const { data: updated } = await admin
      .from("orders")
      .update({
        status: "paid",
        amount: expected,
        discount: serverDiscount,
        method,
        payment_key: paymentKey,
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

    return json({ ok: true, order: updated, payment: toss });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});
