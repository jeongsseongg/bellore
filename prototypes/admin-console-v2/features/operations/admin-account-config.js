import { bool, dateTime, field, money, numberOrNull, tone } from './admin-operation-model.js?v=20260826-admin-crud-v1';
import { displayText } from './admin-display-text.js?v=20260826-admin-crud-v1';

function profileConfig(service, role, title) {
  const verificationSpecs = [
    { method: 'email', key: 'email_verified', label: '이메일' },
    { method: 'phone', key: 'phone_verified', label: '휴대폰' },
    ...(role === 'customer' ? [] : [{ method: 'business', key: 'biz_verified', label: '사업자' }]),
    { method: 'account', key: 'account_verified', label: '계좌' }
  ];
  const verificationFields = verificationSpecs
    .map((spec) => field(spec.key, `${spec.label} 인증`, 'checkbox', { disabled: true }));
  const sharedFields = [field('display_name', '이름'), field('phone', '연락처'), field('suspended', '사용정지', 'checkbox', { disabled: true })];
  const roleFields = role === 'customer'
    ? []
    : [field('company_name', '업체명'), field('approved', '운영 승인', 'checkbox')];
  if (role === 'vendor') roleFields.push(field('vip', '우수 견적업체', 'checkbox'));
  if (role === 'partner') roleFields.push(field('commission_rate', '수수료율(0~1)', 'number'));
  return {
    title, description: `${title}의 프로필·승인·인증·정지 상태를 운영 데이터에서 관리합니다.`, columns: ['계정', '연락처', '인증', '가입', '상태'],
    load: () => service.listProfiles(role),
    loadDetail: async (item) => {
      const result = await service.listMemberVerificationEvents(item.id, 30);
      return { verificationEvents: result.events || [], verificationEventsLoaded: true };
    },
    row: (item) => ({ id: item.id, title: item.company_name || item.biz_name || item.display_name || item.username || '이름 없음', sub: item.email || item.username || '-', image: item.logo_url || item.avatar_url || '', cells: [item.phone || '-', [item.email_verified && '이메일', item.phone_verified && '휴대폰', item.biz_verified && '사업자', item.account_verified && '계좌'].filter(Boolean).join(' · ') || '미인증', dateTime(item.created_at), item.suspended ? '사용정지' : (item.approved ? '승인' : '승인대기')], status: item.suspended ? 'danger' : (item.approved ? 'success' : 'attention'), statusLabel: item.suspended ? '정지' : (item.approved ? '운영중' : '대기'), raw: item }),
    fields: () => [...sharedFields, ...roleFields, ...verificationFields],
    save: (item, values) => service.saveProfile(item, role, {
      display_name: values.display_name,
      phone: values.phone,
      ...(role === 'customer' ? {} : { company_name: values.company_name }),
      ...(role === 'customer' ? {} : { approved: bool(values.approved) }),
      ...(role === 'vendor' ? { vip: bool(values.vip) } : {}),
      ...(role === 'partner' ? { commission_rate: numberOrNull(values.commission_rate) } : {})
    }),
    actions: [
      { id: 'approve', label: '운영 승인', when: (item) => role !== 'customer' && !item.approved, reasonPrompt: '운영 승인 근거를 5자 이상 입력해 주세요.', run: (item, input) => service.saveProfile(item, role, { approved: true }, input.reason) },
      { id: 'revoke-approval', label: '승인 취소', when: (item) => role !== 'customer' && item.approved, confirm: '이 계정의 운영 권한을 회수할까요?', reasonPrompt: '승인 취소 사유를 5자 이상 입력해 주세요.', run: (item, input) => service.saveProfile(item, role, { approved: false }, input.reason) },
      { id: 'suspend', label: '계정 정지', danger: true, when: (item) => !item.suspended, confirm: '이 계정을 정지하고 새 로그인을 차단할까요?', reasonPrompt: '계정 정지 사유를 5자 이상 입력해 주세요.', run: (item, input) => service.setMemberSuspended(item, true, input.reason) },
      { id: 'resume', label: '계정 재개', when: (item) => item.suspended, confirm: '이 계정의 로그인을 다시 허용할까요?', reasonPrompt: '계정 재개 사유를 5자 이상 입력해 주세요.', run: (item, input) => service.setMemberSuspended(item, false, input.reason) },
      ...verificationSpecs.flatMap((spec) => [
        { id: `verify-${spec.method}`, label: `${spec.label} 수동 인증`, when: (item) => !item[spec.key], reasonPrompt: `${spec.label} 인증 사유를 5자 이상 입력해 주세요.`, run: (item, input) => service.setMemberVerification(item.id, spec.method, true, input.reason) },
        { id: `revoke-${spec.method}`, label: `${spec.label} 인증 해제`, danger: true, when: (item) => !!item[spec.key], reasonPrompt: `${spec.label} 인증 해제 사유를 5자 이상 입력해 주세요.`, run: (item, input) => service.setMemberVerification(item.id, spec.method, false, input.reason) }
      ]),
      { id: 'delete', label: '회원 계정 삭제', danger: true, confirm: '로그인 계정과 연결 프로필을 삭제합니다. 되돌릴 수 없습니다.', promptText: '삭제', run: (item) => service.deleteMember(item, `${title} 관리자 삭제`) }
    ]
  };
}

