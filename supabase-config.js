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
   토스페이먼츠 결제 설정
   ------------------------------------------------------------
   - clientKey 는 공개되어도 안전합니다(프런트 전용).
   - secretKey 는 절대 여기에 넣지 마세요! → Supabase Edge Function
     환경변수(TOSS_SECRET_KEY)로만 보관합니다.
   - 아래는 토스 공개 "테스트 키" 입니다. 실제 정산을 받으려면
     토스페이먼츠 가입·심사 후 발급받은 라이브 clientKey 로 교체하세요.
   - confirmUrl: 서버 결제 승인(검증)용 Edge Function 주소.
     supabase/functions/confirm-payment 를 배포하면 자동 동작합니다.
   ============================================================ */
window.BELLORE_PAYMENTS = {
  provider: "toss",
  // 토스 공개 테스트 clientKey (그대로 두면 테스트 결제가 동작)
  clientKey: "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm",
  // 결제 승인 검증 Edge Function (배포 후 활성화). 비워두면 데모 승인.
  confirmUrl: "https://iumsnacuxgssnnbckurq.supabase.co/functions/v1/confirm-payment",
  // 예약금(계약금) 비율 — 상품가의 몇 %를 선결제로 받을지
  depositRate: 0.10,
  // 예약금 최소/최대 한도(원)
  depositMin: 500000,
  depositMax: 5000000,
  // 배송비(전액 결제 시 가산)
  shippingFee: 35000
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
