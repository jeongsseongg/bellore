export function installLegacyPaymentAuth({ window, tokenProvider }) {
  if (!window.NWBackend) throw new Error('PAYMENT_BACKEND_NOT_READY');
  window.NWBackend.paymentAccessToken = tokenProvider;
}
