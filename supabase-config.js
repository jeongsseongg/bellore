/* ============================================================
   벨로르(BELLORE) · Supabase 설정
   ------------------------------------------------------------
   - 이 값이 채워져 있으면 supabase.js 가 자동으로 백엔드를 켭니다.
   - anon 키는 공개되어도 안전합니다. 데이터 보호는 Supabase의
     RLS(행 수준 보안) 정책이 담당합니다. (테이블/정책은 이미 생성됨)
   ============================================================ */
window.BELLORE_SUPABASE = {
  url: "https://iumsnacuxgssnnbckurq.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bXNuYWN1eGdzc25uYmNrdXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDQ5ODQsImV4cCI6MjA5NjIyMDk4NH0.lwej8g4YCaiYuoQSXczwRp6ez-X26DD5d1ycMkYwpIk"
};

/* 부트스트랩 관리자 이메일.
   - DB profiles.role = 'admin' 이 정식 관리자 판정 기준입니다.
   - 아래 이메일은 DB 역할이 아직 admin 으로 바뀌지 않았더라도
     해당 계정으로 로그인하면 관리자 UI가 열리도록 하는 보조 장치입니다.
   - 최초 1회: 이 계정으로 가입/로그인 후 Supabase SQL Editor 에서
       update public.profiles set role='admin'
       where id = (select id from auth.users where email='jeongsseongg@gmail.com');
     를 실행하면 RLS상으로도 관리자 권한이 부여됩니다. */
window.NW_ADMIN_EMAILS = [
  "brpartners@gmail.com",
  "jeongsseongg@gmail.com"
];

/* ============================================================
   포트원(PortOne V2) 결제 설정
   ------------------------------------------------------------
   - storeId / channelKey 는 공개되어도 안전합니다(프런트 전용).
   - API Secret 은 절대 여기에 넣지 마세요! → Supabase Edge Function
     환경변수(PORTONE_API_SECRET)로만 보관합니다.
   - 채우는 곳(포트원 콘솔 https://admin.portone.io):
       · storeId        : 결제연동 > 상점 정보 의 "Store ID" (store-xxxxxxxx)
       · 각 channelKey   : 결제연동 > 연동 정보 > 채널 관리 에서 결제수단별 "채널 키" 복사
   - 심사 통과(연동 완료)된 결제수단만 channels 에 두세요. 미입력(빈 값)이면
     해당 버튼은 자동으로 숨겨집니다. 결제수단을 추가하려면 항목만 채우면 됩니다.
   - confirmUrl: 서버 결제 검증용 Edge Function 주소(배포 후 자동 동작).
   ============================================================ */
window.BELLORE_PAYMENTS = {
  provider: "portone",
  // 포트원 상점 ID (예: store-00000000-0000-0000-0000-000000000000)
  storeId: "store-c0c1bc9e-60c2-4ac6-9bb1-80c0ee7337ef",
  // 결제수단 목록 — 각 항목의 channelKey 를 포트원 콘솔에서 복사해 채우세요.
  //   payMethod: 'CARD'(카드) | 'EASY_PAY'(간편결제) | 'TRANSFER'(계좌이체) | 'VIRTUAL_ACCOUNT'(가상계좌)
  //   easyPayProvider: 간편결제일 때 지정(아래 값 참고). 비우면 PG 기본 선택창.
  channels: [
    { id: "card",     label: "신용·체크카드", payMethod: "CARD",     channelKey: "channel-key-87bd0acb-2cf9-4b05-9394-b332a099d658" },
    { id: "kakaopay", label: "카카오페이",   payMethod: "EASY_PAY", channelKey: "", easyPayProvider: "EASY_PAY_PROVIDER_KAKAOPAY" },
    { id: "naverpay", label: "네이버페이",   payMethod: "EASY_PAY", channelKey: "", easyPayProvider: "EASY_PAY_PROVIDER_NAVERPAY" },
    { id: "tosspay",  label: "토스페이",     payMethod: "EASY_PAY", channelKey: "", easyPayProvider: "EASY_PAY_PROVIDER_TOSSPAY" },
    { id: "payco",    label: "페이코",       payMethod: "EASY_PAY", channelKey: "", easyPayProvider: "EASY_PAY_PROVIDER_PAYCO" },
    { id: "smilepay", label: "스마일페이",   payMethod: "EASY_PAY", channelKey: "", easyPayProvider: "EASY_PAY_PROVIDER_SMILEPAY" }
  ],
  // 결제 검증 Edge Function (배포 후 활성화). 비워두면 데모 승인.
  confirmUrl: "https://iumsnacuxgssnnbckurq.supabase.co/functions/v1/confirm-payment",
  // 결제 취소/환불 Edge Function (배포 후 활성화). 비워두면 DB 상태만 변경.
  cancelUrl: "https://iumsnacuxgssnnbckurq.supabase.co/functions/v1/cancel-payment",
  // 예약금(계약금) 비율 — 상품가의 몇 %를 선결제로 받을지
  depositRate: 0.10,
  // 예약금 최소/최대 한도(원)
  depositMin: 500000,
  depositMax: 5000000,
  // 배송비(전액 결제 시 가산)
  shippingFee: 35000
};

/* ============================================================
   회원가입 인증 설정 (4종)
   ------------------------------------------------------------
   - enabled:false 면 해당 인증은 "준비 중"으로 표시되고, 인증 없이도
     입력만으로 가입/가입신청이 됩니다. 키가 준비되면 enabled:true 로 켜세요.
   - 켜는 순간 그 항목은 "실제 인증 통과"가 있어야 가입됩니다.
   ============================================================ */
window.BELLORE_VERIFY = {
  // 휴대폰: 포트원 본인인증(PASS). 포트원 콘솔 > 본인인증 채널의 채널키를 넣고 enabled:true
  phone:    { enabled: false, channelKey: "" },
  // 이메일: Supabase 이메일 OTP(인증번호). 이메일 템플릿에 {{ .Token }} 추가 후 enabled:true
  email:    { enabled: false },
  // 계좌: 자동 실명조회(Edge Function verify-account). 키/계약 준비되면 enabled:true
  account:  { enabled: false },
  // 사업자: 국세청 진위확인(Edge Function verify-business). 배포 확인되면 enabled:true
  //  (false 라도 '사업자 인증' 버튼은 국세청 조회를 시도하고, 통과 못 해도 가입은 진행됩니다)
  business: { enabled: false }
};

/* 카테고리 정의 (디자인의 탭/필터와 매핑) */
window.BELLORE_CATEGORIES = {
  // 판매시계 마켓
  listing: { brand: "벨로르판매", user: "고객판매" },
  // 인사이트 탭(data-cat) → community_posts.category
  insight: {
    price: "시세정보",
    guide: "매입가이드",
    brand: "브랜드스토리",
    wiki: "명품시계정보",
    notice: "공지사항"
  }
};
