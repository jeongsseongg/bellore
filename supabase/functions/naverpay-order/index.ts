import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MERCHANT_ID = Deno.env.get("NAVERPAY_MERCHANT_ID") ?? "";
const CERTI_KEY = Deno.env.get("NAVERPAY_CERTI_KEY") ?? "";
const BUTTON_KEY = Deno.env.get("NAVERPAY_BUTTON_KEY") ?? "";
const ACCOUNT_ID = Deno.env.get("NAVERPAY_ACCOUNT_ID") ?? "";
const RETURN_ZIPCODE = Deno.env.get("NAVERPAY_RETURN_ZIPCODE") ?? "";
const RETURN_ADDRESS1 = Deno.env.get("NAVERPAY_RETURN_ADDRESS1") ?? "서울특별시 중구 다산로 258";
const RETURN_ADDRESS2 = Deno.env.get("NAVERPAY_RETURN_ADDRESS2") ?? "벨로르";
const SELLER_NAME = Deno.env.get("NAVERPAY_SELLER_NAME") ?? "벨로르";
const SELLER_CONTACT = Deno.env.get("NAVERPAY_SELLER_CONTACT") ?? "01062936668";
const ORDER_API = Deno.env.get("NAVERPAY_ORDER_API")
  ?? "https://test-api.pay.naver.com/o/customer/api/order/v20/register";
const SITE_URL = Deno.env.get("NAVERPAY_SITE_URL") ?? "https://bellore.co.kr";
const SHIPPING_FEE = Number(Deno.env.get("SHIPPING_FEE") ?? "35000");
const PREMIUM_SHIP_THRESHOLD = Number(Deno.env.get("PREMIUM_SHIP_THRESHOLD") ?? "5000000");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(value: unknown) {
  return `<![CDATA[${String(value ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function effectivePrice(listing: any) {
  const price = Number(listing?.price) || 0;
  const sale = Number(listing?.sale_price) || 0;
  const started = listing?.sale_started_at || listing?.created_at;
  const active = Array.isArray(listing?.tags) && listing.tags.includes("sale")
    && started && new Date(started).getTime() + 72 * 60 * 60 * 1000 > Date.now();
  return active && sale > 0 && sale < price ? sale : price;
}

function shippingXml(price: number) {
  if (price >= PREMIUM_SHIP_THRESHOLD) {
    return `<shippingPolicy><groupId>1</groupId><method>DELIVERY</method>`
      + `<feeType>CHARGE</feeType><feePayType>PREPAYED</feePayType>`
      + `<feePrice>${SHIPPING_FEE}</feePrice></shippingPolicy>`;
  }
  return `<shippingPolicy><groupId>1</groupId><method>DELIVERY</method>`
    + `<feeType>FREE</feeType><feePayType>FREE</feePayType><feePrice>0</feePrice>`
    + `</shippingPolicy>`;
}

function productUrl(id: string) {
  return `${SITE_URL}/#p=${encodeURIComponent(id)}`;
}

function productXml(listing: any, includeStock: boolean) {
  const id = String(listing.id);
  const name = `[중고] ${[listing.title, listing.description].filter(Boolean).join(" ")}`.slice(0, 100);
  const price = effectivePrice(listing);
  const image = Array.isArray(listing.image_urls) && listing.image_urls[0]
    ? listing.image_urls[0] : listing.image_url || `${SITE_URL}/assets/og.png`;
  const sold = ["hidden", "sold", "reserved"].includes(String(listing.status || "").toLowerCase());
  return `<product><id>${escapeXml(id)}</id><ecMallProductId>${escapeXml(id)}</ecMallProductId>`
    + `<name>${cdata(name)}</name><basePrice>${price}</basePrice><taxType>TAX</taxType>`
    + `<infoUrl>${cdata(productUrl(id))}</infoUrl><imageUrl>${cdata(image)}</imageUrl>`
    + (includeStock
      ? `<status>${sold ? "NOT_SALE" : "ON_SALE"}</status><stockQuantity>${sold ? 0 : 1}</stockQuantity>`
        + `<supplementSupport>false</supplementSupport><optionSupport>false</optionSupport>`
        + `<returnShippingFee>${price >= PREMIUM_SHIP_THRESHOLD ? SHIPPING_FEE : 0}</returnShippingFee>`
        + `<exchangeShippingFee>${price >= PREMIUM_SHIP_THRESHOLD ? SHIPPING_FEE * 2 : 0}</exchangeShippingFee>`
        + (RETURN_ZIPCODE
          ? `<returnInfo><zipcode>${escapeXml(RETURN_ZIPCODE)}</zipcode>`
            + `<address1>${cdata(RETURN_ADDRESS1)}</address1><address2>${cdata(RETURN_ADDRESS2)}</address2>`
            + `<sellername>${cdata(SELLER_NAME)}</sellername><contact1>${escapeXml(SELLER_CONTACT)}</contact1>`
            + `<contact2>${escapeXml(SELLER_CONTACT)}</contact2></returnInfo>` : "")
      : `<single><quantity>1</quantity></single>`)
    + shippingXml(price) + `</product>`;
}

