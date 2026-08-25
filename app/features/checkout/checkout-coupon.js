export function createCheckoutCouponUi({ documentObject = document } = {}) {
  const select = () => documentObject.querySelector('#coCouponSelect');
  const clearButton = () => documentObject.querySelector('#coCouponClear');

  function sync() {
    const selected = Boolean(select()?.value);
    const button = clearButton();
    if (!button) return;
    button.hidden = !selected;
    button.disabled = !selected;
  }

  function clear(recalculate) {
    const couponSelect = select();
    if (couponSelect) couponSelect.value = '';
    const message = documentObject.querySelector('#coCouponMsg');
    if (message) {
      message.textContent = '쿠폰 적용을 해제했습니다.';
      message.hidden = false;
      message.className = 'co-coupon-msg ok';
    }
    sync();
    if (typeof recalculate === 'function') recalculate();
    couponSelect?.focus?.();
  }

  return Object.freeze({ sync, clear });
}
