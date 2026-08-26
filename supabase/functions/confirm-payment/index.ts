// ============================================================
// 벨로르(BELLORE) · 포트원(PortOne V2) 결제 검증 Edge Function
// ------------------------------------------------------------
// 배포:
//   1) Supabase CLI 또는 대시보드로
//   2) PORTONE_API_SECRET 시크릿 등록 (포트원 콘솔 > 결제연동 > API Keys 의 "V2 API Secret")
//        supabase secrets set PORTONE_API_SECRET=xxxxxxxx
//      supabase secrets set PORTONE_STORE_ID=store-... PORTONE_LIVE_CHANNEL_KEYS=channel-key-... SHIPPING_FEE=35000 POINT_EARN_RATE=0
//      여러 운영 채널은 PORTONE_LIVE_CHANNEL_KEYS에 쉼표로 구분한다.
//      배포 전 실제 LIVE 결제 응답의 storeId/currency=KRW/channel.type=LIVE/channel.key를 대조한다.
//   3) supabase functions deploy confirm-payment --no-verify-jwt
//
// 보안 핵심(억대 거래 필수):
//   - 결제금액·상품가는 프런트가 보낸 값이라 신뢰하지 않는다.
//   - order.listing_id 로 DB의 진짜 시세(listings)를 직접 조회해
//     전액/배송비/쿠폰할인을 "서버에서 다시 계산"한다.
//   - 포트원 API로 실제 결제건(paymentId)을 조회해 status=PAID,
//     설정된 storeId, KRW, LIVE 허용 채널이고 결제금액이 서버 재계산값과
//     정확히 일치할 때만 주문을 확정한다.
//   - 이렇게 해야 "1억 시계를 1,000원에 결제" 같은 금액 위·변조를 차단한다.
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = Deno.env.get("PORTONE_API_BASE") ?? "https://api.portone.io";
const PORTONE_STORE_ID = Deno.env.get("PORTONE_STORE_ID") ?? "";
const PORTONE_LIVE_CHANNEL_KEYS = (Deno.env.get("PORTONE_LIVE_CHANNEL_KEYS") ?? "")
  .split(",").map((value) => value.trim()).filter(Boolean);
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// 결제 정책 상수 — 프런트(supabase-config.js / payments.js)와 반드시 동일하게 유지.
const SHIPPING_FEE = Number(Deno.env.get("SHIPPING_FEE") ?? "35000");
const PREMIUM_SHIP_THRESHOLD = Number(Deno.env.get("PREMIUM_SHIP_THRESHOLD") ?? "5000000");
// 환불 쿠폰·포인트가 아직 단일 idempotent DB RPC가 아니므로 신규 적립은
// fail-closed 0%다. 환불 migration과 동시성 검증을 완료한 별도 버전에서만
// 이 gate를 바꾼다. 환경값을 0보다 크게 설정하면 결제 함수가 503으로 멈춘다.
const POINT_EARN_RATE_RAW = (Deno.env.get("POINT_EARN_RATE") ?? "0").trim();
const POINT_EARN_RATE = Number(POINT_EARN_RATE_RAW);
const POINT_EARN_BPS = Math.round(POINT_EARN_RATE * 10000);
const POINT_EARN_RATE_VALID =
  /^[0-9]+(?:\.[0-9]+)?$/.test(POINT_EARN_RATE_RAW) &&
  Number.isFinite(POINT_EARN_RATE) &&
  POINT_EARN_RATE >= 0 &&
  POINT_EARN_RATE <= 0.10 &&
  Math.abs(POINT_EARN_RATE * 10000 - POINT_EARN_BPS) < 1e-9 &&
  POINT_EARN_BPS === 0;

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

function calcFull(price: number): number {
  // 기본 무료배송. 프리미엄배송 기준액 이상 고가 상품만 프리미엄배송비 가산.
  return price + (price >= PREMIUM_SHIP_THRESHOLD ? SHIPPING_FEE : 0);
}