function configured() {
  return !!(SUPABASE_URL && SERVICE_ROLE && MERCHANT_ID && CERTI_KEY && BUTTON_KEY && ACCOUNT_ID);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);

  if (req.method === "GET" && url.searchParams.get("action") === "config") {
    if (!configured()) return json({ error: "not_configured" }, 503);
    return json({ buttonKey: BUTTON_KEY, accountId: ACCOUNT_ID, version: "2.1", sandbox: true });
  }

  if (!configured()) return json({ error: "not_configured" }, 503);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  if (req.method === "GET") {
    const ids: string[] = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (/^product\[\d+\]\[id\]$/.test(key) && value) ids.push(value);
    }
    if (!ids.length) return new Response("missing product id", { status: 400 });
    const { data, error } = await admin.from("listings").select("*").in("id", ids);
    if (error) return new Response("lookup failed", { status: 500 });
    const xml = `<?xml version="1.0" encoding="utf-8"?><products>`
      + (data ?? []).map((row) => productXml(row, true)).join("") + `</products>`;
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json();
    const listingId = String(body.listingId || "");
    if (!/^[0-9a-f-]{36}$/i.test(listingId)) return json({ error: "invalid_listing_id" }, 400);
    const { data: listing, error } = await admin.from("listings").select("*").eq("id", listingId).single();
    if (error || !listing) return json({ error: "listing_not_found" }, 404);
    if (["hidden", "sold", "reserved"].includes(String(listing.status || "").toLowerCase())) {
      return json({ error: "product_not_available" }, 409);
    }
    const price = effectivePrice(listing);
    if (price <= 0) return json({ error: "invalid_price" }, 400);

    const orderXml = `<?xml version="1.0" encoding="utf-8"?><order>`
      + `<merchantId>${escapeXml(MERCHANT_ID)}</merchantId><certiKey>${escapeXml(CERTI_KEY)}</certiKey>`
      + productXml(listing, false)
      + `<backUrl>${cdata(productUrl(listingId))}</backUrl><interface>`
      + `<salesCode></salesCode><cpaInflowCode>${escapeXml(body.cpaInflowCode)}</cpaInflowCode>`
      + `<naverInflowCode>${escapeXml(body.naverInflowCode)}</naverInflowCode>`
      + `<saClickId>${escapeXml(body.saClickId)}</saClickId>`
      + `<merchantCustomCode1>${escapeXml(listingId)}</merchantCustomCode1>`
      + `<merchantCustomCode2></merchantCustomCode2></interface></order>`;

    const response = await fetch(ORDER_API, {
      method: "POST",
      headers: { "Content-Type": "application/xml; charset=utf-8" },
      body: orderXml,
    });
    const result = (await response.text()).trim();
    if (!response.ok || !result.startsWith("SUCCESS:")) {
      return json({ error: "naver_order_register_failed", detail: result.slice(0, 200) }, 400);
    }
    const parts = result.split(":");
    if (!parts[1] || !parts[2]) return json({ error: "invalid_naver_response" }, 502);
    return json({ ok: true, key: parts[1], merchantNo: parts[2] });
  } catch (error) {
    return json({ error: "server_error", detail: String(error) }, 500);
  }
});
