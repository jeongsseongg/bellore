import { createCheckoutCouponUi } from '../features/checkout/checkout-coupon.js';

export function installLegacyCheckoutCoupon({ windowObject, documentObject }) {
  const api = createCheckoutCouponUi({ documentObject });
  windowObject.BELLORE_CHECKOUT_COUPON_UI = api;
  return api;
}
