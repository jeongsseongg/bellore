/* 홈 배너의 표시 데이터. DOM·네트워크를 모른다. */

/* 가격대·테마 10종. 배너 이미지는 왼쪽 문구 공간과 오른쪽 시계 구도가 맞는 순서로 연결한다. */
export const CATEGORY_BANNERS = [
  { slug: 'datejust', lead: '매일을 함께할 클래식', title: '데이트저스트', sub: '롤렉스의 가장 대표적인 선택', filter: { brandsAny: ['롤렉스'], termsAny: ['데이트저스트', '데이저스트'] }, image: 'assets/banners/category-01.webp' },
  { slug: 'over1000', lead: '시간을 넘어 남는 이름', title: '1,000만원 이상의 명작', sub: '파텍필립 · 오데마피게 · 바쉐론 콘스탄틴', filter: { brandsAny: ['파텍필립', '오데마피게', '바쉐론 콘스탄틴', '바쉐론콘스탄틴'], min: 10000000 }, image: 'assets/banners/category-02.webp' },
  { slug: 'diver', lead: '깊이에서도 흔들리지 않는', title: '다이버 워치', sub: '서브마리너 · 씨마스터 · 파네라이', filter: { termsAny: ['서브마리너', '씨마스터 다이버', '씨마스터 플래닛오션', '파네라이'] }, image: 'assets/banners/category-03.webp' },
  { slug: 'under500', lead: '가격보다 빛나는 선택', title: '500만원 미만 컬렉션', sub: '오메가 · 태그호이어 · 튜더', filter: { brandsAny: ['오메가', '태그호이어', '튜더'], maxExclusive: 5000000 }, image: 'assets/banners/category-04.webp' },
  { slug: 'women', lead: '손목 위 가장 우아한 빛', title: '여성 명품시계', sub: '까르띠에 · 샤넬 · 에르메스', filter: { brandsAny: ['까르띠에', '샤넬', '에르메스'], audience: 'women' }, image: 'assets/banners/category-05.webp' },
  { slug: 'under1000', lead: '천만원 아래에서 만나는', title: '1,000만원 미만 컬렉션', sub: '롤렉스 · 까르띠에 · IWC', filter: { brandsAny: ['롤렉스', '까르띠에', 'IWC'], maxExclusive: 10000000 }, image: 'assets/banners/category-06.webp' },
  { slug: 'wedding', lead: '함께할 시간을 고르는 순간', title: '예물 시계', sub: '까르띠에 · 샤넬 · 불가리', filter: { brandsAny: ['까르띠에', '샤넬', '불가리'] }, image: 'assets/banners/category-07.webp' },
  { slug: 'vintage', lead: '시간이 더해 만든 가치', title: '빈티지 컬렉션', sub: '희귀 모델부터 단종 모델까지', filter: { vintage: true }, image: 'assets/banners/category-08.webp' },
  { slug: 'fullset', lead: '처음의 모습 그대로', title: '풀세트 컬렉션', sub: '박스와 보증서를 갖춘 매물', filter: { packsAny: ['풀세트'] }, image: 'assets/banners/category-09.webp' },
  { slug: 'under300', lead: '첫 명품시계를 위한 시작', title: '300만원 미만 컬렉션', sub: '해밀턴 · 론진 · 라도 · 구찌', filter: { brandsAny: ['해밀턴', '론진', '라도', '구찌'], maxExclusive: 3000000 }, image: 'assets/banners/category-10.webp' },
];

/* 매입 배너 15종. 설명형 종결어미를 줄이고 짧은 슬로건으로 읽히게 한다. */
export const BUYIN_COPY = [
  { lead: '내 명품시계', title: ['지금 판매하면 얼마일까요?'] },
  { lead: '오랫동안 보관만 한 내 시계', title: ['지금 매입금액은 얼마일까요?'] },
  { lead: '장롱 속에 잠든 명품시계', title: ['지금 한번 판매해볼까요?'] },
  { lead: '요즘 잘 차지 않는 시계', title: ['현재 시세는 얼마일까요?'] },
  { lead: '몇 년째 보관 중인 시계', title: ['그동안 가치는 얼마나 달라졌을까요?'] },
  { lead: '새 시계로 바꾸고 싶다면', title: ['지금 시계는 얼마에 팔 수 있을까요?'] },
  { lead: '보증서를 잃어버린 내 시계', title: ['그래도 판매할 수 있을까요?'] },
  { lead: '박스 없이 시계만 있다면', title: ['매입금액은 얼마나 나올까요?'] },
  { lead: '오래된 명품시계', title: ['지금도 제값을 받을 수 있을까요?'] },
  { lead: '물려받아 보관 중인 시계', title: ['현재 가치는 얼마일까요?'] },
  { lead: '고장 나서 차지 못하는 시계', title: ['이 상태로도 판매할 수 있을까요?'] },
  { lead: '한 번도 시세를 알아보지 않은 시계', title: ['지금 가격이 궁금하지 않으신가요?'] },
  { lead: '모델명을 모르는 내 시계', title: ['사진만으로도 견적을 받을 수 있을까요?'] },
  { lead: '팔까 말까 고민 중이라면', title: ['현재 가치부터 확인해볼까요?'] },
  { lead: '내가 받은 시계 견적', title: ['정말 가장 높은 금액일까요?'] },
];

export const FEATURED_MAX = 10;

export const HERO_COPY = [
  { title: ['검수가 끝난,', '미사용급 풀세트'], sub: '9점 이상 모든 구성품을 갖춘 시계' },
];
export const HERO_FILTER = { packsAny: ['풀세트'], gradeMin: 9 };

/* 배너 배경은 매물 id로 고정한다 — 같은 시계는 늘 같은 원단 위에 올라온다. */
export function stableIndex(id, length) {
  const text = String(id || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return length > 0 ? hash % length : 0;
}
