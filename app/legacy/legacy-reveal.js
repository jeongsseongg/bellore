/* script.js의 window.refreshReveals 호출을 모듈 전환 기간에만 보존한다.
   라우터가 모듈 API를 직접 받게 되면 이 어댑터와 전역을 함께 제거한다. */
export function installLegacyReveal({ window, reveal } = {}) {
  if (!window || typeof reveal?.refresh !== 'function') {
    throw new TypeError('installLegacyReveal requires window and reveal controller');
  }

  const previousDescriptor = Object.getOwnPropertyDescriptor(window, 'refreshReveals');
  const refresh = () => reveal.refresh();
  window.refreshReveals = refresh;

  return {
    destroy() {
      if (window.refreshReveals !== refresh) return;
      if (previousDescriptor) Object.defineProperty(window, 'refreshReveals', previousDescriptor);
      else delete window.refreshReveals;
    }
  };
}
