/* 홈 배너의 표시 데이터. DOM·네트워크를 모른다. */

/* 가격대 5종은 컬렉션 가격 필터로, 테마 5종은 검색어로 이동한다.
   배경 사진은 CSS(home-banners.css)에서 data-slug로 지정한다. */
export const CATEGORY_BANNERS = [
  { slug: 'under100', lead: '부담 없이 시작하는', title: '100만원 미만', sub: '데일리로 매일 차기 좋은', max: 1000000 },
  { slug: 'under300', lead: '첫 명품시계로 좋은', title: '300만원 미만', sub: '입문자에게 가장 많이 추천되는', max: 3000000 },
  { slug: 'under500', lead: '가장 많이 찾는', title: '500만원 미만', sub: '오메가 · 태그호이어 · 튜더', max: 5000000 },
  { slug: 'under1000', lead: '롤렉스를 만나는', title: '1,000만원 미만', sub: '엔트리 라인업', max: 10000000 },
  { slug: 'over1000', lead: '평생 소장할', title: '1,000만원 이상', sub: '하이엔드 컬렉션', min: 10000000 },
  { slug: 'wedding', lead: '두 사람의 시작을 위한', title: '예물 시계', sub: '커플로 맞추기 좋은', query: '예물' },
  { slug: 'diver', lead: '바다를 담은', title: '다이버 워치', sub: '서브마리너 · 씨마스터', query: '다이버' },
  { slug: 'datejust', lead: '클래식의 기준', title: '데이트저스트', sub: '롤렉스 대표 라인업', query: '데이트저스트' },
  { slug: 'women', lead: '여성을 위한', title: '여성 시계', sub: '까르띠에 · 샤넬 · 에르메스', query: '여성' },
  { slug: 'vintage', lead: '세월이 만든', title: '빈티지 컬렉션', sub: '희귀 · 단종 모델', query: '빈티지' },
];

/* 매입 배너 문구 15종. 과장 없이, 부담을 덜어주는 톤으로. */
export const BUYIN_COPY = [
  { lead: '시세만 확인해보셔도 괜찮아요', title: ['장롱 속 시계,', '지금 얼마일까요?'] },
  { lead: '보증서가 없어도 괜찮습니다', title: ['보증서 없는 시계도,', '가치는 남아 있습니다'] },
  { lead: '구성품이 없어도 됩니다', title: ['시계만 있어도', '매입 가능합니다'] },
  { lead: '단품도 그대로 봅니다', title: ['풀세트가 아니어도,', '시계의 가치는 그대로'] },
  { lead: '오래 보관하셨다면', title: ['오래 보관한 시계,', '지금 가치를 확인해보세요'] },
  { lead: '다시 꺼내볼 시간입니다', title: ['잠들어 있던 시계,', '다시 가치를 찾을 시간'] },
  { lead: '서류가 없어도 진행됩니다', title: ['보증서 없이도,', '시계 그대로 견적받으세요'] },
  { lead: '정식 절차로 진행합니다', title: ['단품 시계도', '정식으로 매입합니다'] },
  { lead: '지금 시세로 안내드립니다', title: ['안 차는 시계,', '지금의 가치로'] },
  { lead: '연식은 문제되지 않습니다', title: ['오래된 시계도,', '제대로 평가받을 수 있습니다'] },
  { lead: '보관만 하고 계셨다면', title: ['서랍 속 시계에도', '시세는 있습니다'] },
  { lead: '박스가 없어도 괜찮아요', title: ['구성품이 없어도,', '시계는 시계입니다'] },
  { lead: '서류 분실도 괜찮습니다', title: ['보증서가 없어도', '매입은 가능합니다'] },
  { lead: '현재 시세를 알려드립니다', title: ['장롱 속 명품시계,', '현재 가치를 확인하세요'] },
  { lead: '부속품은 없어도 됩니다', title: ['시계 하나만 있어도', '충분합니다'] },
];

export const FEATURED_MAX = 20;

/* 배너 배경은 매물 id로 고정한다 — 같은 시계는 늘 같은 원단 위에 올라온다. */
export function stableIndex(id, length) {
  const text = String(id || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return length > 0 ? hash % length : 0;
}

/* 누끼(투명 배경)로 올린 사진만 원단 위에 시계만 얹는다.
   JPEG는 투명 채널이 없으므로 둥근 카드로 보여준다. */
export function isCutoutPhoto(url) {
  return /\.(png|webp)(\?|#|$)/i.test(String(url || ''));
}

export function shuffled(list, random = Math.random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
