const NAVER_PROFILE_URL = "https://openapi.naver.com/v1/nid/me";
const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function cleanText(value: unknown, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

Deno.serve(async (request) => {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization) || authorization.length > 4096) {
    return json({ error: "invalid_provider_token" }, 401);
  }

  try {
    const response = await fetch(NAVER_PROFILE_URL, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("[naver-login-userinfo] provider_rejected", response.status);
      return json({ error: "provider_rejected" }, response.status === 401 ? 401 : 502);
    }

    const payload = await response.json();
    const profile = payload?.response;
    const subject = cleanText(profile?.id, 128);
    if (payload?.resultcode !== "00" || !subject) {
      console.error("[naver-login-userinfo] invalid_provider_response");
      return json({ error: "invalid_provider_response" }, 502);
    }

    const name = cleanText(profile?.name || profile?.nickname, 100);
    const nickname = cleanText(profile?.nickname || profile?.name, 100);
    const email = cleanText(profile?.email, 320);
    const mobile = cleanText(profile?.mobile, 32);
    const birthyear = cleanText(profile?.birthyear, 4);
    const birthday = cleanText(profile?.birthday, 10);
    const picture = cleanText(profile?.profile_image, 1000);
    return json({
      sub: subject,
      name,
      full_name: name,
      preferred_username: nickname,
      nickname,
      email,
      phone_number: mobile,
      mobile,
      birthyear,
      birthday,
      picture,
      avatar_url: picture,
    });
  } catch (error) {
    console.error("[naver-login-userinfo] request_failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "provider_unavailable" }, 502);
  }
});