// supabase.js couponDiscount 와 동일한 계산
function couponDiscount(c: any, base: number): number {
  base = Number(base) || 0;
  if (!c || base <= 0) return 0;
  if (c.active !== true) return 0;
  if (c.starts_at && new Date(c.starts_at).getTime() > Date.now()) return 0;
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

function sanitizeAttribution(value: any) {
  if (!value || typeof value !== "object") return null;
  const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v) ? v : null;
  const touch = (v: any) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const allowed = [
      "utm_id", "utm_source", "utm_medium", "utm_campaign", "utm_source_platform", "utm_term", "utm_content",
      "gclid", "dclid", "wbraid", "gbraid", "msclkid", "fbclid", "ttclid",
      "n_media", "n_query", "n_keyword", "n_campaign", "n_campaign_type", "n_ad_group", "n_ad", "n_rank", "n_click_id",
      "referrer_host", "channel",
    ];
    const out: Record<string, string> = {};
    for (const key of allowed) if (typeof v[key] === "string" && v[key].trim()) out[key] = v[key].trim().slice(0, 200);
    return out;
  };
  const recommendation = (v: any) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const short = (x: unknown, max: number) => typeof x === "string" && x.trim()
      ? x.trim().slice(0, max) : null;
    const rank = Math.max(0, Math.min(100, Math.trunc(Number(v.rank) || 0))) || null;
    return {
      request_id: short(v.request_id, 120),
      product_id: uuid(v.product_id),
      surface: short(v.surface, 40),
      rank,
      algorithm_version: short(v.algorithm_version, 80),
      variant: short(v.variant, 80),
      experiment_id: short(v.experiment_id, 80),
      touched_at: short(v.touched_at, 40),
    };
  };
  return {
    event_id: uuid(value.event_id), anonymous_id: uuid(value.anonymous_id), session_id: uuid(value.session_id),
    first_touch: touch(value.first_touch), session_touch: touch(value.session_touch), conversion_touch: touch(value.conversion_touch),
    recommendation: recommendation(value.recommendation),
  };
}

function bearerToken(req: Request): string {
  const match = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

async function canConfirmOrder(
  req: Request,
  admin: any,
  order: any,
  checkoutToken: unknown,
): Promise<boolean> {
  const bearer = bearerToken(req);
  if (order.customer_id && bearer) {
    const { data, error } = await admin.auth.getUser(bearer);
    if (!error && data.user?.id === order.customer_id) return true;
  }

  const token = typeof checkoutToken === "string" ? checkoutToken.trim() : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !order.checkout_token_hash) return false;
  const createdAt = new Date(order.created_at).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > 72 * 60 * 60 * 1000) return false;
  return constantTimeEqual(await sha256Hex(token), String(order.checkout_token_hash));
}

function publicOrder(order: any) {
  return {
    id: order.id,
    order_no: order.order_no,
    listing_id: order.listing_id,
    status: order.status,
    amount: Number(order.amount) || 0,
    discount: Number(order.discount) || 0,
    paid_at: order.paid_at ?? null,
    receipt_url: order.receipt_url ?? null,
  };
}

function publicPayment(payment: any) {
  return {
    status: payment?.status ?? null,
    paymentId: payment?.id ?? payment?.paymentId ?? null,
    method: payment?.method?.type ?? payment?.method?.provider ?? null,
    receiptUrl: payment?.receiptUrl ?? null,
  };
}

function isInventoryFinalizeConflict(error: any): boolean {
  const evidence = [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean).join(" ").toLowerCase();
  return evidence.includes("listing_not_available") ||
    evidence.includes("uq_orders_paid_listing") ||
    (/duplicate key/.test(evidence) && /listing/.test(evidence));
}

