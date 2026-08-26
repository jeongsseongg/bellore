import { dateTime, money } from './admin-operation-model.js?v=20260826-admin-crud-v1';
import { displayText } from './admin-display-text.js?v=20260826-admin-crud-v1';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function metric(label, value, unit, detail, target, tone = 'green') {
  return `<button class="metric-card tone-${tone}" type="button" data-view-target="${target}">
    <span class="metric-main"><b>${value}<small>${unit}</small></b><em>${label}</em></span>
    <span class="metric-delta">${escapeHtml(detail)}</span><span class="metric-arrow">›</span>
  </button>`;
}

function task(label, count, detail, target, level = 'normal') {
  return `<button class="task-row level-${level}" type="button" data-view-target="${target}">
    <span class="task-copy"><b>${escapeHtml(label)}</b><small>${escapeHtml(detail)}</small></span>
    <strong>${count}</strong><span class="task-chevron">›</span>
  </button>`;
}

function flow(title, rows, target) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return `<button class="pipeline-card" type="button" data-view-target="${target}">
    <div class="pipeline-head"><span class="pipeline-name"><b>${escapeHtml(title)}</b></span><span class="pipeline-total">${total}<small>건</small> ›</span></div>
    <div class="live-flow-list">${rows.map((row) => `<span><small>${escapeHtml(row.label)}</small><b>${row.value}</b></span>`).join('')}</div>
  </button>`;
}

function recentRows(data) {
  const orderRows = (data.trade.orders || []).slice(0, 3).map((row) => ({
    stamp: Date.parse(row.updated_at || row.created_at) || 0,
    time: dateTime(row.updated_at || row.created_at), title: row.order_no || row.id,
    description: `주문 상태 ${displayText(row.status || '-')}`, type: '주문', target: 'orders'
  }));
  const quoteRows = (data.trade.quotes || []).slice(0, 3).map((row) => ({
    stamp: Date.parse(row.updated_at || row.created_at) || 0,
    time: dateTime(row.updated_at || row.created_at), title: row.request_no || row.id,
    description: `비교견적 상태 ${displayText(row.status || '-')}`, type: '견적', target: 'quotes'
  }));
  return [...orderRows, ...quoteRows].sort((a, b) => b.stamp - a.stamp).slice(0, 5);
}

