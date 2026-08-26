export const roleContracts = [
  {
    key: 'customer',
    label: '일반고객',
    code: 'customer',
    state: '현재 운영',
    tone: 'blue',
    summary: '구매 · 비교견적 · 위탁 신청 · 관심상품',
    entry: '공개 회원가입',
    boundary: '본인 주문·신청·계정 데이터만'
  },
  {
    key: 'vendor',
    label: '견적업체',
    code: 'vendor',
    state: '현재 운영',
    tone: 'green',
    summary: '승인 후 비교견적 확인 · 금액 제안',
    entry: '업체 회원가입 + 관리자 승인',
    boundary: '업체용 공개 견적과 자기 제안만'
  },
  {
    key: 'partner',
    label: '공급협력사',
    code: 'partner',
    state: '포털 준비',
    tone: 'amber',
    summary: '공급상품 · 인증 · 공급대금 계약 보존',
    entry: '현재 데이터 역할 · 별도 승인 경로',
    boundary: '입찰 권한은 현 코드 충돌 확인 후 확정'
  },
  {
    key: 'admin',
    label: '관리자',
    code: 'admin',
    state: '현재 운영',
    tone: 'dark',
    summary: '전체 운영 · 승인 · 상태변경 · 정산 · 감사',
    entry: '내부 지정 전용',
    boundary: '화면 분리 + 서버 권한·행 단위 보안 필수'
  }
];

export const navGroups = [
  {
    label: '운영',
    items: [
      { id: 'overview', label: '운영 홈', icon: 'home', current: true }
    ]
  },
  {
    label: '거래 운영',
    items: [
      { id: 'orders', label: '주문 관리', icon: 'order', count: 4, current: true },
      { id: 'quotes', label: '비교견적 관리', icon: 'quote', count: 12, current: true },
      { id: 'consignments', label: '위탁판매 관리', icon: 'consign', badge: '확장', planned: true },
      { id: 'purchases', label: '즉시매입 관리', icon: 'bank', badge: '확장', planned: true },
      { id: 'returns', label: '교환 · 반품', icon: 'return', count: 2, current: true }
    ]
  },
  {
    label: '시계 · 상품',
    items: [
      { id: 'listings', label: '판매시계 관리', icon: 'watch', current: true },
      { id: 'inspections', label: '입고 · 검수', icon: 'inspect', badge: '통합', planned: true },
      { id: 'auctions', label: '경매 관제소', icon: 'auction', current: true }
    ]
  },
  {
    label: '고객 · 업체',
    items: [
      { id: 'customers', label: '일반회원', icon: 'customer', current: true },
      { id: 'vendors', label: '견적업체', icon: 'vendor', count: 3, current: true },
      { id: 'mypageSettings', label: '마이페이지 관리', icon: 'home', current: true },
      { id: 'partners', label: '공급협력사', icon: 'partner', count: 2, current: true }
    ]
  },
  {
    label: '정산 · 혜택',
    items: [
      { id: 'settlements', label: '공급대금 관리', icon: 'settlement', count: 3, current: true },
      { id: 'coupons', label: '쿠폰 관리', icon: 'coupon', current: true }
    ]
  },
  {
    label: '고객 경험',
    items: [
      { id: 'support', label: '고객센터', icon: 'support', count: 5, current: true },
      { id: 'advisor', label: 'AI 고객비서', icon: 'ai', current: true },
      { id: 'analytics', label: '활동 분석', icon: 'chart', current: true }
    ]
  },
  {
    label: '홈 · 콘텐츠',
    items: [
      { id: 'homeSettings', label: '홈 화면 관리', icon: 'home', current: true },
      { id: 'banners', label: '배너 관리', icon: 'banner', current: true },
      { id: 'community', label: '인사이트 · 후기', icon: 'support', current: true },
      { id: 'content', label: '사이트 내용 관리', icon: 'building', current: true }
    ]
  },
  {
    label: '시스템',
    items: [
      { id: 'coverage', label: '전체 기능 점검', icon: 'inspect', current: true },
      { id: 'notifications', label: '알림 · 발송', icon: 'notification', count: 1, badge: '후보', planned: true },
      { id: 'audit', label: '감사 로그', icon: 'audit', badge: '설계', planned: true },
      { id: 'permissions', label: '관리자 권한', icon: 'shield', badge: '설계', planned: true }
    ]
  }
];

