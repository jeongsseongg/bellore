const ORDER_IMAGE = '../../assets/products/watch-batch-20260821-3/158-pdj96zas81tz/front.webp';

const COMMON_MENUS = Object.freeze([
  '주문 내역',
  '내 비교견적',
  '경매',
  '장바구니',
  '내 관심',
  '최근 본 상품',
  '고객센터',
  '회원정보 수정'
]);

const COMMON_CONTENT = Object.freeze({
  blockOrder: ['header', 'order', 'banner', 'trade', 'activity', 'footer'],
  profile: {
    pageTitle: '마이페이지',
    name: '정성호',
    notificationCount: '3'
  },
  stats: [
    { value: '18,500P', label: '포인트' },
    { value: '2장', label: '쿠폰' },
    { value: '7개', label: '내 관심' }
  ],
  order: {
    visible: true,
    sectionTitle: '최근 주문',
    status: '배송 중',
    name: '롤렉스 서브마리너 데이트',
    orderNumber: 'BE-260826-0184',
    courier: '우체국택배 · 6079-21**-****',
    image: ORDER_IMAGE,
    primaryAction: '배송 조회',
    secondaryAction: '주문 상세'
  },
  banner: {
    visible: false,
    title: '벨로르 회원을 위한 혜택',
    description: '새로운 소식과 이벤트를 확인해 보세요.',
    image: ''
  },
  footer: {
    description: '명품시계 거래 · 통신판매중개',
    phone: '010-8004-6665',
    hours: '평일 11:00 ~ 19:00 · 24시간 상담 접수'
  },
  labels: {
    tradeHeading: '거래',
    activityHeading: '내 활동'
  }
});

export const EDITABLE_ROLE_ORDER = Object.freeze(['customer', 'vendor', 'admin']);

export const MYPAGE_ROLE_DEFAULTS = Object.freeze({
  customer: {
    label: '고객',
    headerMessage: '다음 등급까지 구매 1회 남았어요.',
    menuGroups: {
      trade: COMMON_MENUS.slice(0, 4),
      activity: COMMON_MENUS.slice(4)
    },
    ...COMMON_CONTENT
  },
  vendor: {
    label: '업체',
    headerMessage: '새 비교견적과 입찰 현황을 확인하세요.',
    menuGroups: {
      trade: ['주문 내역', '경매', '비교견적 · 입찰 내역', '장바구니'],
      activity: COMMON_MENUS.slice(3)
    },
    ...COMMON_CONTENT
  },
  admin: {
    label: '관리자',
    headerMessage: '오늘의 운영 현황과 처리할 업무를 확인하세요.',
    menuGroups: {
      trade: ['시계판매 (견적·업체·고객)', '비교견적 승인', '회원관리'],
      activity: ['주문 관리', '교환 · 반품', '쿠폰 관리', '판매시계 관리', '경매 관제소', '배너 관리', '공급대금 관리', '활동 로그']
    },
    ...COMMON_CONTENT
  }
});

export function normalizeEditableRole(role) {
  return EDITABLE_ROLE_ORDER.includes(role) ? role : 'customer';
}

export function cloneRoleContent(role) {
  return JSON.parse(JSON.stringify(MYPAGE_ROLE_DEFAULTS[normalizeEditableRole(role)]));
}
