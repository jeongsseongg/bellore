import { dateTime, field, stringArray, tone } from './admin-operation-model.js?v=20260831-admin-completion-v1';

const PRESETS = ['super', 'quote_inspection', 'order_fulfillment', 'content_support', 'custom'];

function presetScopes(preset) {
  return {
    super: ['*'],
    quote_inspection: ['quotes.read', 'quotes.manage', 'sell.inspect', 'sell.manage'],
    order_fulfillment: ['orders.read', 'orders.fulfill', 'returns.manage'],
    content_support: ['content.manage', 'support.manage', 'analytics.read'],
    custom: []
  }[preset] || [];
}

export function permissionConfigs(service, operatorId) {
  return {
    permissions: {
      title: '관리자 권한', description: '운영자별 최소 권한과 활성 상태를 감사기록과 함께 관리합니다.', historyTitle: '관리자 권한 변경 이력',
      columns: ['운영자', '역할 프리셋', '업무 범위', '최근 변경', '상태'],
      load: async () => (await service.listOperators()).map((item) => ({
        ...item,
        scopes_text: (item.scopes?.length ? item.scopes : presetScopes(item.preset)).join('\n'),
        is_self: String(item.profile_id) === String(operatorId)
      })),
      loadDetail: (item) => service.listPermissionEvents(item.profile_id, 50)
        .then((events) => ({ operationEvents: events.map((event) => ({ ...event, action: '관리자 권한 변경' })), operationEventsLoaded: true })),
      row: (item) => ({ id: item.profile_id, title: item.display_name || item.email || '관리자', sub: item.email || '-',
        cells: [item.preset, (item.scopes || presetScopes(item.preset)).join(' · '), dateTime(item.updated_at), item.is_self ? '본인 계정' : (item.active ? '활성' : '중지')],
        status: item.is_self ? 'normal' : tone(item.active ? 'active' : 'inactive'), statusLabel: item.is_self ? '현재 관리자' : (item.active ? 'active' : 'inactive'), raw: item }),
      fieldGroups: ['권한 설정', '변경 기록'],
      fields: (item) => [
        field('preset', '역할 프리셋', 'select', { options: PRESETS, disabled: item?.is_self, group: '권한 설정' }),
        field('scopes_text', '세부 권한(한 줄에 하나)', 'textarea', { disabled: item?.is_self, group: '권한 설정' }),
        field('active', '관리자 권한 활성', 'checkbox', { disabled: item?.is_self, group: '권한 설정' }),
        field('change_reason', '변경 사유', 'textarea', { required: true, disabled: item?.is_self, group: '변경 기록' })
      ],
      save: (item, values) => service.savePermissions(item, { ...values, scopes_text: stringArray(values.scopes_text).join('\n') })
    }
  };
}
