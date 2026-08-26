import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import { hasRefundablePaymentStatus } from "../_shared/order-payment-states.ts";
import { cancelAndReconcile } from "../_shared/portone-cancellation.ts";

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
    if (!order.payment_key || !Number.isSafeInteger(Number(order.amount)) || !hasRefundablePaymentStatus(order.status)) {
      return json(req, { error: "paid_payment_not_found" }, 409);
    }

    const cancellation = await cancelAndReconcile({
      admin,
      apiBase: PORTONE_API_BASE,
      apiSecret: PORTONE_API_SECRET,
      storeId: PORTONE_STORE_ID,
      paymentId: order.payment_key,
      orderNo,
      orderAmount: Number(order.amount),
      reason,
    });
    if (!cancellation.tracked) {
      return json(req, {
        error: "refund_recovery_not_recorded",
        providerRefunded: cancellation.providerRefunded,
      }, 500);
    }
    if (cancellation.state === "failed") {
      return json(req, { error: "provider_cancel_failed", recoveryTracked: true }, 502);
    }
    if (cancellation.state === "requested") {
      return json(req, {
        ok: true,
        pending: true,
        cancellation: { id: cancellation.cancellationId, status: "REQUESTED" },
      });
    }
    if (!cancellation.dbFinalized) {
      return json(req, { error: "refund_finalize_failed", providerRefunded: true }, 500);
    }
    return json(req, {
      ok: true,
      recovered: cancellation.recovered,
      cancellation: { id: cancellation.cancellationId, status: "SUCCEEDED" },
    });
  } catch (error) {
    console.error("cancel-payment", error instanceof Error ? error.message : String(error));
    return json(req, { error: "server_error" }, 500);
  }
});
