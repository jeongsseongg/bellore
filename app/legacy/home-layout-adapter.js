import { HOME_LAYOUT_KEY } from '../features/home-layout/home-layout-config.js?v=20260827-home-block-editor-v1';

export function createLegacyHomeLayoutAdapter({ window: win }) {
  return {
    async load() {
      const backend = win.NWBackend;
      if (!backend?.getSiteContent) return null;
      if (backend.ready?.then) await backend.ready;
      const row = await backend.getSiteContent(HOME_LAYOUT_KEY);
      if (!row?.body) return null;
      try { return JSON.parse(row.body); }
      catch (error) {
        console.warn('홈 화면 운영 설정을 해석하지 못했습니다.', error);
        return null;
      }
    }
  };
}