function content(data) {
  const metrics = data.trade.metrics;
  const vendorPending = data.profiles.filter((row) => ['vendor', 'partner'].includes(row.role) && !row.approved).length;
  const notificationFailed = data.notifications.filter((row) => ['failed', 'error'].includes(String(row.status || '').toLowerCase())).length;
  const pendingSettlementTotal = data.trade.settlements
    .filter((row) => row.status === 'pending')
    .reduce((sum, row) => sum + Number(row.net_amount || 0), 0);
  const flows = [
    flow('비교견적', [
      { label: '승인대기', value: metrics.quotesPending },
      { label: '제안중', value: metrics.quotesOpen },
      { label: '선택완료', value: data.trade.quotes.filter((row) => row.status === 'awarded').length },
      { label: '종료', value: data.trade.quotes.filter((row) => ['closed', 'done'].includes(row.status)).length }
    ], 'quotes'),
    flow('주문', [
      { label: '결제완료', value: data.trade.orders.filter((row) => row.status === 'paid').length },
      { label: '검수·준비', value: data.trade.orders.filter((row) => ['inspecting', 'preparing'].includes(row.status)).length },
      { label: '배송중', value: data.trade.orders.filter((row) => row.status === 'shipping').length },
      { label: '완료', value: data.trade.orders.filter((row) => row.status === 'delivered').length }
    ], 'orders'),
    flow('판매시계', [
      { label: '판매중', value: data.listings.filter((row) => row.status === 'on_sale').length },
      { label: '예약', value: data.listings.filter((row) => row.status === 'reserved').length },
      { label: '판매완료', value: data.listings.filter((row) => row.status === 'sold').length },
      { label: '숨김', value: data.listings.filter((row) => row.status === 'hidden').length }
    ], 'listings')
  ];
  const recent = recentRows(data);
  return `<div class="overview-hero"><div><span class="eyebrow">운영 홈</span><p class="today-label">${new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full' }).format(new Date())}</p><h1>운영 현황</h1><p class="operator-message">운영 데이터에서 집계한 처리 대기 업무입니다.</p></div><div class="hero-actions"><button class="secondary-button" type="button" data-operation-refresh>새로고침</button><button class="primary-button" type="button" data-view-target="quotes">견적 승인하기</button></div></div>
    <section class="metric-grid" aria-label="운영 핵심 현황">
      ${metric('오늘 접수 주문', metrics.todayOrders, '건', `처리 대기 ${metrics.ordersPending}건`, 'orders', 'dark')}
      ${metric('진행중 비교견적', metrics.quotesOpen, '건', `승인 대기 ${metrics.quotesPending}건`, 'quotes')}
      ${metric('가입 승인 대기', vendorPending, '곳', '업체·공급협력사', 'vendors', 'amber')}
      ${metric('발송 실패 확인', notificationFailed, '건', `알림 이력 ${data.notifications.length}건`, 'notifications', notificationFailed ? 'red' : 'green')}
    </section>
    <div class="overview-columns"><section class="panel task-panel"><div class="panel-heading"><div><span class="eyebrow">처리 대기</span><h2>지금 처리할 일</h2></div><span class="live-label"><i></i> 운영 데이터</span></div><div class="task-columns"><div class="task-group"><h3>승인·응대</h3><div>
      ${task('결제완료 주문 처리', metrics.ordersPending, '결제와 운영 상태를 분리해 확인', 'orders', metrics.ordersPending ? 'urgent' : 'normal')}
      ${task('비교견적 신규 승인', metrics.quotesPending, '사진과 상품정보 확인', 'quotes', metrics.quotesPending ? 'warning' : 'normal')}
      ${task('업체 가입 심사', vendorPending, '사업자 정보와 권한 확인', 'vendors')}
    </div></div><div class="task-group"><h3>회수·정산</h3><div>
      ${task('반품 회수 확인', metrics.returnsPending, '요청·승인·회수 단계', 'returns')}
      ${task('정산 지급 확인', metrics.settlementsPending, `대기 총액 ${money(pendingSettlementTotal)}`, 'settlements')}
      ${task('고객 상담 확인', data.support.length, '최근 문의 대화 묶음', 'support')}
    </div></div></div></section>
    <section class="panel signal-panel"><div class="panel-heading"><div><span class="eyebrow">연결 상태</span><h2>운영 데이터 연결</h2></div></div><div class="signal-body"><div class="signal-score"><strong>${data.sources}</strong><span>연결 데이터 묶음</span></div><div class="signal-list"><div><span>주문·반품</span><b class="ok">연결</b></div><div><span>견적·정산</span><b class="ok">연결</b></div><div><span>회원·업체</span><b class="ok">연결</b></div><div><span>상품·알림</span><b class="ok">연결</b></div></div></div><button class="signal-link" type="button" data-view-target="notifications">알림 상태 자세히 보기 ›</button></section></div>
    <section class="section-block"><div class="section-heading"><div><span class="eyebrow">거래 흐름</span><h2>실제 거래 흐름</h2><p>각 숫자를 누르면 해당 운영 목록으로 이동합니다.</p></div><span class="data-note">운영 데이터 기준</span></div><div class="pipeline-grid">${flows.join('')}</div></section>
    <div class="overview-columns lower-columns"><section class="panel activity-panel"><div class="panel-heading"><div><span class="eyebrow">최근 변경</span><h2>최근 주문·견적</h2></div></div><div class="activity-list">${recent.length ? recent.map((row) => `<button class="activity-row" type="button" data-view-target="${row.target}"><time>${escapeHtml(row.time)}</time><span><b>${escapeHtml(row.title)}</b><small>${escapeHtml(row.description)}</small></span><em>${row.type}</em></button>`).join('') : '<div class="operation-state"><b>최근 운영 기록이 없습니다.</b></div>'}</div></section><section class="panel architecture-panel"><div class="panel-heading"><div><span class="eyebrow">연동 원칙</span><h2>기존 기능과 같은 데이터 기준</h2></div></div><div class="portal-map"><div class="portal-core"><span>벨로르</span><b>공통 인증 · 운영 저장소 · 서버 권한</b></div><div class="portal-lines"></div><div class="portal-nodes"><span>고객</span><span>업체</span><span>파트너스</span><span class="is-current">관리자</span></div></div><p>관리자 화면은 기능을 복제하지 않고 기존 운영 저장소와 서버 기능을 호출합니다.</p></section></div>`;
}

export function renderLiveOverview(state) {
  const loading = state.loading ? '<div class="operation-state"><b>운영 현황을 불러오는 중입니다.</b><span>주문·견적·회원·상품 데이터를 확인하고 있습니다.</span></div>' : '';
  const error = state.error ? `<div class="operation-state is-error"><b>운영 현황을 불러오지 못했습니다.</b><span>${escapeHtml(state.error)}</span><button type="button" data-operation-refresh>다시 시도</button></div>` : '';
  return `<div class="workspace-page overview-page operation-overview" data-page="overview">${loading}${error}${state.data ? content(state.data) : ''}</div>`;
}
