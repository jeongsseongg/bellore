import { dateTime, field, firstImage, money, numberOrNull, tone } from './admin-operation-model.js?v=20260831-admin-completion-v1';

const WORKFLOW_STATUSES = [
  'reviewing', 'accepted', 'estimated', 'awaiting_intake', 'received', 'inspecting',
  'priced', 'offered', 'listed', 'sold', 'settling', 'settled', 'paid', 'declined', 'cancelled'
];
const INSPECTION_STATUSES = ['pending', 'in_progress', 'passed', 'rejected'];
const TRADE_METHODS = ['', 'visit', 'parcel', 'valex'];

function commonFields() {
  return [
    field('workflow_status', '업무 상태', 'select', { options: WORKFLOW_STATUSES, group: '진행 상태' }),
    field('trade_method', '전달 방법', 'select', { options: TRADE_METHODS, group: '진행 상태' }),
    field('inspection_status', '검수 상태', 'select', { options: INSPECTION_STATUSES, group: '진행 상태' }),
    field('branch_name', '방문 지점', 'text', { group: '일정 · 입고' }),
    field('appointment_at', '방문 예약일시', 'datetime-local', { group: '일정 · 입고' }),
    field('pickup_at', '발렉스 수거일시', 'datetime-local', { group: '일정 · 입고' }),
    field('received_at', '입고일시', 'datetime-local', { group: '일정 · 입고' }),
    field('inspected_at', '검수 완료일시', 'datetime-local', { group: '일정 · 입고' }),
    field('listing_id', '연결 상품 UUID', 'text', { group: '운영 연결' }),
    field('admin_memo', '관리자 메모', 'textarea', { group: '운영 연결' }),
    field('change_reason', '변경 사유', 'textarea', { required: true, group: '변경 기록' })
  ];
}

function numeric(value) {
  return numberOrNull(value);
}

function amount(value) {
  return value === null || value === undefined || value === '' ? '-' : money(value);
}

function saveValues(service, item, values, amountFields) {
  const patch = { ...values };
  amountFields.forEach((key) => { patch[key] = numeric(values[key]); });
  if ('commission_rate' in patch) patch.commission_rate = numeric(patch.commission_rate);
  return service.saveOperation(item, patch);
}

function history(service, item) {
  return service.listOperationEvents(item.id, 50).then((events) => ({ operationEvents: events, operationEventsLoaded: true }));
}

function sub(item) {
  return `${item.customer_name || '고객'} · ${item.receipt_no || item.id}`;
}

export function sellConfigs(service) {
  return {
    consignments: {
      title: '위탁판매 관리', description: '위탁 신청부터 입고·검수·판매·정산까지 한 원장으로 관리합니다.', historyTitle: '위탁판매 변경 이력',
      columns: ['신청', '권장 판매금액', '예상 정산', '입고 · 검수', '접수'],
      filters: [{ name: 'workflow_status', label: '업무 상태', options: WORKFLOW_STATUSES }],
      load: () => service.listRequests('consignment'), loadDetail: (item) => history(service, item),
      filter: (item, filters) => !filters.workflow_status || item.workflow_status === filters.workflow_status,
      row: (item) => ({ id: item.id, title: `${item.brand} ${item.model}`, sub: sub(item), image: firstImage(item),
        cells: [amount(item.advised_amount), amount(item.expected_settlement), `${item.trade_method || '-'} · ${item.inspection_status || 'pending'}`, dateTime(item.created_at)],
        status: tone(item.workflow_status), statusLabel: item.workflow_status, raw: item }),
      fieldGroups: ['진행 상태', '일정 · 입고', '금액 · 정산', '운영 연결', '변경 기록'],
      fields: () => [...commonFields(),
        field('advised_amount', '권장 판매금액', 'number', { min: 0, group: '금액 · 정산' }),
        field('commission_rate', '위탁 수수료율(0~1)', 'number', { min: 0, max: 1, step: 0.01, group: '금액 · 정산' }),
        field('expected_settlement', '예상 정산금액', 'number', { min: 0, group: '금액 · 정산' })],
      save: (item, values) => saveValues(service, item, values, ['advised_amount', 'expected_settlement'])
    },
    purchases: {
      title: '즉시매입 관리', description: '사진 예상가부터 실물검수·감가·최종 매입·입금까지 관리합니다.', historyTitle: '즉시매입 변경 이력',
      columns: ['신청', '사진 예상가', '최종 매입금액', '검수', '접수'],
      filters: [{ name: 'workflow_status', label: '업무 상태', options: WORKFLOW_STATUSES }],
      load: () => service.listRequests('instant'), loadDetail: (item) => history(service, item),
      filter: (item, filters) => !filters.workflow_status || item.workflow_status === filters.workflow_status,
      row: (item) => ({ id: item.id, title: `${item.brand} ${item.model}`, sub: sub(item), image: firstImage(item),
        cells: [amount(item.estimated_amount), amount(item.final_amount), item.inspection_status || 'pending', dateTime(item.created_at)],
        status: tone(item.workflow_status), statusLabel: item.workflow_status, raw: item }),
      fieldGroups: ['진행 상태', '일정 · 입고', '매입 금액', '운영 연결', '변경 기록'],
      fields: () => [...commonFields(),
        field('estimated_amount', '사진 예상가', 'number', { min: 0, group: '매입 금액' }),
        field('deduction_amount', '감가금액', 'number', { min: 0, group: '매입 금액' }),
        field('final_amount', '최종 매입금액', 'number', { min: 0, group: '매입 금액' }),
        field('payment_at', '고객 입금일시', 'datetime-local', { group: '매입 금액' })],
      save: (item, values) => saveValues(service, item, values, ['estimated_amount', 'deduction_amount', 'final_amount'])
    },
    inspections: {
      title: '입고 · 검수', description: '비교견적·위탁판매·즉시매입의 전달 일정과 실물검수를 통합 관리합니다.', historyTitle: '입고·검수 변경 이력',
      columns: ['신청', '판매 방식', '전달', '검수', '입고'],
      filters: [
        { name: 'method', label: '판매 방식', options: ['compare', 'consignment', 'instant'] },
        { name: 'inspection_status', label: '검수 상태', options: INSPECTION_STATUSES }
      ],
      load: () => service.listRequests(), loadDetail: (item) => history(service, item),
      filter: (item, filters) => (!filters.method || item.method === filters.method)
        && (!filters.inspection_status || item.inspection_status === filters.inspection_status),
      row: (item) => ({ id: item.id, title: `${item.brand} ${item.model}`, sub: sub(item), image: firstImage(item),
        cells: [item.method, item.trade_method || '-', item.inspection_status || 'pending', dateTime(item.received_at || item.created_at)],
        status: tone(item.inspection_status), statusLabel: item.inspection_status, raw: item }),
      fieldGroups: ['진행 상태', '일정 · 입고', '운영 연결', '변경 기록'], fields: commonFields,
      save: (item, values) => saveValues(service, item, values, [])
    }
  };
}
