export const roleContracts = [
  {
    key: 'customer', label: '일반고객', code: 'customer', state: '현재 운영', tone: 'blue',
    summary: '구매 · 비교견적 · 위탁 신청 · 관심상품', entry: '공개 회원가입',
    boundary: '본인 주문·신청·계정 데이터만'
  },
  {
    key: 'vendor', label: '견적업체', code: 'vendor', state: '현재 운영', tone: 'green',
    summary: '승인 후 비교견적 확인 · 금액 제안', entry: '업체 회원가입 + 관리자 승인',
    boundary: '업체용 공개 견적과 자기 제안만'
  },
  {
    key: 'partner', label: '공급협력사', code: 'partner', state: '포털 준비', tone: 'amber',
    summary: '공급상품 · 인증 · 공급대금 계약 보존', entry: '현재 데이터 역할 · 별도 승인 경로',
    boundary: '입찰 권한은 현 코드 충돌 확인 후 확정'
  },
  {
    key: 'admin', label: '관리자', code: 'admin', state: '현재 운영', tone: 'dark',
    summary: '전체 운영 · 승인 · 상태변경 · 정산 · 감사', entry: '내부 지정 전용',
    boundary: '화면 분리 + 서버 권한·행 단위 보안 필수'
  }
];
