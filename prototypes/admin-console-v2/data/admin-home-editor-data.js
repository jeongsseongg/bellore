const sharedListingDrivers = [
  '판매 상태',
  '정가',
  '할인가',
  '노출 태그',
  '할인 시작일',
  '등록일',
  '대표 사진'
];

const heroFallbackItems = [
  '미사용급 풀세트',
  '예물 시계',
  '빈티지 컬렉션',
  '아이코닉 컬렉션',
  '신규 입고',
  '1,000만원 이상의 명작',
  '한정 할인',
  '다이버 워치',
  '여성 명품시계',
  '까르띠에 산토스'
];

const themeBannerItems = [
  '데이트저스트',
  '1,000만원 이상',
  '다이버 워치',
  '500만원 미만',
  '여성 시계',
  '1,000만원 미만',
  '예물 시계',
  '빈티지 컬렉션',
  '풀세트 매물',
  '300만원 미만'
];

const buyinCopyItems = [
  '가치 확인부터, 부담 없이',
  '서류보다 중요한 건 시계',
  '시계 한 점으로 충분',
  '단품도 정식 감정',
  '오래 둘수록 다시 볼 가치',
  '잠들어 있던 시간만큼',
  '오늘의 시세로',
  '연식보다 중요한 기준',
  '결정은 천천히',
  '구성품 없이도',
  '여러 곳의 값을 한 번에',
  '보관만 하고 있었다면',
  '이어받은 시간까지',
  '사진 한 장으로 시작',
  '지금 값을 알아둘 때'
];

const brandItems = [
  '롤렉스', '파텍필립', '오데마피게', '바쉐론 콘스탄틴', '까르띠에', '오메가', '위블로', '태그호이어',
  'IWC', '브라이틀링', '파네라이', '튜더', '구찌', '샤넬', '프랭크 뮬러', '리차드밀',
  '예거 르쿨트르', '로저 드뷔', '브레게', '블랑팡', 'A. 랑에 운트 죄네', '피아제', '에르메스', '불가리',
  '론진', '라도', '미도', '오리스', '세이코', '티쏘', '해밀턴', '프레드릭 콘스탄트'
];

