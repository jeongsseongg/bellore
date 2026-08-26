const DEFAULT_TIMEOUT_MS = 75_000;

export function createPaymentNetwork({
  fetchImpl,
  AbortControllerImpl,
  setTimer,
  clearTimer,
}) {
  function request(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const bounded = Math.max(1_000, Math.min(90_000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
    const controller = new AbortControllerImpl();
    const timer = setTimer(() => controller.abort(), bounded);
    return Promise.resolve()
      .then(() => fetchImpl(url, { ...options, signal: controller.signal }))
      .finally(() => clearTimer(timer));
  }

  return Object.freeze({ request });
}
