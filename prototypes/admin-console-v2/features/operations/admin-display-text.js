const VALUE_LABELS = Object.freeze({
  pending: '대기', paid: '결제완료', inspecting: '검수중', preparing: '준비중',
  shipping: '배송중', delivered: '배송완료', confirmed: '구매확정',
  cancel_req: '취소요청', cancelled: '취소완료', canceled: '취소완료', refunded: '환불완료',
  requested: '접수', approved: '승인', collecting: '회수중', done: '처리완료', rejected: '거절',
  open: '진행중', closed: '종료', suspended: '정지', awarded: '선택완료',
  scheduled: '예정', live: '진행중', ended: '종료', active: '사용중', inactive: '중지',
  ready: '결제대기', processing: '처리중', completed: '완료', partial_cancelled: '부분취소',
  draft: '임시저장', published: '게시', queued: '발송대기', sent: '발송완료',
  on_sale: '판매중', hidden: '숨김', reserved: '예약', sold: '판매완료', held: '보류', hold: '보류',
  failed: '실패', error: '오류', visible: '노출',
  in_progress: '진행중', passed: '통과', legacy_waived: '기존 상품 인정',
  expected: '입고대기', in_transit: '운송중', available: '보유중',
  returned: '반송', paused: '판매중지',
  all: '전체', adult: '성인', return: '반품', exchange: '교환',
  home: '홈', mypage: '마이페이지',
  amount: '정액 할인', percent: '정률 할인', code: '코드 입력',
  download: '직접 받기', auto: '자동 지급', both: '전체',
  purchase: '상품 구매', commission: '위탁 판매', post: '인사이트', review: '매입 후기',
  customer: '고객', vendor: '견적업체', partner: '공급협력사', admin: '관리자',
  phone: '휴대폰 인증', email: '이메일 인증', business: '사업자 인증', account: '계좌 인증', settlement: '정산', quote: '견적', order: '주문',
  verified: '인증 완료', manual_verified: '관리자 인증', manual_revoked: '관리자 인증 해제',
  succeeded: '성공', suspend: '계정 정지', resume: '계정 재개', delete: '삭제',
  card: '카드', bank_transfer: '계좌이체', transfer: '계좌이체',
  virtual_account: '가상계좌', cash: '현금', tosspay: '토스페이',
  kakaopay: '카카오페이', naverpay: '네이버페이',
  dashboard: '운영 현황', consent: '분석 동의', products: '상품 조회', pages: '화면 조회',
  runtime: '실행 상태', profiles: '고객 분석', conversations: '상담 대화',
  alerts: '알림 후보', knowledge: '전문 지식', prices: '시세 자료',
  team: '팀 메시지', guidelines: '답변 기준',
  reviewing: '검토중', accepted: '접수승인', estimated: '예상가 안내',
  awaiting_intake: '입고대기', received: '입고완료', priced: '가격확정',
  offered: '매입가 제안', listed: '판매중', settling: '정산중', settled: '정산완료',
  declined: '고객거절', visit: '지점 방문', parcel: '택배 발송', valex: '발렉스 방문수거',
  compare: '비교견적', consignment: '위탁판매', instant: '즉시매입',
  super: '최고관리자', quote_inspection: '견적·검수', order_fulfillment: '주문·배송',
  content_support: '콘텐츠·고객센터', custom: '사용자 지정'
});

const FIELD_LABELS = Object.freeze({
  id: '식별번호', status: '상태', order_no: '주문번호', buyer_name: '주문자',
  amount: '결제금액', tracking_no: '운송장번호', courier: '택배사',
  created_at: '등록일시', updated_at: '수정일시', product_name: '상품명',
  product_brand: '브랜드', order_id: '주문번호', rtype: '처리유형', detail: '상세내용',
  reason: '사유', request_no: '신청번호', item_brand: '브랜드', item_name: '모델명',
  item_ref: '레퍼런스', item_detail: '상세정보', customer_contacted: '고객 연락 완료',
  vendor_contacted: '업체 연락 완료', trade_completed: '거래 완료', listing_id: '상품번호',
  brand: '브랜드', model: '모델', bid_count: '입찰수', start_price: '시작가',
  current_price: '현재가', start_at: '시작일시', end_at: '종료일시', title: '제목',
  description: '모델', product_no: '상품번호', reference_no: '레퍼런스',
  sale_price: '할인가', price: '판매가', pack: '구성품', components: '구성품 상세',
  condition: '상태 점수', category: '상품 구분', size_mm: '크기', movement: '무브먼트',
  stamping: '스탬핑', sale_method: '판매방식', detail_desc: '상세설명', subtitle: '설명',
  placement: '노출 위치', link: '연결 주소', sort_order: '노출 순서', active: '노출 여부',
  kind: '유형', code: '쿠폰 코드', discount_type: '할인 방식', discount_value: '할인값',
  max_discount: '최대 할인액', min_order: '최소 사용금액', apply_to: '사용처',
  usage_limit: '전체 발급 한도', per_user_limit: '1인당 한도', expires_at: '만료일시',
  downloadable: '다운로드 허용', auto_grant: '자동 지급', content_kind: '콘텐츠 구분',
  author_name: '작성자', rating: '평점', body: '본문', key: '저장 식별값',
  display_name: '이름', phone: '연락처', account_verified: '정산 계좌 인증',
  company_name: '업체명', biz_verified: '사업자 인증', vip: '우수 견적업체',
  commission_rate: '수수료율', gross_amount: '판매금액', net_amount: '지급액',
  paid_at: '지급일시', memo: '관리자 메모', user: '사용자', sender_role: '작성자 구분',
  is_read: '확인 여부', type: '유형', user_id: '회원번호',
  approval_status: '승인 상태', inspection_status: '검수 상태', sale_status: '판매 운영 상태',
  inventory_status: '재고 상태', display_status: '전시 상태', inventory_location: '현재 위치',
  custody_holder: '보관 담당', inventory_courier: '운송업체', inventory_tracking_no: '운송장번호',
  inventory_receiver: '수령인', inventory_received_at: '수령일시', expected_settlement: '예상 정산금액',
  display_channels: '노출 화면', home_section: '홈 노출 영역', display_sort_order: '노출 순서',
  display_start_at: '노출 시작일시', display_end_at: '노출 종료일시', operation_version: '변경 버전',
  archived_at: '보관일시', archive_reason: '보관 사유', assigned_admin_id: '담당 관리자',
  receipt_no: '접수번호', method: '신청방식', customer_name: '신청자', customer_phone: '연락처',
  item_year: '연식', item_parts: '구성품', item_memo: '신청 메모', workflow_status: '운영 상태',
  trade_method: '거래 방법', branch_name: '방문 지점', appointment_at: '방문 예약일시',
  pickup_at: '수거 예약일시', received_at: '입고일시', inspected_at: '검수 완료일시',
  payment_at: '정산일시', advised_amount: '안내 금액', estimated_amount: '예상 금액',
  deduction_amount: '차감 금액', final_amount: '최종 금액', admin_memo: '관리자 메모',
  profile_id: '관리자 회원번호', preset: '권한 프리셋', scopes: '업무 권한', updated_by: '변경 관리자'
});

export function displayText(value) {
  if (value === true) return '예';
  if (value === false) return '아니오';
  const key = String(value ?? '').trim().toLowerCase();
  return VALUE_LABELS[key] || String(value ?? '');
}

export function displayFieldLabel(key) {
  return FIELD_LABELS[String(key || '')] || '';
}

export function displayDetailValue(key, value) {
  if (String(key).endsWith('_at') && value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('ko-KR');
  }
  return displayText(value);
}