// PortOne already approved the charge, but the order cannot be fulfilled or
// finalized. Only the request that atomically claims a still-unpaid order may
// cancel the provider payment. A concurrent successful finalizer wins: after
// reloading paid_at we return that order and never cancel.
async function resolvePaidOrderConflict(
  admin: any,
  order: any,
  paymentId: string,
  reason: string,
  allowAutoCancel = true,
) {
  const { data: claimed, error: claimError } = await admin.from("orders")
    .update({ status: "payment_review" })
    .eq("id", order.id)
    .eq("status", "pending")
    .is("paid_at", null)
    .select("*")
    .maybeSingle();
  if (claimError) throw new Error(`paid_review_claim_failed:${claimError.message}`);

  let reviewOrder = claimed;

  if (!reviewOrder?.id) {
    const { data: latest, error: latestError } = await admin.from("orders")
      .select("*")
      .eq("id", order.id)
      .single();
    if (latestError || !latest) {
      throw new Error(`paid_conflict_reload_failed:${latestError?.message ?? "missing_order"}`);
    }
    if (latest.paid_at) return { state: "settled", order: latest };
    // A local failed/canceled flag is not proof that PortOne canceled the
    // already-observed PAID charge. Reclaim it for verified provider
    // cancellation instead of falsely reporting the money as returned.
    if (["failed", "canceled"].includes(String(latest.status))) {
      const { data: reclaimed, error: reclaimError } = await admin.from("orders")
        .update({ status: "payment_review" })
        .eq("id", order.id)
        .eq("status", latest.status)
        .is("paid_at", null)
        .select("*")
        .maybeSingle();
      if (reclaimError) {
        throw new Error(`paid_review_reclaim_failed:${reclaimError.message}`);
      }
      if (reclaimed?.id) reviewOrder = reclaimed;
      else {
        const { data: raced } = await admin.from("orders")
          .select("*").eq("id", order.id).single();
        if (raced?.paid_at) return { state: "settled", order: raced };
        console.error("[confirm-payment] paid conflict reclaim raced", order.id, reason);
        return { state: "review", order: raced ?? latest };
      }
    } else {
      console.error("[confirm-payment] paid conflict already requires review", order.id, reason, latest.status);
      return { state: "review", order: latest };
    }
  }

  if (!allowAutoCancel) {
    console.error(
      "[confirm-payment] paid provenance conflict requires operator review",
      order.id,
      reason,
    );
    return { state: "review", order: reviewOrder };
  }

  try {
    const cancelResponse = await fetch(
      `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `PortOne ${PORTONE_API_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: `${reason}_auto_cancel` }),
      },
    );
    const cancelResult = await cancelResponse.json().catch(() => null);
    const cancelStatus = cancelResult?.cancellation?.status ?? "";
    if (cancelResponse.ok && cancelStatus === "SUCCEEDED") {
      const { data: failedOrder, error: failedError } = await admin.from("orders")
        .update({ status: "failed" })
        .eq("id", order.id)
        .eq("status", "payment_review")
        .is("paid_at", null)
        .select("*")
        .maybeSingle();
      if (failedError || !failedOrder?.id) {
        console.error(
          "[confirm-payment] paid-conflict cancellation DB reconciliation required",
          order.id,
          reason,
          failedError?.message ?? "state_changed",
        );
        return { state: "review", order: reviewOrder };
      }
      return { state: "canceled", order: failedOrder };
    }
    console.error(
      "[confirm-payment] paid-conflict cancellation requires review",
      order.id,
      reason,
      cancelResponse.status,
      cancelStatus || "unknown",
    );
  } catch (error) {
    console.error(
      "[confirm-payment] paid-conflict cancellation failed",
      order.id,
      reason,
      error instanceof Error ? error.message : String(error),
    );
  }
  return { state: "review", order: reviewOrder };
}

