import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";

const PORTONE_API_SECRET = Deno.env.get("PORTONE_API_SECRET") ?? "";
const PORTONE_API_BASE = Deno.env.get("PORTONE_API_BASE") ?? "https://api.portone.io";
const PORTONE_STORE_ID = Deno.env.get("PORTONE_STORE_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

type JsonRecord = Record<string, unknown>;

const ALLOWED_ORIGINS = new Set([
  "https://bellore.co.kr",
  "https://www.bellore.co.kr",
  "http://localhost",
  "http://127.0.0.1",
]);

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin");
  if (!origin) return null;
  try {
    const url = new URL(origin);
    const normalized = `${url.protocol}//${url.hostname}`;
    return ALLOWED_ORIGINS.has(normalized) ? origin : null;
  } catch {
    return null;
  }
}

function headers(req: Request): HeadersInit {
  const origin = allowedOrigin(req);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers(req), "Content-Type": "application/json" },
  });
}

function safeText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

async function lookupProviderPayment(paymentId: string): Promise<JsonRecord | null> {
  const response = await fetch(
    `${PORTONE_API_BASE}/payments/${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: `PortOne ${PORTONE_API_SECRET}` } },
  );
  if (!response.ok) return null;
  try {
    return await response.json() as JsonRecord;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (!allowedOrigin(req)) return new Response(null, { status: 403 });
    return new Response("ok", { headers: headers(req) });
  }
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);
  if (req.headers.get("Origin") && !allowedOrigin(req)) {
    return json(req, { error: "origin_forbidden" }, 403);
  }
  if (!PORTONE_API_SECRET || !PORTONE_STORE_ID || !SUPABASE_URL || !SERVICE_ROLE) {
    return json(req, { error: "server_not_configured" }, 503);
  }

  try {
    const body = await req.json() as JsonRecord;
    const orderNo = safeText(body.orderNo, 160);
    const reason = safeText(body.reason, 300) ?? "administrator_refund";
    if (!orderNo) return json(req, { error: "missing_order_no" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!bearer) return json(req, { error: "unauthorized" }, 401);
    const { data: userResult } = await admin.auth.getUser(bearer);
    const uid = userResult.user?.id;
    if (!uid) return json(req, { error: "unauthorized" }, 401);
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", uid)
      .single();
    if (profile?.role !== "admin") return json(req, { error: "forbidden" }, 403);

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id,order_no,status,amount,payment_key,refund_amount")
      .eq("order_no", orderNo)
      .single();
    if (orderError || !order) return json(req, { error: "order_not_found" }, 404);
    if (order.status === "refunded") {
      return json(req, { ok: true, alreadyRefunded: true });
    }
    const refundableStates = new Set(["paid", "inspecting", "preparing", "cancel_req", "refund_pending"]);
    if (!order.payment_key || !Number.isSafeInteger(Number(order.amount)) || !refundableStates.has(order.status)) {
      return json(req, { error: "paid_payment_not_found" }, 409);
    }

    const finalizeRefund = async (cancellationId: string | null, recovered = false) => {
      const { data: finalized, error: finalizeError } = await admin.rpc("finalize_order_refund_v2", {
        p_order_no: orderNo,
        p_refund_amount: Number(order.amount),
        p_reason: reason,
        p_provider_cancellation_id: cancellationId,
      });
      if (finalizeError || !finalized?.ok) {
        await admin.rpc("mark_order_refund_pending", {
          p_order_no: orderNo,
          p_reason: `provider_refunded_db_finalize_failed:${finalizeError?.message ?? "unknown"}`,
        });
        return json(req, { error: "refund_finalize_failed", providerRefunded: true }, 500);
      }
      return json(req, {
        ok: true,
        recovered,
        alreadyRefunded: Boolean(finalized.alreadyRefunded),
        cancellation: { id: cancellationId, status: "SUCCEEDED" },
      });
    };

    const cancelResponse = await fetch(
      `${PORTONE_API_BASE}/payments/${encodeURIComponent(order.payment_key)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `PortOne ${PORTONE_API_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ storeId: PORTONE_STORE_ID, reason }),
      },
    );
    let cancelPayload: JsonRecord;
    try {
      cancelPayload = await cancelResponse.json() as JsonRecord;
    } catch {
      return json(req, { error: "provider_response_invalid" }, 502);
    }
    if (!cancelResponse.ok) {
      const providerPayment = await lookupProviderPayment(order.payment_key);
      if (providerPayment?.storeId === PORTONE_STORE_ID && providerPayment.status === "CANCELLED") {
        return await finalizeRefund(null, true);
      }
      return json(req, { error: "provider_cancel_failed" }, 502);
    }

    const cancellation = cancelPayload.cancellation && typeof cancelPayload.cancellation === "object"
      ? cancelPayload.cancellation as JsonRecord
      : {};
    const cancelStatus = safeText(cancellation.status, 40);
    const cancellationId = safeText(cancellation.id, 160);
    if (cancelStatus === "FAILED") return json(req, { error: "provider_cancel_failed" }, 409);
    if (cancelStatus === "REQUESTED") {
      const { error } = await admin.rpc("mark_order_refund_pending", {
        p_order_no: orderNo,
        p_reason: `provider_cancel_requested:${cancellationId ?? "pending"}`,
      });
      if (error) return json(req, { error: "refund_pending_record_failed" }, 500);
      return json(req, { ok: true, pending: true, cancellation: { id: cancellationId, status: cancelStatus } });
    }
    if (cancelStatus !== "SUCCEEDED") {
      return json(req, { error: "provider_cancel_status_unknown" }, 409);
    }

    return await finalizeRefund(cancellationId);
  } catch (error) {
    console.error("cancel-payment", error instanceof Error ? error.message : String(error));
    return json(req, { error: "server_error" }, 500);
  }
});