export const overview = {
  dateLabel: '2026년 8월 26일 수요일',
  operatorMessage: '승인 지연과 발송 실패부터 처리하세요.',
  metrics: [
    { label: '결제 완료 주문', value: '4', unit: '건', delta: '+2', icon: 'order', tone: 'dark', target: 'orders' },
    { label: '진행중 비교견적', value: '12', unit: '건', delta: '72시간 내', icon: 'quote', tone: 'green', target: 'quotes' },
    { label: '가입 승인 대기', value: '3', unit: '곳', delta: '업체 2 · 파트너 1', icon: 'vendor', tone: 'amber', target: 'vendors' },
    { label: '발송 확인 필요', value: '1', unit: '건', delta: '카카오 알림', icon: 'notification', tone: 'red', target: 'notifications' }
  ],
  taskGroups: [
    {
      title: '지금 처리할 일',
      items: [
        { label: '결제완료 주문 운영 승인', count: 4, meta: '가장 오래된 건 38분', level: 'urgent', icon: 'order', target: 'orders' },
        { label: '비교견적 신규 승인', count: 3, meta: '사진·상품정보 확인', level: 'warning', icon: 'quote', target: 'quotes' },
        { label: '업체·공급협력사 가입 심사', count: 3, meta: '사업자·계좌 인증', level: 'normal', icon: 'partner', target: 'vendors' },
        { label: '알림 발송 실패 확인', count: 1, meta: '재시도 전 원인 확인', level: 'danger', icon: 'notification', target: 'notifications' }
      ]
    },
    {
      title: '오늘 마감 예정',
      items: [
        { label: '비교견적 72시간 종료', count: 2, meta: '고객 최종 안내 필요', level: 'warning', icon: 'clock', target: 'quotes' },
        { label: '공급대금 지급 예정', count: 3, meta: '총 24,600,000원', level: 'normal', icon: 'settlement', target: 'settlements' },
        { label: '반품 회수 확인', count: 2, meta: '실물 검수 대기', level: 'normal', icon: 'return', target: 'returns' }
      ]
    }
  ],
  pipelines: [
    {
      title: '비교견적',
      target: 'quotes',
      icon: 'quote',
      total: 18,
      steps: [
        { label: '승인대기', value: 3 },
        { label: '제안중', value: 12 },
        { label: '선택완료', value: 2 },
        { label: '검수·정산', value: 1 }
      ]
    },
    {
      title: '주문',
      target: 'orders',
      icon: 'order',
      total: 11,
      steps: [
        { label: '결제완료', value: 4 },
        { label: '검수·포장', value: 3 },
        { label: '배송중', value: 3 },
        { label: '고객응대 확인', value: 1 }
      ]
    },
    {
      title: '위탁판매',
      target: 'consignments',
      icon: 'consign',
      total: 8,
      planned: true,
      steps: [
        { label: '신청', value: 2 },
        { label: '입고·검수', value: 2 },
        { label: '판매중', value: 3 },
        { label: '정산', value: 1 }
      ]
    }
  ],
  recentActivity: [
    { time: '13:42', actor: '정성호 관리자', action: '비교견적 BQ-240826-018을 승인했습니다.', type: '승인', target: 'quotes' },
    { time: '13:27', actor: '시스템', action: '주문 BE-240826-004 결제를 검증했습니다.', type: '결제', target: 'orders' },
    { time: '13:11', actor: '타임파트너', action: '비교견적에 18,700,000원을 제안했습니다.', type: '견적', target: 'quotes' },
    { time: '12:58', actor: '알림 서비스', action: '고객 카카오 알림 1건이 실패했습니다.', type: '실패', target: 'notifications' }
  ]
};

const watchImage = '../../assets/products/watch-batch-20260821-3/158-pdj96zas81tz/front.webp';