async function respondToPaidOrderConflict(
  admin: any,
  order: any,
  payment: any,
  paymentId: string,
  reason: string,
  details: Record<string, unknown> = {},
  allowAutoCancel = true,
) {
  const resolution = await resolvePaidOrderConflict(
    admin, order, paymentId, reason, allowAutoCancel,
  );
  if (resolution.state === "settled") {
    try {
      const benefits = benefitSummary(
        await reconcilePaidOrderBenefits(admin, resolution.order.id),
      );
      return json({
        ok: true,
        alreadyPaid: true,
        order: publicOrder(resolution.order),
        payment: publicPayment(payment),
        ...benefits,
      });
    } catch (error) {
      console.error(
        "[confirm-payment] concurrent paid benefit reconciliation failed",
        resolution.order.id,
        error instanceof Error ? error.message : String(error),
      );
      return json({
        ok: true,
        alreadyPaid: true,
        order: publicOrder(resolution.order),
        payment: publicPayment(payment),
        earnedPoints: 0,
        benefitsPending: true,
      });
    }
  }
  const terminal = resolution.state === "canceled";
  return json({
    error: `${reason}_payment_${terminal ? "canceled" : "review"}`,
    order: publicOrder(resolution.order),
    payment: publicPayment(payment),
    ...details,
  }, terminal ? 409 : 202);
}

function benefitSummary(value: any) {
  const benefits = value && typeof value === "object" ? value : {};
  const pointsStatus = String(benefits.points_status ?? "unknown");
  const couponStatus = String(benefits.coupon_status ?? "none");
  return {
    earnedPoints: Math.max(0, Math.trunc(Number(benefits.earned_points) || 0)),
    benefitsPending:
      pointsStatus === "profile_missing" ||
      pointsStatus === "legacy_review_required" ||
      couponStatus === "unavailable" ||
      couponStatus === "missing_or_wrong_owner" ||
      couponStatus === "legacy_review_required",
  };
}

async function reconcilePaidOrderBenefits(admin: any, orderId: string) {
  const { data, error } = await admin.rpc("reconcile_existing_paid_order_benefits", {
    p_order_id: orderId,
  });
  if (error || !data?.ok) {
    throw new Error(error?.message ?? "benefit_reconciliation_failed");
  }
  return data;
}

