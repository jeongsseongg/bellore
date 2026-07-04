/* ============================================================
   벨로르(BELLORE) · 브랜드 단일 소스(Single Source of Truth)
   ------------------------------------------------------------
   - 원형 카테고리(홈/판매시계), 시계 등록 브랜드 선택,
     검색 페이지 브랜드→모델 드릴다운, 필터 매칭이 모두
     이 데이터를 기준으로 동작합니다.
   - 식별 키 = 한글 풀네임(name). 등록 시 listings.title(brand)에
     이 name 그대로 저장하여 필터/검색과 일치시킵니다.
   - logo = assets/brands/<slug>.png (원형 로고)
   - models = 브랜드별 대표 모델(검색 카테고리·등록 모델 추천에 사용)
   ============================================================ */
window.BELLORE_BRANDS = [
  { slug: 'rolex', name: '롤렉스', eng: 'ROLEX', models: ['서브마리너', '데이트저스트', '데이데이트', 'GMT마스터 II', '스카이드웰러', '요트마스터', '데이토나', '익스플로러', '씨드웰러', '에어킹', '오이스터 퍼페추얼'] },
  { slug: 'patek', name: '파텍필립', eng: 'PATEK PHILIPPE', models: ['노틸러스', '아쿠아넛', '칼라트라바', '컴플리케이션', '그랜드 컴플리케이션', '골든 엘립스', '트윈티'] },
  { slug: 'ap', name: '오데마피게', eng: 'AUDEMARS PIGUET', models: ['로얄오크', '로얄오크 오프쇼어', '로얄오크 컨셉', '코드 11.59', '밀레너리'] },
  { slug: 'vacheron', name: '바쉐론 콘스탄틴', eng: 'VACHERON CONSTANTIN', models: ['오버시즈', '패트리모니', '트래디셔널', '피프티식스', '히스토리크'] },
  { slug: 'cartier', name: '까르띠에', eng: 'CARTIER', models: ['산토스', '탱크', '발롱블루', '파샤', '드라이브', '롱드'] },
  { slug: 'omega', name: '오메가', eng: 'OMEGA', models: ['스피드마스터', '씨마스터', '컨스텔레이션', '드빌', '아쿠아테라'] },
  { slug: 'hublot', name: '위블로', eng: 'HUBLOT', models: ['빅뱅', '클래식 퓨전', '스피릿 오브 빅뱅', 'MP 컬렉션'] },
  { slug: 'tagheuer', name: '태그호이어', eng: 'TAG HEUER', models: ['카레라', '모나코', '아쿠아레이서', '포뮬러1', '오타비아'] },
  { slug: 'iwc', name: 'IWC', eng: 'IWC', models: ['포르투기저', '파일럿', '포르토피노', '인제니어', '아쿠아타이머', '다빈치'] },
  { slug: 'breitling', name: '브라이틀링', eng: 'BREITLING', models: ['네비타이머', '슈퍼오션', '크로노맷', '어벤저', '프리미에'] },
  { slug: 'panerai', name: '파네라이', eng: 'PANERAI', models: ['루미노르', '라디오미르', '서브머저블', '루미노르 두에'] },
  { slug: 'tudor', name: '튜더', eng: 'TUDOR', models: ['블랙베이', '펠라고스', '레인저', '로얄', '1926'] },
  { slug: 'gucci', name: '구찌', eng: 'GUCCI', models: ['디브이 스트림', '그립', 'G-타임리스', '인터로킹'] },
  { slug: 'chanel', name: '샤넬', eng: 'CHANEL', models: ['J12', '프리미에', '보이프렌드', '코드 코코'] },
  { slug: 'franckmuller', name: '프랭크 뮬러', eng: 'FRANCK MULLER', models: ['카사블랑카', '톤보', '본투바이', '롱아일랜드', '크레이지 아워스'] },
  { slug: 'richardmille', name: '리차드밀', eng: 'RICHARD MILLE', models: ['RM 011', 'RM 035', 'RM 055', 'RM 07'] },
  { slug: 'jaegerlecoultre', name: '예거 르쿨트르', eng: 'JAEGER-LECOULTRE', models: ['리베르소', '마스터', '폴라리스', '랑데부', '듀오미터'] },
  { slug: 'rogerdubuis', name: '로저 드뷔', eng: 'ROGER DUBUIS', models: ['엑스칼리버', '벨벳', '킹스퀘어'] },
  { slug: 'breguet', name: '브레게', eng: 'BREGUET', models: ['클래식', '마린', '트래디션', '헤리티지', '타입 XX'] },
  { slug: 'blancpain', name: '블랑팡', eng: 'BLANCPAIN', models: ['피프티 패덤즈', '빌레레', '르 브라쉬스'] },
  { slug: 'alange', name: 'A. 랑에 운트 죄네', eng: 'A. LANGE & SOHNE', models: ['랑에1', '색소니아', '짜이트베르크', '오디세우스', '1815'] },
  { slug: 'piaget', name: '피아제', eng: 'PIAGET', models: ['알티플라노', '폴로', '라임라이트', '포제션'] },
  { slug: 'hermes', name: '에르메스', eng: 'HERMES', models: ['아쏘', '케이프 코드', '클리퍼', '슬림 데르메스', 'H 아워'] },
  { slug: 'bulgari', name: '불가리', eng: 'BVLGARI', models: ['옥토 피니씨모', '불가리 불가리', '세르펜티', '디바스 드림'] },
  { slug: 'longines', name: '론진', eng: 'LONGINES', models: ['마스터 컬렉션', '컨퀘스트', '하이드로컨퀘스트', '레전드 다이버', '스피릿'] },
  { slug: 'rado', name: '라도', eng: 'RADO', models: ['캡틴쿡', '트루 씬라인', '다이아스타', '센트릭스'] },
  { slug: 'mido', name: '미도', eng: 'MIDO', models: ['오션스타', '멀티포트', '코만더', '바론첼리'] },
  { slug: 'oris', name: '오리스', eng: 'ORIS', models: ['아쿠이스', '빅크라운', '디버스 65', '아트릭스'] },
  { slug: 'seiko', name: '세이코', eng: 'SEIKO', models: ['프레사지', '프로스펙스', '5 스포츠', '아스트론', '킹세이코'] },
  { slug: 'tissot', name: '티쏘', eng: 'TISSOT', models: ['PRX', '씨스타', '르 로끌', '젠틀맨', 'T-터치'] },
  { slug: 'hamilton', name: '해밀턴', eng: 'HAMILTON', models: ['카키 필드', '카키 항공', '재즈마스터', '벤츄라', '아메리칸 클래식'] },
  { slug: 'frederique', name: '프레드릭 콘스탄트', eng: 'FREDERIQUE CONSTANT', models: ['클래식', '슬림라인', '하이라이프', '맨유팩처'] }
];