export const moduleViews = {
  orders: {
    eyebrow: '거래 운영', title: '주문 관리', description: '결제 상태와 실제 처리 상태를 분리해 승인·검수·배송·환불을 관리합니다.',
    current: true, primaryAction: '수기 주문 만들기', filters: ['전체 11', '결제완료 4', '검수중 2', '준비중 1', '배송중 3', '취소요청 1'],
    capabilities: ['주문·고객·상품 정보', '결제 검증·결제금액', '운영 승인·처리 상태', '택배사·운송장·배송 조회', '취소·환불 요청과 처리금액', '관리자 메모', '상태별 목록·검색'],
    columns: ['주문', '상품 · 고객', '결제', '업무 상태', '배송', '최근 변경'],
    rows: [
      { id: 'BE-240826-004', image: watchImage, title: '롤렉스 서브마리너 데이트 41mm', sub: '김도윤 · 010-42**-18**', cells: ['18,920,000원 · 결제검증', '운영 승인 대기', '발송 전', '13:27'], status: 'attention', statusLabel: '처리 필요', caseType: 'order' },
      { id: 'BE-240826-003', image: watchImage, title: '오메가 스피드마스터 문워치', sub: '박서연 · 010-91**-32**', cells: ['9,680,000원 · 결제완료', '검수중', '발송 전', '12:46'], status: 'progress', statusLabel: '진행중', caseType: 'order' },
      { id: 'BE-240825-021', title: '까르띠에 산토스 미디움', sub: '이정민 · 010-20**-77**', cells: ['8,430,000원 · 결제완료', '배송중', 'CJ · 6891-****', '11:09'], status: 'success', statusLabel: '정상', caseType: 'order' },
      { id: 'BE-240825-018', title: '태그호이어 까레라 크로노그래프', sub: '윤지호 · 010-66**-90**', cells: ['5,720,000원 · 취소요청', '고객응대 확인', '회수 전', '09:18'], status: 'danger', statusLabel: '확인 필요', caseType: 'order' }
    ]
  },
  quotes: {
    eyebrow: '시계 판매', title: '비교견적 관리', description: '승인부터 72시간 제안, 고객 선택, 실물검수와 거래 완료까지 한 건으로 관리합니다.',
    current: true, primaryAction: '관리자 견적 등록', filters: ['전체 18', '승인대기 3', '진행중 12', '선택완료 2', '정지 1'],
    capabilities: ['신청 사진·브랜드·모델·참조번호', '연식·상태·구성품·고객 메모', '승인·거부·진행 정지', '72시간 진행·조회수', '업체별 복수 금액 제안', '고객 견적 선택', '방문·수거·입고·실물검수', '최종 매입금액·정산 상태', '고객·업체 연락 기록', '관리자 견적 등록'],
    columns: ['견적', '시계 · 신청자', '남은 시간', '제안 현황', '후속 처리', '최근 변경'],
    rows: [
      { id: 'BQ-240826-018', image: watchImage, title: '롤렉스 GMT-마스터 II', sub: '홍길동 · 일반고객', cells: ['71:22:16', '0건 · 승인 전', '사진·정보 검토', '13:42'], status: 'attention', statusLabel: '승인대기', caseType: 'quote' },
      { id: 'BQ-240826-014', title: '오데마 피게 로열오크 41mm', sub: '김민수 · 업체 신청', cells: ['18:04:31', '5건 · 최고 38,500,000원', '고객 선택 대기', '13:11'], status: 'progress', statusLabel: '제안중', caseType: 'quote' },
      { id: 'BQ-240825-066', title: '롤렉스 데이토나 세라믹', sub: '정은비 · 일반고객', cells: ['마감', '4건 · 선택 31,200,000원', '방문 예약', '11:36'], status: 'success', statusLabel: '선택완료', caseType: 'quote' },
      { id: 'BQ-240825-052', title: '파텍 필립 아쿠아넛', sub: '이현우 · 일반고객', cells: ['정지', '2건 · 최고 51,000,000원', '관리자 확인', '10:02'], status: 'danger', statusLabel: '정지', caseType: 'quote' }
    ]
  },
  consignments: {
    eyebrow: '시계 판매', title: '위탁판매 관리', description: '신청·수거·입고·검수·가격합의·판매·정산 상태를 위한 확장 화면입니다.',
    planned: true, notice: '현재 운영 코드에 독립된 위탁 관리자 화면이 없어, 기존 신청 흐름을 삭제하지 않고 새 상태 모델만 시안에 반영했습니다.',
    primaryAction: '위탁 신청 등록', filters: ['전체 8', '신청 2', '입고·검수 2', '판매중 3', '정산 1'],
    columns: ['위탁', '시계 · 위탁자', '현재 단계', '판매 희망가', '담당', '최근 변경'],
    rows: [
      { id: 'CS-240826-008', image: watchImage, title: '롤렉스 데이저스트 36mm', sub: '최수진 · 일반고객', cells: ['입고 예약', '11,500,000원', '감정팀', '12:31'], status: 'attention', statusLabel: '일정 확인', caseType: 'consignment' },
      { id: 'CS-240825-041', title: '오메가 씨마스터 다이버 300M', sub: '주식회사 타임랩 · 공급협력사', cells: ['판매중', '6,900,000원', '상품팀', '10:24'], status: 'success', statusLabel: '노출중', caseType: 'consignment' }
    ]
  },
  purchases: {
    eyebrow: '시계 판매', title: '즉시매입 관리', description: '접수·상담·입고·실물검수·최종 매입금액·고객 정산을 한 건으로 관리하는 확장 화면입니다.',
    planned: true, notice: '현재 고객 화면에는 즉시매입 선택이 있지만 운영 데이터에 판매방식이 구분 저장되지 않아 실제 건을 독립 조회할 수 없습니다. 기존 접수는 유지하고 저장 계약을 확정한 뒤 연결합니다.',
    primaryAction: '즉시매입 접수 등록', filters: ['전체 6', '상담대기 2', '입고예약 1', '실물검수 2', '정산대기 1'],
    columns: ['매입', '시계 · 신청자', '현재 단계', '예상 금액', '다음 작업', '최근 변경'],
    rows: [
      { id: 'DP-240826-006', image: watchImage, title: '롤렉스 익스플로러 I 36mm', sub: '김서준 · 일반고객', cells: ['상담대기', '8,300,000원', '사진·구성품 확인', '13:06'], status: 'attention', statusLabel: '확인 필요', caseType: 'purchase' },
      { id: 'DP-240825-024', title: '브라이틀링 내비타이머 B01', sub: '와치밸류 강남 · 견적업체', cells: ['실물검수', '7,100,000원', '최종 매입금액 확정', '10:41'], status: 'progress', statusLabel: '검수중', caseType: 'purchase' }
    ]
  },
  returns: {
    eyebrow: '고객 응대', title: '교환 · 반품', description: '신청 사유, 회수, 실물검수, 환불 상태를 단계별로 확인합니다.',
    current: true, filters: ['전체 2', '회수중 1', '검수중 1', '처리완료 0'],
    capabilities: ['주문·고객·상품 확인', '교환·반품 사유', '회수 접수·운송 상태', '입고·실물검수 결과', '환불 상태·처리금액', '고객응대 메모'],
    columns: ['접수', '주문 · 고객', '사유', '회수 상태', '환불 상태', '최근 변경'],
    rows: [
      { id: 'RT-240826-002', title: 'BE-240825-018 · 윤지호', sub: '단순 변심', cells: ['착용감 상이', '회수 접수', '환불 대기', '12:08'], status: 'attention', statusLabel: '회수중', caseType: 'return' },
      { id: 'RT-240825-011', title: 'BE-240824-009 · 장민정', sub: '상품 상태 문의', cells: ['외관 확인 요청', '입고 완료', '검수 대기', '09:42'], status: 'progress', statusLabel: '검수중', caseType: 'return' }
    ]
  },
  listings: {
    eyebrow: '상품 관리', title: '판매시계 관리', description: '벨로르 판매 상품의 구조화 정보, 가격, 이미지, 노출과 판매상태를 관리합니다.',
    current: true, primaryAction: '판매시계 등록', filters: ['전체 158', '판매중 146', '판매완료 8', '숨김 4'],
    notice: '이번 주 특별가·새로워진 가격·최근 등록·추천 매물은 상품 정보에서 자동 구성됩니다. 상품 상세에서 포함 여부와 이유를 함께 확인합니다.',
    capabilities: ['브랜드·모델·상품번호·참조번호', '정상가·할인가·할인 시작일', '판매중·판매완료·숨김 상태', '상태점수·연식·크기·다이얼·소재', '무브먼트·케이스·밴드·상태 메모', '판매방식·배송정보·보증·다이아', '박스·케이스·보증서 구성품', '특별가·신상품·오늘의 시계 표시', '상품 사진 최대 10장·순서·삭제', '홈 영역 포함 이유 미리보기', '등록·수정·삭제'],
    columns: ['상품번호', '상품', '판매가', '상태 · 구성', '노출', '최근 변경'],
    rows: [
      { id: 'ROL-N26826-1', image: watchImage, title: '롤렉스 서브마리너 데이트 41mm', sub: 'Ref. 126610LN · 9점', cells: ['18,920,000원', '풀세트 · 검수완료', '판매중', '13:02'], status: 'success', statusLabel: '정상', caseType: 'listing' },
      { id: 'OME-N25825-4', title: '오메가 스피드마스터 문워치', sub: 'Ref. 310.30.42.50.01.002 · 8점', cells: ['9,680,000원', '박스·보증서', '판매중', '11:28'], status: 'success', statusLabel: '정상', caseType: 'listing' },
      { id: 'CAR-N24821-2', title: '까르띠에 산토스 미디움', sub: 'Ref. WSSA0029 · 8점', cells: ['8,430,000원', '정보 확인 1건', '숨김', '09:54'], status: 'attention', statusLabel: '확인 필요', caseType: 'listing' }
    ]
  },
  inspections: {
    eyebrow: '상품 검수', title: '입고 · 검수', description: '고가 시계 한 건을 수거부터 정품·상태 진단, 촬영, 가격 확정까지 추적하는 확장 화면입니다.',
    planned: true, notice: '현재는 견적·주문·상품 화면에 검수 정보가 흩어져 있습니다. 새 화면은 이를 케이스 파일로 묶기 위한 통합 슬롯입니다.',
    filters: ['전체 7', '입고예정 2', '정품감정 2', '컨디션진단 2', '촬영대기 1'],
    columns: ['케이스', '시계 · 소유자', '입고', '진단', '다음 작업', '담당'],
    rows: [
      { id: 'IN-240826-019', image: watchImage, title: '롤렉스 GMT-마스터 II', sub: 'BQ-240825-066 · 정은비', cells: ['오늘 16:00 방문', '대기', '접수·봉인 확인', '감정팀 A'], status: 'attention', statusLabel: '입고예정', caseType: 'inspection' },
      { id: 'IN-240826-015', title: '오데마 피게 로열오크', sub: 'CS-240825-041 · 타임랩', cells: ['입고완료', '컨디션 진단중', '무브먼트 확인', '감정팀 B'], status: 'progress', statusLabel: '진단중', caseType: 'inspection' }
    ]
  },
  auctions: {
    eyebrow: '경매 운영', title: '경매 관제소', description: '경매 예약, 실시간 진행, 입찰 현황과 고객 예치금을 관리합니다.',
    current: true, primaryAction: '경매 만들기', filters: ['전체 6', '예약 2', '진행중 1', '종료 3'],
    capabilities: ['경매 상품·대표 이미지', '시작가·최소 입찰 단위', '시작·종료 일정', '입찰 현황·최고가', '마감 연장·종료·취소', '고객 예치금 확인'],
    columns: ['경매', '상품', '시작가', '현재 입찰', '일정', '상태'],
    rows: [
      { id: 'AC-240826-006', image: watchImage, title: '롤렉스 데이토나 116500LN', sub: '온라인 실시간 경매', cells: ['26,000,000원', '31,400,000원 · 18회', '오늘 20:00 종료', '진행중'], status: 'danger', statusLabel: '진행 중', caseType: 'auction' },
      { id: 'AC-240827-007', title: '파텍 필립 노틸러스', sub: '예약 경매', cells: ['48,000,000원', '입찰 전', '내일 19:00', '예약'], status: 'normal', statusLabel: '예정', caseType: 'auction' }
    ]
  },
  customers: {
    eyebrow: '회원 관리', title: '일반회원', description: '구매·판매 신청·상담 이력을 회원 단위로 확인합니다.',
    current: true, filters: ['전체 1,284', '구매회원 219', '판매신청 108', '우수회원 34', '확인필요 2'],
    capabilities: ['이름·이메일·휴대폰', '가입일·회원등급·포인트', '주문·결제·배송 이력', '비교견적·판매 신청 이력', '쿠폰·관심·알림 상태', '계좌·본인확인 상태', '계정 정지·프로필 삭제'],
    columns: ['회원', '연락처', '주문', '판매 신청', '등급', '최근 활동'],
    rows: [
      { id: 'CU-00821', title: '김도윤', sub: '가입 2026.04.18', cells: ['kimd****@naver.com', '3건 · 42,800,000원', '비교견적 1건', '우수회원', '13:27'], status: 'success', statusLabel: '정상', caseType: 'customer' },
      { id: 'CU-01194', title: '정은비', sub: '가입 2026.07.02', cells: ['eunb****@gmail.com', '0건', '비교견적 2건', '일반', '11:36'], status: 'normal', statusLabel: '일반', caseType: 'customer' }
    ]
  },
  vendors: {
    eyebrow: '업체 관리', title: '견적업체', description: '사업자 인증, 승인, 견적 참여와 계정 상태를 관리합니다.',
    current: true, filters: ['전체 42', '승인 39', '승인대기 2', '정지 1'],
    capabilities: ['상호·대표·담당자·연락처', '사업자·계좌 인증', '가입 승인·거부·정지', '비교견적 참여·제안 이력', '낙찰·정산 예정 내역', '새 견적 알림 설정'],
    columns: ['업체', '사업자 · 담당자', '인증', '견적 참여', '계정 상태', '최근 변경'],
    rows: [
      { id: 'VN-0042', title: '타임파트너', sub: '홍길동 대표 · 010-88**-11**', cells: ['123-45-*****', '사업자·계좌 완료', '이번달 28건', '승인대기', '12:54'], status: 'attention', statusLabel: '심사 필요', caseType: 'vendor' },
      { id: 'VN-0008', title: '와치밸류 강남', sub: '김영수 담당 · 010-44**-09**', cells: ['418-10-*****', '전체 인증 완료', '이번달 51건', '승인', '11:03'], status: 'success', statusLabel: '운영중', caseType: 'vendor' }
    ]
  },
  partners: {
    eyebrow: '공급협력사 관리', title: '공급협력사', description: '공급 계약, 회사·담당자, 인증, 수수료와 공급대금 상태를 관리합니다.',
    current: true, notice: '공급협력사 역할은 현재 데이터·정산 계약에 존재하지만, 전용 파트너스 화면과 견적 제안 권한은 별도 검증 후 연결합니다.',
    capabilities: ['회사·담당자·사업자 정보', '회사·대표·사업자·계좌 4단계 인증', '승인·정지 상태', '공급상품 목록·판매상태', '수수료율', '공급대금 원장·계좌', '상품등록 권한 충돌 점검'],
    filters: ['전체 8', '승인 6', '승인대기 1', '계약확인 1'],
    columns: ['회사', '담당자 · 사업자', '인증', '공급상품', '수수료', '상태'],
    rows: [
      { id: 'PT-0008', title: '주식회사 타임랩', sub: '이수현 · 214-88-*****', cells: ['4종 완료', '12개 · 판매중 8', '10%', '승인대기'], status: 'attention', statusLabel: '심사 필요', caseType: 'partner' },
      { id: 'PT-0003', title: '에버워치', sub: '박준호 · 110-86-*****', cells: ['4종 완료', '21개 · 판매중 17', '8%', '승인'], status: 'success', statusLabel: '운영중', caseType: 'partner' }
    ]
  },
  settlements: {
    eyebrow: '정산 관리', title: '공급대금 관리', description: '공급협력사별 판매대금, 수수료, 지급상태와 관리자 메모를 관리합니다.',
    current: true, filters: ['전체 16', '지급대기 3', '입금완료 13'],
    capabilities: ['공급협력사·판매상품', '총 판매금액', '수수료율·수수료액', '최종 지급액', '지급 계좌', '지급대기·입금완료 상태', '지급일·관리자 메모'],
    columns: ['정산', '회사 · 상품', '판매금액', '수수료', '지급액', '지급 상태'],
    rows: [
      { id: 'ST-240826-016', title: '주식회사 타임랩', sub: '롤렉스 데이저스트 36mm', cells: ['12,800,000원', '1,280,000원 · 10%', '11,520,000원', '지급대기'], status: 'attention', statusLabel: '승인 필요', caseType: 'settlement' },
      { id: 'ST-240825-015', title: '에버워치', sub: '오메가 씨마스터 다이버 300M', cells: ['7,400,000원', '592,000원 · 8%', '6,808,000원', '입금완료'], status: 'success', statusLabel: '완료', caseType: 'settlement' }
    ]
  },
  coupons: {
    eyebrow: '혜택 관리', title: '쿠폰 관리', description: '자동지급, 코드입력, 이미지 다운로드형 쿠폰을 만들고 상태를 관리합니다.',
    current: true, primaryAction: '새 쿠폰 만들기', filters: ['전체 7', '자동지급 2', '코드입력 3', '이미지 2'],
    capabilities: ['가입 자동지급·쿠폰번호·이미지 다운로드 유형', '쿠폰 이름·코드', '정액·정률 할인', '정률 최대 할인액·최소 사용금액', '구매결제·위탁수수료 사용처', '쿠폰 이미지·미리보기·공유 링크', '1인당 보유 수·전체 발급 수량', '만료일·활성 여부', '등록·수정·삭제'],
    columns: ['쿠폰', '유형', '혜택', '사용 조건', '발급 · 사용', '상태'],
    rows: [
      { id: 'CP-WELCOME', title: '신규회원 1만원', sub: '회원가입 자동지급', cells: ['자동지급', '10,000원', '100만원 이상', '284 · 31', '사용중'], status: 'success', statusLabel: '활성', caseType: 'coupon' },
      { id: 'CP-AUGUST', title: '8월 시계 기획전', sub: '코드 AUGWATCH', cells: ['코드입력', '3%', '최대 30만원', '94 · 18', '사용중'], status: 'success', statusLabel: '활성', caseType: 'coupon' }
    ]
  },
  support: {
    eyebrow: '고객 응대', title: '고객센터', description: '비교견적·판매·주문·계정 문의를 한 상담 목록에서 처리합니다.',
    current: true, filters: ['전체 18', '답변대기 5', '처리중 3', '완료 10'],
    capabilities: ['고객·연결 거래 확인', '문의 분류', '대화 내용', '담당자 배정', '답변 작성', '처리중·완료 상태', '대기시간'],
    columns: ['문의', '고객', '분류', '마지막 메시지', '담당', '대기'],
    rows: [
      { id: 'CS-1982', title: '최종 매입금액이 바뀐 이유가 궁금해요', sub: '홍길동 · BQ-240826-018', cells: ['비교견적', '실물 검수 결과가…', '미배정', '42분'], status: 'danger', statusLabel: '답변대기', caseType: 'support' },
      { id: 'CS-1977', title: '배송 일정 변경 부탁드립니다', sub: '김도윤 · BE-240826-004', cells: ['주문·배송', '내일 오후 가능할까요?', '정성호', '18분'], status: 'progress', statusLabel: '처리중', caseType: 'support' }
    ]
  },
  homeSettings: {
    eyebrow: '홈 화면 관리', title: '홈 화면 관리', description: '홈에 보이는 순서·문구·이미지·연결 조건·상품 구성을 한곳에서 수정합니다.',
    current: true, filters: [], rows: []
  },
  mypageSettings: {
    eyebrow: '고객 화면 관리', title: '고객·업체 마이페이지 관리', description: '고객과 업체 마이페이지 시안을 같은 관리자 화면에서 비교하고 수정합니다.',
    current: true, filters: [], rows: []
  },
  banners: {
    eyebrow: '화면 관리', title: '배너 관리', description: '홈·마이페이지 배너의 문구, 링크, 노출 순서와 화면별 이미지를 관리합니다.',
    current: true, primaryAction: '새 배너 만들기', filters: ['전체 9', '홈 6', '마이페이지 3', '노출중 8', '숨김 1'],
    notice: '운영 배너는 홈·마이페이지 위치별로 최대 10개까지 사용합니다. 모바일 이미지는 필수이고 넓은 화면 이미지는 선택입니다.',
    capabilities: ['홈·마이페이지 노출 위치', '제목·부제', '연결 주소', '사용 여부', '노출 순서', '모바일 이미지 1220×1480 권장', '넓은 화면 이미지 1800×1480 권장', '데스크톱 이미지 1440×1480 권장', '이미지 미리보기·삭제', '끌어서 순서 변경', '등록·수정·삭제'],
    columns: ['배너', '위치', '연결', '화면별 이미지', '순서', '상태'],
    rows: [
      { id: '배너 예시 01', title: '미사용급 풀세트', sub: '홈 메인 배너', cells: ['홈', '풀세트 상품 보기', '모바일·넓은 화면·데스크톱', '1', '노출중'], status: 'success', statusLabel: '게시', caseType: 'banner' },
      { id: '배너 예시 02', title: '시계 수리 예약 안내', sub: '마이페이지 배너', cells: ['마이페이지', '수리 예약 화면', '모바일·넓은 화면', '2', '숨김'], status: 'normal', statusLabel: '숨김', caseType: 'banner' }
    ]
  },
  community: {
    eyebrow: '콘텐츠 관리', title: '인사이트 · 후기', description: '시세·가이드·브랜드 글과 고객 매입 후기를 종류별로 작성·수정·삭제합니다.',
    current: true, primaryAction: '새 글 작성', filters: ['전체 34', '시세정보 8', '매입가이드 9', '브랜드스토리 7', '매입 후기 10'],
    notice: '인사이트 사진은 최대 5장입니다. 매입 후기 사진은 현재 화면 5장·저장 기능 10장으로 기준이 달라 운영 연결 전에 한 기준으로 맞춰야 합니다.',
    capabilities: ['인사이트·매입 후기 구분', '시세정보·매입가이드·브랜드스토리·명품시계정보·공지사항', '제목·본문', '인사이트 사진 최대 5장', '후기 작성자·별점 1~5', '후기 사진 기준 확인', '사진 미리보기·삭제', '등록·수정·삭제'],
    columns: ['콘텐츠', '종류 · 작성자', '카테고리', '이미지', '최근 변경', '노출'],
    rows: [
      { id: 'IN-20260826-08', title: '롤렉스 GMT-마스터 II 시세 흐름', sub: '운영팀 · 인사이트', cells: ['시세 분석', '3장', '13:18', '게시중'], status: 'success', statusLabel: '게시', caseType: 'community' },
      { id: 'RV-20260825-10', title: '방문 매입 후기', sub: '김민수 · 후기', cells: ['매입 후기', '2장 · 평점 5', '어제', '게시중'], status: 'success', statusLabel: '게시', caseType: 'community' }
    ]
  },
  content: {
    eyebrow: '사이트 내용 관리', title: '사이트 내용 관리', description: '매입 안내와 벨로르 소개의 제목·소제목·본문·이미지를 수정합니다.',
    current: true, filters: ['전체 2', '매입 안내 1', '벨로르 소개 1'],
    notice: '현재 운영 데이터는 매입 안내와 벨로르 소개 두 영역만 저장합니다. 새 영역을 추가하려면 저장 키와 화면 연결을 함께 정의해야 합니다.',
    capabilities: ['매입 안내 영역', '벨로르 소개 영역', '제목', '소제목', '본문', '이미지 최대 12장', '이미지 미리보기·삭제', '저장'],
    columns: ['화면', '관리 영역', '제목', '이미지', '최근 변경', '상태'],
    rows: [
      { id: 'CT-SELL-INTRO', title: '매입 안내', sub: '시계 판매 화면', cells: ['매입 절차 안내', '4장', '8월 25일', '게시중'], status: 'success', statusLabel: '게시', caseType: 'content' },
      { id: 'CT-ABOUT-INTRO', title: '벨로르 소개', sub: '회사 소개 화면', cells: ['시계를 보는 새로운 기준', '6장', '8월 24일', '게시중'], status: 'success', statusLabel: '게시', caseType: 'content' }
    ]
  },
  advisor: {
    eyebrow: '고객 상담 지원', title: 'AI 고객비서', description: '상담 기준, 고객 프로필, 대화, 추천 후보, 학습 메모와 확인할 내용을 관리합니다.',
    current: true, filters: ['운영 현황', '고객 프로필', '대화 기록', '알림 후보', '전문가 지식', '시세 인사이트', '팀 메시지', '답변 참고서'],
    capabilities: ['운영 현황', '고객 프로필', '대화 기록', '알림 후보', '전문가 지식', '시세 인사이트', '팀 메시지', '답변 참고서'],
    columns: ['항목', '대상', '최근 처리', '확신도', '관리자 확인', '상태'],
    rows: [
      { id: 'AI-KN-019', title: '롤렉스 풀세트 선호 신호', sub: '고객 프로필 28명', cells: ['추천 학습', '오늘 12:20', '87%', '확인 전', '검토대기'], status: 'attention', statusLabel: '검토', caseType: 'advisor' },
      { id: 'AI-CV-442', title: '가격대 추천 상담', sub: '김도윤 고객', cells: ['대화 요약', '오늘 11:04', '91%', '확인', '정상'], status: 'success', statusLabel: '정상', caseType: 'advisor' }
    ]
  },
  analytics: {
    eyebrow: '데이터 분석', title: '활동 분석', description: '동의 기반 방문·조회·검색·상품 행동과 전환을 기간별로 확인합니다.',
    current: true, filters: ['오늘', '7일', '30일', '직접 설정'],
    capabilities: ['방문·상품 조회', '검색어·필터 사용', '관심·장바구니·주문 전환', '비교견적 신청 전환', '기간·상품·유입별 비교', '필수·선택 동의 범위 구분'],
    columns: ['지표', '오늘', '전일', '변화', '동의 범위', '상세'],
    rows: [
      { id: 'AN-VISIT', title: '방문', sub: '전체 합산', cells: ['1,842', '1,716', '+7.3%', '필수 집계', '시간대별'], status: 'success', statusLabel: '증가', caseType: 'analytics' },
      { id: 'AN-PRODUCT', title: '상품 상세 조회', sub: '행동분석 동의 사용자', cells: ['4,281', '4,402', '-2.7%', '선택 동의', '상품별'], status: 'normal', statusLabel: '관찰', caseType: 'analytics' }
    ]
  },
  coverage: {
    eyebrow: '운영 기능 점검', title: '전체 기능 점검', description: '현재 코드에 흩어진 관리자 기능이 새 콘솔의 어느 화면으로 이동하는지 빠짐없이 대조합니다.',
    current: true, filters: ['전체 11', '현재 코드 포함 9', '연결 전 2'],
    columns: ['기능', '현재 위치 · 새 위치', '포함 항목', '데이터 경계', '점검 결과', '구분'],
    rows: [
      { id: 'CV-01', title: '관리자 홈', sub: '마이페이지 관리자 대시보드 → 운영 홈', cells: ['지표·미처리 배지·신규 결제 알림', '주문·회원·견적 집계', '대조 완료', '현재 코드'], status: 'success', statusLabel: '포함', caseType: 'coverage' },
      { id: 'CV-02', title: '비교견적 종합관리', sub: '구형 패널·견적 전용 화면 → 비교견적 관리', cells: ['승인·거부·정지·복수제안·연락·완료', '견적·제안·연락 기록', '대조 완료', '현재 코드'], status: 'success', statusLabel: '포함', caseType: 'coverage' },
      { id: 'CV-03', title: '주문·교환·반품', sub: '주문 전체화면 → 주문·교환반품', cells: ['9개 상태·배송·메모·환불·회수', '주문·반품·결제 서버', '대조 완료', '현재 코드'], status: 'success', statusLabel: '포함', caseType: 'coverage' },
      { id: 'CV-04', title: '판매시계·재고', sub: '상품 등록 모달 → 판매시계 관리', cells: ['사진 10장·가격·상태·구성품·노출·삭제', '상품·사진 저장소', '대조 완료', '현재 코드'], status: 'success', statusLabel: '포함', caseType: 'coverage' },
      { id: 'CV-05', title: '홈 화면 구성', sub: '홈 모듈·고정 코드 → 홈 화면 관리', cells: ['상품 영역·배너·문구·순서·연결 조건', '상품·배너·사이트 내용', '편집 화면 보강', '일부 연결 전'], status: 'attention', statusLabel: '확인 필요', caseType: 'coverage' },
      { id: 'CV-06', title: '회원·업체·공급협력사', sub: '회원 패널·견적 화면 → 역할별 관리', cells: ['검색·승인·인증·우수회원·정지·프로필 삭제', '프로필·인증·계좌', '대조 완료', '현재 코드'], status: 'success', statusLabel: '포함', caseType: 'coverage' },
      { id: 'CV-07', title: '공급대금·쿠폰', sub: '정산·쿠폰 전체화면 → 정산·혜택', cells: ['수수료·지급·한도·유형·만료·공유', '정산·쿠폰 원장', '대조 완료', '현재 코드'], status: 'success', statusLabel: '포함', caseType: 'coverage' },
      { id: 'CV-08', title: '경매 관제', sub: '독립 경매 화면 → 경매 관제소', cells: ['예약·입찰·연장·종료·취소·예치금', '경매·입찰·지갑', '대조 완료', '현재 코드'], status: 'success', statusLabel: '포함', caseType: 'coverage' },
      { id: 'CV-09', title: '배너·인사이트·후기·사이트 내용', sub: '콘텐츠 모달 → 홈·콘텐츠', cells: ['화면별 이미지·순서·글·평점·본문', '배너·글·후기·사이트 내용', '분리 완료', '현재 코드'], status: 'success', statusLabel: '포함', caseType: 'coverage' },
      { id: 'CV-10', title: '고객센터·분석·AI 고객비서', sub: '각 독립 화면 → 고객 경험·데이터', cells: ['대화·답변·동의 집계·8개 AI 관리 탭', '문의·분석·AI 데이터', '대조 완료', '현재 코드'], status: 'success', statusLabel: '포함', caseType: 'coverage' },
      { id: 'CV-11', title: '위탁·즉시매입·통합검수·감사', sub: '상태 계약 미완성 → 확장 화면', cells: ['독립 상태·최종금액·입고·변경 기록', '새 데이터 계약 필요', '운영 연결 전', '확장 설계'], status: 'attention', statusLabel: '연결 전', caseType: 'coverage' }
    ]
  },
  notifications: {
    eyebrow: '알림 운영', title: '알림 · 발송', description: '카카오·앱·텔레그램 발송 결과와 실패 원인을 확인하는 확장 화면입니다.',
    planned: true, notice: '솔라피·카카오 템플릿과 텔레그램 운영 후보는 준비되어 있지만 운영 데이터·결과 수신·실제 발송은 아직 연결되지 않았습니다.',
    filters: ['전체 142', '성공 140', '실패 1', '대기 1'],
    columns: ['발송', '이벤트 · 수신자', '채널', '템플릿', '발송 시각', '결과'],
    rows: [
      { id: 'NT-240826-142', title: '새 견적 도착 · 홍길동', sub: 'BQ-240826-018', cells: ['카카오 알림톡', '새 견적 도착 안내', '12:58', '발송실패'], status: 'danger', statusLabel: '원인 확인', caseType: 'notification' },
      { id: 'NT-240826-141', title: '주문 승인 · 김도윤', sub: 'BE-240826-004', cells: ['앱 알림', '주문 처리 시작', '12:42', '성공'], status: 'success', statusLabel: '성공', caseType: 'notification' }
    ]
  },
  audit: {
    eyebrow: '변경 기록', title: '감사 로그', description: '금액·상태·권한·삭제 같은 중요 변경의 주체와 결과를 보존하는 설계 화면입니다.',
    planned: true, notice: '현재 일부 기능별 로그는 존재하지만 통합 장기 감사 화면은 아직 없습니다. 금액·상태 변경은 성공/실패 모두 서버 기록이 전제입니다.',
    filters: ['전체', '금액 변경', '상태 변경', '권한', '삭제', '실패'],
    columns: ['시각', '행위자', '대상', '작업', '결과', '근거'],
    rows: [
      { id: 'AL-8841', title: '13:42:18', sub: '정성호 · 최고관리자', cells: ['BQ-240826-018', '견적 승인', '성공', '웹 관리자'], status: 'success', statusLabel: '기록', caseType: 'audit' },
      { id: 'AL-8838', title: '12:58:07', sub: '알림 서비스', cells: ['NT-240826-142', '카카오 발송', '실패', '발송 사업자 응답 지연'], status: 'danger', statusLabel: '실패', caseType: 'audit' }
    ]
  },
  permissions: {
    eyebrow: '접근 권한', title: '관리자 권한', description: '업무별 최소 권한을 역할 묶음으로 분리하는 확장 설계입니다.',
    planned: true, notice: '현재 운영 코드의 단일 관리자 역할을 즉시 바꾸지 않습니다. 서버 함수와 행 단위 보안을 함께 검증한 뒤 권한을 단계적으로 분리합니다.',
    filters: ['전체 7', '활성 7', '초대대기 0'],
    columns: ['운영자', '역할 프리셋', '업무 범위', '민감 권한', '최근 접속', '상태'],
    rows: [
      { id: 'OP-0001', title: '정성호', sub: 'babsangl@*****', cells: ['최고관리자', '전체', '환불·정산·권한', '오늘 13:48', '활성'], status: 'success', statusLabel: '활성', caseType: 'permission' },
      { id: 'OP-PRESET-02', title: '견적 · 검수 담당', sub: '권한 프리셋', cells: ['견적·입고·검수', '삭제·환불 제외', '없음', '설계안', '준비'], status: 'normal', statusLabel: '설계', caseType: 'permission' }
    ]
  }
};

export const caseDetail = {
  id: 'BQ-240826-018',
  type: '비교견적',
  title: '롤렉스 GMT-마스터 II 40mm',
  reference: 'Ref. 126710BLRO · 풀세트 · 상태 9점',
  image: watchImage,
  status: '승인대기',
  owner: '홍길동 · 일반고객',
  phone: '010-41**-74**',
  assignee: '미배정',
  submittedAt: '2026.08.26 13:38',
  desiredPrice: '19,000,000원',
  timeline: [
    { time: '13:38', title: '비교견적 신청 접수', detail: '고객이 사진 6장과 상품정보를 등록했습니다.', done: true },
    { time: '13:39', title: '접수 알림 기록', detail: '앱 알림 성공 · 카카오 발송 대기', done: true },
    { time: '현재', title: '관리자 승인 대기', detail: '사진·레퍼런스·구성품 확인이 필요합니다.', current: true },
    { time: '승인 후', title: '72시간 제안 시작', detail: '견적업체 화면 공개 · 제안 누적 기록' }
  ]
};
