import {
  customerFeedback,
  paymentProviderCustomerFeedback,
} from '../core/customer-error.mjs?v=20260826-payment-recovery-hero-v1';

function warnClassification(logger, feedback) {
  if (feedback.classification === 'safe_customer_message') return;
  if (logger && typeof logger.warn === 'function') logger.warn(feedback.classification);
}

export function installCustomerFeedback({ windowObject = globalThis.window, logger = globalThis.console } = {}) {
  if (!windowObject) return null;

  const api = Object.freeze({
    message(value, contextOrOptions = 'general') {
      const feedback = customerFeedback(value, contextOrOptions);
      warnClassification(logger, feedback);
      return feedback.message;
    },
    paymentProviderFeedback(value) {
      const feedback = paymentProviderCustomerFeedback(value);
      warnClassification(logger, feedback);
      return feedback.message;
    },
  });

  windowObject.BELLORE_CUSTOMER_FEEDBACK = api;
  return api;
}