window.BELLORE_BRAND_LOGO = function (slug) { return 'assets/brands/' + slug + '.png'; };
window.BELLORE_BRAND_BY_NAME = function (name) {
  var list = window.BELLORE_BRANDS, n = String(name || '').trim();
  for (var i = 0; i < list.length; i++) { if (list[i].name === n) return list[i]; }
  return null;
};
// 옛 데이터(영문 브랜드로 저장된 매물, 예: 'ROLEX')를 한글 브랜드명으로 변환해 표시.
// 이미 한글이거나 목록에 없는 브랜드는 원문 그대로 반환.
window.BELLORE_BRAND_KR = function (name) {
  var list = window.BELLORE_BRANDS, n = String(name || '').trim();
  if (!n) return n;
  for (var i = 0; i < list.length; i++) {
    if (list[i].eng && list[i].eng.toUpperCase() === n.toUpperCase()) return list[i].name;
  }
  return n;
};

/* 필터검색·시계등록 공용 속성 목록 (바이버 레퍼런스 기준) */
window.BELLORE_DIAL_COLORS = ['골드', '그린', '그레이', '레드', '브라운', '블루', '블랙', '오렌지', '옐로우', '퍼플', '핑크', '화이트', '실버'];
window.BELLORE_MATERIALS = ['로즈골드', '화이트골드', '옐로우골드', '플래티넘', '스테인리스 스틸', '티타늄'];
