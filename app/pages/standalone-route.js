(function installStandaloneRoute(globalObject) {
  const routes = Object.freeze({
    '/pages/mypage.html': '/pages/mypage/',
    '/pages/orders.html': '/pages/orders',
    '/pages/inquiry.html': '/pages/inquiry',
  });

  function targetFor(locationObject) {
    const cleanPath = routes[locationObject?.pathname || ''];
    if (!cleanPath) return '';
    return `${cleanPath}${locationObject.search || ''}${locationObject.hash || ''}`;
  }

  function settle(locationObject, documentObject) {
    const target = targetFor(locationObject);
    if (target) {
      locationObject.replace(target);
      return { redirected: true, target };
    }
    documentObject?.documentElement?.removeAttribute('data-standalone-route-pending');
    return { redirected: false, target: '' };
  }

  globalObject.BelloreStandaloneRoute = Object.freeze({ targetFor, settle });
  if (globalObject.location && globalObject.document) {
    settle(globalObject.location, globalObject.document);
  }
})(globalThis);