async function validatedRecommendation(admin: any, order: any, attribution: any) {
  const requested = attribution?.recommendation;
  if (!requested?.request_id || !order?.customer_id || !order?.listing_id) return null;
  if (requested.product_id && requested.product_id !== order.listing_id) return null;

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.from("customer_events")
    .select("id,value,created_at")
    .eq("user_id", order.customer_id)
    .eq("product_id", order.listing_id)
    .eq("event_type", "recommendation_click")
    .contains("value", { request_id: requested.request_id })
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data?.length) return null;

  const value = data[0].value && typeof data[0].value === "object" ? data[0].value : {};
  const serverEvent = sanitizeAttribution({
    recommendation: { ...value, product_id: order.listing_id, touched_at: data[0].created_at },
  })?.recommendation;
  if (!serverEvent?.request_id) return null;
  return {
    ...serverEvent,
    verified_event_id: data[0].id,
    outcome_source: "server_verified_paid_order",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    // 포트원: paymentId(=order_no) 로 검증. (구버전 orderId 도 허용)
    const paymentId: string = body.paymentId || body.orderId || "";
    const checkoutToken = body.checkoutToken;
    let attribution = sanitizeAttribution(body.attribution);
    if (!paymentId) return json({ error: "missing_params" }, 400);
    if (!PORTONE_API_SECRET) return json({ error: "not_configured" }, 400);
    if (!POINT_EARN_RATE_VALID) {
      return json({ error: "point_rate_misconfigured" }, 503);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) 주문 조회
    const { data: order, error: selErr } = await admin
      .from("orders")
      .select("*")
      .eq("order_no", paymentId)
      .single();

    if (selErr || !order) return json({ error: "order_not_found" }, 404);
    if (!await canConfirmOrder(req, admin, order, checkoutToken)) {
      return json({ error: "order_not_found" }, 404);
    }
    if (order.paid_at) {
      if (["refunded", "canceled"].includes(order.status)) {
        return json({
          error: "payment_reversed",
          order: publicOrder(order),
        }, 409);
      }
      if (order.status === "refund_pending") {
        return json({
          error: "payment_reversal_pending",
          order: publicOrder(order),
        }, 202);
      }
      try {
        const benefits = benefitSummary(
          await reconcilePaidOrderBenefits(admin, order.id),
        );
        return json({
          ok: true,
          alreadyPaid: true,
          order: publicOrder(order),
          ...benefits,
        });
      } catch (error) {
        console.error(
          "[confirm-payment] paid benefit reconciliation failed",
          error instanceof Error ? error.message : String(error),
        );
        return json({
          ok: true,
          alreadyPaid: true,
          order: publicOrder(order),
          earnedPoints: 0,
          benefitsPending: true,
        });
      }
    }

    // 2) 먼저 PortOne의 실제 상태를 확인한다. 이 콜백 시점에는 외부
    //    결제가 이미 PAID일 수 있으므로, 이후 어떤 검증이 실패하더라도
    //    단순 4xx로 끝내지 않고 payment_review/검증된 취소로 수습한다.
    const pres = await fetch(
      `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
      { headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` } },
    );
    const payment = await pres.json();

    if (!pres.ok) {
      console.error("[confirm-payment] PortOne lookup failed", pres.status);
      return json({ error: "portone_lookup_failed" }, 400);
    }
    if (payment?.status !== "PAID") {
      const terminalFailure = ["FAILED", "CANCELLED"].includes(payment?.status);
      if (terminalFailure) {
        await admin.from("orders").update({ status: "failed" })
          .eq("id", order.id).eq("status", "pending").is("paid_at", null);
      }
      return json(
        {
          error: terminalFailure ? "not_paid" : "payment_pending",
          status: payment?.status,
        },
        terminalFailure ? 400 : 202,
      );
    }
    if (!PORTONE_STORE_ID || payment?.storeId !== PORTONE_STORE_ID) {
      return await respondToPaidOrderConflict(
        admin, order, payment, paymentId, "store_mismatch", {}, false,
      );
    }
    if (String(payment?.currency || "").toUpperCase() !== "KRW") {
      return await respondToPaidOrderConflict(
        admin, order, payment, paymentId, "currency_mismatch", {}, false,
      );
    }
    const channelType = String(payment?.channel?.type || "").toUpperCase();
    const channelKey = String(
      payment?.channel?.key ?? payment?.channel?.channelKey ?? "",
    );
    if (channelType !== "LIVE" || !PORTONE_LIVE_CHANNEL_KEYS.includes(channelKey)) {
      return await respondToPaidOrderConflict(
        admin, order, payment, paymentId, "channel_mismatch", {
          channelType: channelType || null,
        }, false,
      );
    }
    const paidAmount = Number(payment?.amount?.total ?? payment?.amount ?? -1);

    // 3) 서버 측 금액 재계산 (위·변조 방지의 핵심)
    //    - 프런트가 보낸 order.amount / order.product_price 는 신뢰하지 않는다.
    //    - listings의 실제 판매가(유효한 타임세일 포함)로 전액을 다시 계산한다.
    if (!order.listing_id) {
      return await respondToPaidOrderConflict(
        admin, order, payment, paymentId, "price_unverifiable_no_listing",
      );
    }
    const { data: listing, error: lErr } = await admin
      .from("listings")
      .select("price, sale_price, tags, sale_started_at, created_at, status")
      .eq("id", order.listing_id)
      .single();
    if (lErr || !listing) {
      return await respondToPaidOrderConflict(
        admin, order, payment, paymentId, "listing_not_found",
      );
    }
    const listingAvailable = String(listing.status || "").toLowerCase() === "on_sale";

    const listPrice = Number(listing.price) || 0;
    const salePrice = Number(listing.sale_price) || 0;
    const saleBase = listing.sale_started_at || listing.created_at;
    const saleActive =
      Array.isArray(listing.tags) &&
      listing.tags.includes("sale") &&
      !!saleBase &&
      new Date(saleBase).getTime() + 72 * 60 * 60 * 1000 > Date.now();
    const truePrice =
      saleActive && salePrice > 0 && salePrice < listPrice ? salePrice : listPrice;
    if (truePrice <= 0) {
      return await respondToPaidOrderConflict(
        admin, order, payment, paymentId, "invalid_listing_price",
      );
    }

    if (order.pay_type !== "full") {
      return await respondToPaidOrderConflict(
        admin, order, payment, paymentId, "unsupported_pay_type",
      );
    }
    const base = calcFull(truePrice);

    // 4) 쿠폰 할인도 서버에서 재검증 (프런트가 보낸 discount 무시)
    let serverDiscount = 0;
    if (order.coupon_user_id) {
      const { data: uc } = await admin
        .from("user_coupons")
        .select("id, status, user_id, order_id, coupons:coupon_id(*)")
        .eq("id", order.coupon_user_id)
        .single();
      const valid =
        uc &&
        uc.status === "reserved" &&
        uc.user_id === order.customer_id &&
        uc.order_id === order.id &&
        uc.coupons &&
        ["amount", "percent"].includes(uc.coupons.discount_type) &&
        (uc.coupons.apply_to === "order" || uc.coupons.apply_to === "both");
      if (!valid) {
        return await respondToPaidOrderConflict(
          admin, order, payment, paymentId, "coupon_reservation_invalid",
        );
      }
      serverDiscount = couponDiscount(uc.coupons, base);
    }

    const expected = Math.max(0, base - serverDiscount);

    // 5) 상태/금액 대조 — PAID 이고 실제 결제금액이 서버 재계산값과 일치해야 함
    if (paidAmount !== expected) {
      return await respondToPaidOrderConflict(
        admin, order, payment, paymentId, "amount_mismatch",
        { expected, got: paidAmount },
      );
    }

    // Never stop at a stale/local sold check before consulting PortOne: the
    // provider may already have approved the second charge. Resolve that paid
    // conflict through an atomic review claim and verified cancellation.
    if (!listingAvailable) {
      return await respondToPaidOrderConflict(
        admin, order, payment, paymentId, "inventory_unavailable",
      );
    }

    // 6) 주문 확정 + canonical orders.id 귀속 스냅샷을 단일 DB transaction으로 저장
    const method = payment?.method?.type ?? payment?.method?.provider ?? null;
    const receiptUrl = payment?.receiptUrl ?? null;
    const storedAttribution = sanitizeAttribution(order.analytics_attribution);
    const recommendation = await validatedRecommendation(
      admin,
      order,
      storedAttribution?.recommendation?.request_id ? storedAttribution : attribution,
    );
    attribution = { ...(attribution ?? {}), recommendation };
    const { data: finalized, error: finalizeError } = await admin.rpc("analytics_finalize_paid_order_with_benefits", {
      p_order_id: order.id,
      p_amount: expected,
      p_discount: serverDiscount,
      p_method: method,
      p_payment_key: paymentId,
      p_receipt_url: receiptUrl,
      p_attribution: attribution,
      p_point_rate_bps: POINT_EARN_BPS,
    });
    if (finalizeError && isInventoryFinalizeConflict(finalizeError)) {
      return await respondToPaidOrderConflict(
        admin, order, payment, paymentId, "inventory_conflict",
      );
    }
    if (finalizeError || !finalized?.order) {
      console.error("[confirm-payment] finalize failed", finalizeError?.message ?? "missing_order");
      // PortOne is already PAID. A DB error cannot be returned as a bare 500:
      // if the transaction actually committed, reloading paid_at wins; otherwise
      // atomically claim review and cancel only from the still-pending order.
      return await respondToPaidOrderConflict(
        admin, order, payment, paymentId, "order_finalize_failed",
      );
    }
    const updated = finalized.order;
    const benefits = benefitSummary(finalized.benefits);
    if (benefits.benefitsPending) {
      console.error("[confirm-payment] paid benefits require reconciliation", order.id);
    }

    return json({
      ok: true,
      order: publicOrder(updated),
      payment: publicPayment(payment),
      ...benefits,
    });
  } catch (e) {
    console.error("[confirm-payment] request failed", e instanceof Error ? e.message : String(e));
    return json({ error: "server_error" }, 500);
  }
});
