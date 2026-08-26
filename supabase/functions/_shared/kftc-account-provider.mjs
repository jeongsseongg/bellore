const BANK_CODES = new Map([
  ["산업", "002"], ["KDB산업", "002"], ["기업", "003"], ["IBK기업", "003"],
  ["국민", "004"], ["KB국민", "004"], ["수협", "007"], ["SH수협", "007"],
  ["수출입", "008"], ["한국수출입", "008"], ["농협", "011"], ["NH농협", "011"],
  ["지역농협", "012"], ["농축협", "012"], ["우리", "020"], ["SC제일", "023"],
  ["제일", "023"], ["한국씨티", "027"], ["씨티", "027"], ["IM", "031"],
  ["대구", "031"], ["부산", "032"], ["광주", "034"], ["제주", "035"],
  ["전북", "037"], ["경남", "039"], ["새마을금고", "045"], ["MG새마을금고", "045"],
  ["신협", "048"], ["저축", "050"], ["저축은행", "050"], ["산림조합", "064"],
  ["우체국", "071"], ["하나", "081"], ["KEB하나", "081"], ["신한", "088"],
  ["케이", "089"], ["K", "089"], ["카카오", "090"], ["토스", "092"],
]);

function normalizedBankName(value) {
  return String(value ?? "").normalize("NFKC").toUpperCase()
    .replace(/[\s._()-]/g, "").replace(/은행$/u, "").replace(/뱅크$/u, "");
}

export function resolveKftcBankCode(value) {
  const raw = String(value ?? "").trim();
  if (/^\d{3}$/.test(raw)) return raw;
  return BANK_CODES.get(normalizedBankName(raw)) ?? null;
}

export function normalizeAccountHolder(value) {
  return String(value ?? "").normalize("NFKC").toUpperCase().replace(/[\s._()\[\]{}-]/g, "");
}

export function kftcBaseUrl(environment) {
  if (environment === "test") return "https://testapi.openbanking.or.kr";
  if (environment === "production") return "https://openapi.openbanking.or.kr";
  return null;
}

export function createBankTranId(clientUseCode) {
  const prefix = String(clientUseCode ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(prefix)) throw new Error("KFTC_CLIENT_USE_CODE_INVALID");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase();
  return `${prefix}U${suffix}`;
}

export function formatKftcTranDtime(value = new Date()) {
  const kst = new Date(new Date(value).getTime() + (9 * 60 * 60 * 1000));
  return [kst.getUTCFullYear(), String(kst.getUTCMonth() + 1).padStart(2, "0"),
    String(kst.getUTCDate()).padStart(2, "0"), String(kst.getUTCHours()).padStart(2, "0"),
    String(kst.getUTCMinutes()).padStart(2, "0"), String(kst.getUTCSeconds()).padStart(2, "0")].join("");
}

export async function requestKftcClientToken({ fetchFn = fetch, baseUrl, clientId, clientSecret }) {
  const response = await fetchFn(`${baseUrl}/oauth/2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret,
      scope: "oob", grant_type: "client_credentials" }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.access_token) throw new Error("KFTC_TOKEN_FAILED");
  const clientUseCode = String(body.client_use_code ?? "").trim();
  if (!/^[A-Za-z0-9]{10}$/.test(clientUseCode)) throw new Error("KFTC_CLIENT_USE_CODE_MISSING");
  return { accessToken: String(body.access_token), clientUseCode,
    expiresIn: Math.max(60, Number(body.expires_in) || 3600) };
}

export async function lookupKftcAccount({ fetchFn = fetch, baseUrl, accessToken, clientUseCode,
  bankCode, accountNumber, holderInfoType, holderInfo }) {
  const bankTranId = createBankTranId(clientUseCode);
  const tranDtime = formatKftcTranDtime();
  const response = await fetchFn(`${baseUrl}/v2.0/inquiry/real_name`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ bank_tran_id: bankTranId, bank_code_std: bankCode,
      account_num: accountNumber, account_holder_info_type: holderInfoType,
      account_holder_info: holderInfo, tran_dtime: tranDtime }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new Error("KFTC_LOOKUP_FAILED");
  if (body.rsp_code !== "A0000" || body.bank_rsp_code !== "000") {
    return { ok: false, code: "KFTC_LOOKUP_REJECTED", bankTranId };
  }
  const holderName = String(body.account_holder_name ?? "").trim();
  if (!holderName) throw new Error("KFTC_HOLDER_NAME_MISSING");
  return { ok: true, holderName, bankTranId };
}
