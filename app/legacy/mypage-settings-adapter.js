const ROLE_KEYS = Object.freeze({
  customer: 'mypage_customer_config',
  vendor: 'mypage_vendor_config',
  admin: 'mypage_admin_config'
});

function parseContent(row) {
  if (!row?.body) return null;
  try {
    const value = JSON.parse(row.body);
    return value && typeof value === 'object' ? value : null;
  } catch (error) {
    console.warn(`마이페이지 운영 설정을 읽지 못했습니다: ${row.key}`, error);
    return null;
  }
}

export function createLegacyMypageSettingsAdapter({ window: win }) {
  async function backend() {
    const service = win.NWBackend;
    if (!service || typeof service.getSiteContent !== 'function') return null;
    if (service.ready && typeof service.ready.then === 'function') await service.ready;
    return service;
  }

  async function loadAll() {
    const service = await backend();
    if (!service) return {};
    const pairs = await Promise.all(Object.entries(ROLE_KEYS).map(async ([role, key]) => {
      try {
        return [role, parseContent(await service.getSiteContent(key))];
      } catch (error) {
        console.warn(`${role} 마이페이지 운영 설정 요청에 실패했습니다.`, error);
        return [role, null];
      }
    }));
    return Object.fromEntries(pairs);
  }

  return { loadAll };
}