export function accountConfigs(service) {
  return {
    customers: profileConfig(service, 'customer', '일반회원'),
    vendors: profileConfig(service, 'vendor', '견적업체'),
    partners: profileConfig(service, 'partner', '공급협력사'),
    settlements: {
      title: '공급대금 관리', description: '판매대금·수수료·지급액·지급 상태를 실제 정산 원장에서 관리합니다.', columns: ['정산', '상품', '판매금액', '지급액', '상태'],
      load: () => service.listSettlements(),
      row: (item) => ({ id: item.id, title: item.product_name || item.listing_id || '정산', sub: item.seller_id || '-', cells: [money(item.gross_amount), money(item.net_amount), item.status || 'pending', dateTime(item.paid_at || item.created_at)], status: tone(item.status), statusLabel: item.status || 'pending', raw: item }),
      fields: () => [field('status', '지급 상태', 'select', { options: ['pending', 'paid', 'hold', 'cancelled'] }), field('memo', '관리자 메모', 'textarea')],
      save: (item, values) => service.updateSettlement(item, values.status, values.memo),
      actions: [
        { id: 'hold', label: '지급 보류', when: (item) => item.status === 'pending', confirm: '이 정산 지급을 보류할까요?', run: (item) => service.updateSettlement(item, 'hold', item.memo) },
        { id: 'resume', label: '지급 대기 재개', when: (item) => ['hold', 'held'].includes(item.status), run: (item) => service.updateSettlement(item, 'pending', item.memo) }
      ]
    },
    support: {
      title: '고객센터', description: '고객별 상담 대화와 연결 견적을 확인하고 실제 답변을 전송합니다.', columns: ['상담', '사용자', '최근 내용', '메시지', '최근 시각'],
      load: () => service.listSupportThreads(),
      row: (item) => ({ id: item.user, title: `상담 ${item.user.slice(0, 8)}`, sub: item.last?.ref_quote || '일반 문의', cells: [item.user, item.last?.body || '-', `${item.count}건`, dateTime(item.last?.created_at)], status: item.last?.sender_role === 'admin' ? 'success' : 'attention', statusLabel: item.last?.sender_role === 'admin' ? '답변함' : '답변대기', raw: item }),
      fields: () => [field('reply', '답변 내용', 'textarea'), field('ref_quote', '연결 견적')],
      save: (item, values) => service.replySupport(item.user, values.reply, values.ref_quote)
    },
    analytics: {
      title: '활동 분석', description: '동의 범위별 방문·조회·검색·전환 집계를 운영 집계에서 조회합니다.', columns: ['분석', '구분', '값', '기간', '상태'], readOnly: true,
      load: async () => {
        const data = await service.loadAnalytics(7);
        return [
          { id: 'dashboard', title: '운영 활동 대시보드', category: '전체', payload: data.dashboard },
          { id: 'consent', title: '분석 동의 집계', category: '동의', payload: data.consent },
          { id: 'products', title: '최근 상품 조회', category: '상품', payload: data.recentProducts },
          { id: 'pages', title: '최근 화면 조회', category: '화면', payload: data.recentPages }
        ];
      },
      row: (item) => ({ id: displayText(item.id), title: item.title, sub: item.category, cells: [item.category, Array.isArray(item.payload) ? `${item.payload.length}건` : (item.payload ? '집계됨' : '데이터 없음'), '최근 7일', item.payload ? '정상' : '확인 필요'], status: item.payload ? 'success' : 'attention', statusLabel: item.payload ? '조회됨' : '없음', raw: item })
    },
    advisor: {
      title: '고객 상담 도우미', description: '고객 상담 도우미의 운영 자료와 실행 상태를 한곳에서 조회합니다.', columns: ['상담 도우미 운영', '구분', '항목', '최근 시각', '상태'], readOnly: true,
      load: async () => {
        const data = await service.loadAdvisor();
        return Object.entries(data).map(([key, value]) => ({ id: key, title: displayText(key), payload: value }));
      },
      row: (item) => ({ id: displayText(item.id), title: item.title, sub: '운영 데이터', cells: [displayText(item.id), Array.isArray(item.payload) ? `${item.payload.length}건` : (item.payload ? '연결됨' : '없음'), '-', item.payload ? '정상' : '확인 필요'], status: item.payload ? 'success' : 'attention', statusLabel: item.payload ? '조회됨' : '없음', raw: item })
    },
    notifications: {
      title: '알림 · 발송', description: '앱 알림 저장 결과를 확인하고 읽음 상태와 기록을 관리합니다.', columns: ['알림', '유형', '내용', '발송', '상태'],
      load: () => service.listNotifications(),
      row: (item) => ({ id: item.id, title: item.title || item.type || '알림', sub: item.user_id || '-', cells: [item.type || '-', item.body || item.title || '-', dateTime(item.created_at), item.is_read ? '읽음' : '미확인'], status: item.is_read ? 'success' : 'attention', statusLabel: item.is_read ? '확인' : '대기', raw: item }),
      fields: () => [field('title', '알림 제목'), field('body', '알림 내용', 'textarea'), field('is_read', '확인 완료', 'checkbox')],
      save: (item, values) => service.updateNotification(item.id, { title: values.title, body: values.body, is_read: bool(values.is_read) }),
      actions: [
        { id: 'read', label: '확인 완료', when: (item) => !item.is_read, run: (item) => service.updateNotification(item.id, { is_read: true }) },
        { id: 'unread', label: '미확인으로 변경', when: (item) => item.is_read, run: (item) => service.updateNotification(item.id, { is_read: false }) },
        { id: 'delete', label: '알림 삭제', danger: true, confirm: '이 알림 기록을 삭제할까요?', promptText: '삭제', run: (item) => service.deleteNotification(item.id) }
      ]
    },
    audit: {
      title: '회원 · 인증 감사기록', description: '고객·업체 계정과 인증 상태의 중요 변경을 서버 감사기록에서 조회합니다.', columns: ['기록', '대상', '작업', '사유', '시각'], readOnly: true,
      load: async () => (await service.listAuditEvents(150)).events || [],
      row: (item) => ({
        id: `${item.source}:${item.id}`,
        title: item.source === 'verification' ? '인증 상태 변경' : '회원 계정 변경',
        sub: item.actor_user_id || '서버 처리',
        cells: [item.target_user_id || '-', displayText(item.action), item.reason || '-', dateTime(item.created_at)],
        status: item.status === 'failed' ? 'danger' : (item.status === 'pending' ? 'attention' : 'success'),
        statusLabel: displayText(item.status),
        raw: item
      })
    }
  };
}