export const homeEditorData = {
  prototypeNotice: '이 화면은 운영 구조를 확인하는 화면 시안입니다. 조회·저장·업로드는 운영 데이터에 연결하지 않았습니다.',
  sections: [
    {
      id: 'headerChips',
      placement: 'header',
      label: '헤더 상품 칩',
      summary: '헤더 아래의 최근 업데이트·한정 할인·미사용신품·오늘의시계',
      state: '코드고정 · 새 저장 계약 필요',
      tone: 'code',
      mode: 'code',
      itemCount: '4개',
      source: '홈 문서 정적 코드',
      items: ['최근 업데이트', '한정 할인', '미사용신품', '오늘의시계'],
      facts: [
        { label: '현재 저장소', value: '없음' },
        { label: '연결 기준', value: '상품 등록일·할인·미사용신품·오늘의시계 태그' },
        { label: '현재 변경 방법', value: '코드 수정 후 배포' }
      ],
      controls: ['표시 이름', '연결 조건', '사용 여부', '노출 순서'],
      notes: ['현재 운영에는 관리자 저장 함수나 테이블이 없습니다. 편집 화면을 연결하려면 새 저장 계약과 홈 표시 로직 변경이 함께 필요합니다.']
    },
    {
      id: 'dbBanners',
      placement: 'home',
      label: '홈·마이페이지 운영 배너',
      summary: '운영에서 이미 등록·조회·수정·삭제할 수 있는 실제 배너',
      state: '운영 저장 구조 있음 · 시안 미연결',
      tone: 'persisted',
      mode: 'persisted',
      itemCount: '위치별 활성 최대 10개',
      source: '운영 배너 저장소 · 이미지 저장소',
      fields: [
        { type: 'select', label: '노출 위치', value: '홈', options: ['홈', '마이페이지'] },
        { type: 'text', label: '제목', value: '배너 제목' },
        { type: 'text', label: '부제목', value: '배너 부제목' },
        { type: 'text', label: '클릭 연결', value: '연결 주소' },
        { type: 'number', label: '노출 순서', value: '숫자가 작을수록 먼저' },
        { type: 'toggle', label: '노출 여부', value: true }
      ],
      images: [
        { label: '모바일 이미지', spec: '권장 1220 × 1480px', required: true, column: '모바일용' },
        { label: '태블릿·와이드 이미지', spec: '권장 1800 × 1480px', required: false, column: '넓은 화면용' },
        { label: '데스크톱 이미지', spec: '권장 1440 × 1480px', required: false, column: '데스크톱용' }
      ],
      controls: ['홈·마이페이지 위치', '제목·부제', '링크', '활성 상태', '정렬', '화면별 이미지', '추가·수정·삭제'],
      notes: [
        '모바일 이미지는 운영 편집기에서 필수입니다. 와이드·데스크톱 이미지가 없으면 좁은 화면용 이미지로 폴백합니다.',
        '이 시안은 운영 데이터를 읽지 않으므로 실제 배너 건수나 내용을 꾸며서 표시하지 않습니다.'
      ],
      action: { label: '배너 관리 화면으로 이동', target: 'banners' }
    },
    {
      id: 'heroFallback',
      placement: 'home',
      label: '메인 대체 캠페인',
      summary: '활성 운영 배너가 구성되지 않았을 때 쓰는 코드 캠페인',
      state: '코드고정 · 새 저장 계약 필요',
      tone: 'code',
      mode: 'code',
      itemCount: '10개',
      source: '메인 대체 캠페인 배열',
      items: heroFallbackItems,
      images: [
        { label: '메인 이미지 10장', spec: '배너 이미지 파일 10장', required: true, column: '코드 자산' }
      ],
      facts: [
        { label: '현재 저장소', value: '없음' },
        { label: '구성 항목', value: '연결 동작 · 앞문구 · 제목 · 보조 문구 · 이미지 · 명암 · 정렬' },
        { label: '현재 변경 방법', value: '홈 배너 데이터 파일 수정 후 배포' }
      ],
      controls: ['10개 캠페인', '문구', '이미지', '컬렉션 연결', '명암·정렬', '순서'],
      notes: ['운영 배너 편집 기능과 별개인 안전 대체 화면입니다. 관리자화하려면 기존 배너 저장소로 합칠지 별도 대체 화면 저장 구조를 만들지 먼저 결정해야 합니다.']
    },
    {
      id: 'special',
      placement: 'home',
      label: '이번 주 특별가',
      summary: '판매 상품에서 유효한 할인 매물을 자동 계산한 첫 번째 가로줄',
      state: '판매 상품 자동 파생 · 별도 저장 없음',
      tone: 'derived',
      mode: 'derived',
      itemCount: '최대 8개',
      source: '판매 상품에서 할인율 기준 자동 계산',
      facts: [
        { label: '선정', value: '유효 할인 상품을 할인율 내림차순 정렬' },
        { label: '분할', value: '할인 풀의 절반, 최대 8개' },
        { label: '할인 유효시간', value: '할인 시작일 또는 등록일 기준 72시간' }
      ],
      drivers: sharedListingDrivers,
      inclusion: [
        { label: '판매 가능', value: '벨로르 판매 상품 · 판매중 상태', pass: true },
        { label: '할인 설정', value: '한정 할인 태그 · 할인가가 정가보다 낮음', pass: true },
        { label: '72시간 안', value: '할인 시작 시각 + 72시간 > 현재 시각', pass: true },
        { label: '줄 배치', value: '할인율 순위가 첫 번째 분할에 포함', pass: true }
      ],
      controls: ['상품 편집으로 간접 제어', '정가·할인가', '한정 할인 태그', '판매 상태', '대표 사진'],
      notes: ['수동 상품 선택, 줄 제목 변경, 중복 제외, 수동 순서 저장은 현재 운영 기능이 아닙니다.'],
      action: { label: '판매시계 관리에서 상품 편집', target: 'listings' }
    },
    {
      id: 'priceDrop',
      placement: 'home',
      label: '새로워진 가격',
      summary: '같은 할인 풀에서 특별가 줄에 들어가지 않은 나머지 상품',
      state: '판매 상품 자동 파생 · 별도 저장 없음',
      tone: 'derived',
      mode: 'derived',
      itemCount: '최대 20개 렌더 범위',
      source: '판매 상품에서 특별가 다음 순위 자동 계산',
      facts: [
        { label: '선정', value: '특별가와 같은 유효 할인 풀' },
        { label: '분할', value: '특별가 첫 분할 이후의 나머지' },
        { label: '할인 상품 없음', value: '최근 상품으로 대체 표시' }
      ],
      drivers: sharedListingDrivers,
      inclusion: [
        { label: '판매 가능', value: '벨로르 판매 상품 · 판매중 상태', pass: true },
        { label: '유효 할인', value: '할인가·한정 할인 태그·72시간 조건 통과', pass: true },
        { label: '줄 배치', value: '특별가 첫 분할 다음 순위', pass: true }
      ],
      controls: ['상품 편집으로 간접 제어', '정가·할인가', '한정 할인 태그', '판매 상태', '대표 사진'],
      notes: ['별도 가격변경 이력 테이블을 읽는 영역이 아닙니다. 현재 이름과 달리 유효 할인 풀을 나눠 표시합니다.'],
      action: { label: '판매시계 관리에서 상품 편집', target: 'listings' }
    },
    {
      id: 'themes',
      placement: 'home',
      label: '가격·테마 배너',
      summary: '검색어 또는 최저·최고 가격으로 연결되는 무작위 배너',
      state: '코드고정 · 새 저장 계약 필요',
      tone: 'code',
      mode: 'code',
      itemCount: '10개',
      source: '가격·테마 배너 배열',
      items: themeBannerItems,
      images: [
        { label: '테마 배너 이미지 10장', spec: '테마별 배너 이미지 파일 10장', required: true, column: '코드 자산' }
      ],
      facts: [
        { label: '구성 항목', value: '식별값 · 앞문구 · 제목 · 보조 문구 · 검색어 또는 가격 범위 · 이미지' },
        { label: '전환', value: '15초마다 직전과 다른 항목을 무작위 표시' },
        { label: '현재 저장소', value: '없음' }
      ],
      controls: ['10개 배너', '문구', '이미지', '검색어', '최저·최고 가격', '활성·순서'],
      notes: ['현재 관리자 저장 함수가 없습니다. 등록·조회·수정·삭제 기능을 만들면 홈 화면도 새 저장 구조를 읽도록 바꿔야 합니다.']
    },
    {
      id: 'recent',
      placement: 'home',
      label: '최근 등록된 시계',
      summary: '판매 가능한 벨로르 상품을 등록일 최신순으로 보여주는 가로줄',
      state: '판매 상품 자동 파생 · 별도 저장 없음',
      tone: 'derived',
      mode: 'derived',
      itemCount: '최대 20개',
      source: '판매 상품 등록일 최신순',
      facts: [
        { label: '조회 조건', value: '벨로르 판매 상품 · 판매중 상태' },
        { label: '정렬', value: '등록일 최신순' },
        { label: '노출량', value: '최대 20개' }
      ],
      drivers: sharedListingDrivers,
      inclusion: [
        { label: '판매 가능', value: '판매중 상태', pass: true },
        { label: '상품 구분', value: '벨로르 판매 상품', pass: true },
        { label: '정렬 근거', value: '등록일이 최신인 상품부터', pass: true }
      ],
      controls: ['상품 편집으로 간접 제어', '판매 상태', '등록일', '대표 사진'],
      notes: ['직접 선택이나 수동 순서 저장은 현재 없습니다.'],
      action: { label: '판매시계 관리에서 상품 편집', target: 'listings' }
    },
    {
      id: 'buyin',
      placement: 'home',
      label: '시계 매입 배너',
      summary: '판매방식 선택으로 연결되는 문구·배경·시계 자산 조합',
      state: '코드고정 · 새 저장 계약 필요',
      tone: 'code',
      mode: 'code',
      itemCount: '문구 15 · 배경 4 · 시계 3',
      source: '매입 문구·배경·시계 이미지 배열',
      items: buyinCopyItems,
      images: [
        { label: '배경 이미지 4장', spec: '매입 배너 배경 파일 4장', required: true, column: '코드 자산' },
        { label: '시계 이미지 3장', spec: '매입 배너 시계 파일 3장', required: true, column: '코드 자산' }
      ],
      facts: [
        { label: '전환', value: '15초마다 무작위 전환' },
        { label: '연결', value: '판매방식 선택 시트' },
        { label: '브라우저 임시값', value: '마지막 노출 번호만 기억' }
      ],
      controls: ['15개 문구', '배경 4장', '시계 3장', '판매방식 연결', '활성·순서'],
      notes: ['브라우저 임시값은 콘텐츠 저장소가 아닙니다. 관리자 편집을 위해서는 새 운영 저장 구조가 필요합니다.']
    },
    {
      id: 'recommend',
      placement: 'home',
      label: '추천 매물',
      summary: '판매 상품 피드의 최신 12개를 그대로 보여주는 2열 그리드',
      state: '판매 상품 자동 파생 · 별도 저장 없음',
      tone: 'derived',
      mode: 'derived',
      itemCount: '최대 12개',
      source: '판매 상품 최신순 조회',
      facts: [
        { label: '선정', value: '판매 가능한 벨로르 상품 최신 12개' },
        { label: '수동 추천 순위', value: '없음' },
        { label: '특별가 중복 제외', value: '없음 · 같은 상품이 함께 노출될 수 있음' }
      ],
      drivers: sharedListingDrivers,
      inclusion: [
        { label: '판매 가능', value: '벨로르 판매 상품 · 판매중 상태', pass: true },
        { label: '정렬 근거', value: '등록일 최신순 12위 안', pass: true },
        { label: '카드 표시', value: '사진이 없으면 기본 이미지 · 가격이 없으면 가격 문의', pass: true }
      ],
      controls: ['상품 편집으로 간접 제어', '판매 상태', '등록일', '가격', '대표 사진'],
      notes: ['추천 플래그, 수동 핀, 중복 제외, 직접 순서 저장은 현재 운영 기능이 아닙니다.'],
      action: { label: '판매시계 관리에서 상품 편집', target: 'listings' }
    },
    {
      id: 'featured',
      placement: 'home',
      label: '단독 추천 배너',
      summary: '추천 그리드의 여섯 번째 카드 뒤에 삽입되는 무작위 상품 배너',
      state: '상품 자동 · 설정 코드고정',
      tone: 'hybrid',
      mode: 'hybrid',
      itemCount: '후보 최대 10개',
      source: '판매 상품 + 추천 문구·원단 배열',
      facts: [
        { label: '후보', value: '판매 상품을 섞어 최대 10개' },
        { label: '삽입 위치', value: '추천 카드 6개 다음' },
        { label: '전환', value: '15초마다 무작위 전환' },
        { label: '디자인 자산', value: '원단 5장 · 문구 15개를 상품 식별번호로 고정 연결' }
      ],
      images: [
        { label: '원단 배경 5장', spec: '단독 추천 배경 파일 5장', required: true, column: '코드 자산' },
        { label: '상품 대표 사진', spec: '판매 상품 첫 번째 사진 자동 사용', required: true, column: '상품 사진' }
      ],
      drivers: sharedListingDrivers,
      controls: ['상품 데이터는 간접 제어', '후보 수·삽입 위치·문구·배경은 코드고정'],
      notes: ['상품 핀, 후보 수, 삽입 위치, 추천 문구, 원단을 관리자 편집하려면 새 저장 계약이 필요합니다.'],
      action: { label: '판매시계 관리에서 상품 편집', target: 'listings' }
    },
    {
      id: 'brandCategories',
      placement: 'collection',
      label: '브랜드 카테고리',
      summary: '판매시계 컬렉션의 원형 브랜드 필터와 브랜드별 모델 사전',
      state: '코드고정 · 새 저장 계약 필요',
      tone: 'code',
      mode: 'code',
      itemCount: '브랜드 32개 + 전체',
      source: '브랜드 데이터 파일 · 컬렉션 화면 고정 항목',
      items: brandItems,
      images: [
        { label: '브랜드 로고 32장', spec: '브랜드별 투명 배경 로고', required: true, column: '코드 자산' }
      ],
      facts: [
        { label: '표시 위치', value: '홈 원형 바로가기 아님 · 판매시계 컬렉션' },
        { label: '브랜드 데이터', value: '짧은 주소 · 한글명 · 영문명 · 대표 모델 배열' },
        { label: '현재 저장소', value: '없음' }
      ],
      controls: ['브랜드명', '영문명', '로고', '모델 사전', '순서', '사용 여부'],
      notes: ['현재 증거에는 홈 원형 바로가기 6개가 없습니다. 이 항목은 컬렉션의 브랜드 카테고리로 정확히 구분합니다.', '브랜드 배열과 원형 화면 버튼이 함께 존재하므로 관리자화할 때 한 저장소로 통합해야 합니다.']
    }
  ]
};
