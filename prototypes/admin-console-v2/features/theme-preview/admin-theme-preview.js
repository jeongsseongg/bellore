const themes = [
  ['bellore', '현재 벨로르', '차분하고 단정한 기준 색상', '#101915', '#1a2925', '#31534a', '#e9f0ed', '#f3f7f5'],
  ['forest', '포레스트', '밝은 화면과 가장 균형적인 딥그린', '#0d2f27', '#16483b', '#3b7864', '#dcece6', '#f5faf8'],
  ['pine', '소나무', '묵직하고 전통적인 명품 분위기', '#102d23', '#1d4735', '#47745a', '#dce8e0', '#f6f9f7'],
  ['emerald', '에메랄드', '선명하고 현대적인 운영 화면', '#064333', '#087052', '#258c68', '#d5eee4', '#f3faf7'],
  ['sage', '세이지', '부드럽고 편안한 밝은 화면', '#294034', '#435f4d', '#718a76', '#e3ebe2', '#f9faf7'],
  ['moss', '모스', '빈티지 시계와 잘 맞는 녹갈색', '#30381f', '#4b5831', '#78845a', '#ebeada', '#faf9f3'],
  ['deep-teal', '딥 틸', '세련되고 디지털 친화적인 청록', '#0b3835', '#155a54', '#338078', '#d8eae8', '#f4f9f8'],
  ['jade', '제이드', '깨끗하고 생기 있는 초록', '#0b3d28', '#17603e', '#3a8860', '#daecdf', '#f5faf7'],
  ['laurel', '로럴', '따뜻하고 자연스러운 월계수색', '#2b3926', '#485b3c', '#7a8b64', '#e8ecdd', '#fafbf6'],
  ['hunter', '헌터', '중후하고 전통적인 딥그린', '#102d20', '#1d4932', '#496e58', '#dde7e0', '#f6f9f7'],
  ['bottle', '보틀', '강한 브랜드 인상의 짙은 녹색', '#052c22', '#094936', '#246a50', '#d5e7df', '#f3f8f6'],
  ['eucalyptus', '유칼립투스', '부드럽고 세련된 회녹색', '#1a3a32', '#2c594c', '#5d806f', '#dee9e5', '#f7faf9'],
  ['cypress', '사이프러스', '차분하고 안정적인 업무 화면', '#193129', '#294a3d', '#607767', '#e0e7e2', '#f8faf8'],
  ['mint', '프레시 민트', '밝고 젊은 서비스 분위기', '#083d2c', '#0b6446', '#2eaa7b', '#d4f0e4', '#f2fbf7'],
  ['olive', '딥 올리브', '빈티지 시계와 조화로운 녹색', '#30321a', '#4f5229', '#7e8150', '#eae8d6', '#faf9f2'],
  ['garden', '가든', '친근하면서 신뢰감 있는 초록', '#173a2a', '#285b3f', '#568467', '#dce9df', '#f6faf7'],
  ['mist', '숲안개', '여백이 돋보이는 부드러운 회녹색', '#213a30', '#38564a', '#718b7d', '#e3ebe7', '#f8faf9'],
  ['bamboo', '대나무', '자연스럽고 선명한 중간 녹색', '#1d402f', '#326146', '#628d6c', '#deeadf', '#f6faf7'],
  ['teal-forest', '청록숲', '차갑고 정돈된 프리미엄 청록', '#0a3532', '#12514b', '#3a786f', '#dceae7', '#f4f9f8'],
  ['black-forest', '검은숲', '대비가 강한 최고 농도의 딥그린', '#071f19', '#0d3529', '#315848', '#d7e4de', '#f3f7f5'],
  ['naver', '네이버 그린', '선명하고 익숙한 네이버 대표 초록', '#034525', '#05743b', '#03c75a', '#d5f5e2', '#f2fcf6'],
  ['shamrock', '샴록', '밝고 활기찬 서비스형 초록', '#064631', '#087052', '#00a86b', '#d6f1e6', '#f3fbf8'],
  ['kelly', '켈리', '친근하고 명확한 정통 초록', '#153e2a', '#24623e', '#3a915b', '#dceddf', '#f6faf7'],
  ['malachite', '말라카이트', '채도가 높고 선명한 보석 초록', '#06452c', '#087044', '#0b9b59', '#d6f0e1', '#f3fbf6'],
  ['peridot', '페리도트', '가볍고 산뜻한 황록색', '#35451f', '#52672d', '#79a33d', '#e8efd8', '#fafcf5'],
  ['racing', '레이싱 그린', '클래식하고 깊은 영국식 녹색', '#002719', '#004225', '#276349', '#d5e4dc', '#f3f8f5'],
  ['peacock', '피콕', '청량하고 고급스러운 청록색', '#003d35', '#006052', '#148477', '#d5ebe7', '#f3faf8'],
  ['spruce', '가문비', '차분하고 안정적인 숲의 회녹색', '#243d32', '#365846', '#64806f', '#e0e9e4', '#f8faf9'],
  ['apple', '애플 그린', '부드럽고 생기 있는 자연 초록', '#29451f', '#47682f', '#6e9a45', '#e4edd9', '#f9fbf5'],
  ['clover', '클로버', '깨끗하고 신뢰감 있는 중간 초록', '#103f2b', '#1c6243', '#31865d', '#d9ece1', '#f5faf7']
].map(([id, name, description, deepest, deep, accent, soft, pale], index) => ({
  id, name, description, deepest, deep, accent, soft, pale, number: String(index + 1).padStart(2, '0')
}));

const tokenNames = ['--green-950', '--green-900', '--green-850', '--green-800', '--green-700', '--green-100', '--green-50'];

function themeTokens(theme) {
  return [theme.deepest, theme.deepest, theme.deep, theme.deep, theme.accent, theme.soft, theme.pale];
}

function cardMarkup(theme) {
  return `
    <button class="theme-option${theme.id === 'bellore' ? ' is-selected' : ''}" type="button" data-theme-id="${theme.id}" aria-pressed="${theme.id === 'bellore'}">
      <span class="theme-option__number">${theme.number}</span>
      <span class="theme-option__primary" aria-hidden="true"><b>운영 관리자</b></span>
      <span class="theme-option__sample" aria-hidden="true">
        <i data-color="pale"></i><i data-color="soft"></i><i data-color="accent"></i><i data-color="deep"></i>
      </span>
      <span class="theme-option__copy"><b>${theme.name}</b><small>${theme.description}</small></span>
      <span class="theme-option__state">선택</span>
    </button>`;
}

function pageMarkup() {
  return `
    <div class="workspace-page admin-theme-preview-page" data-page="themePalette">
      <div class="page-heading">
        <div>
          <div class="heading-meta"><span class="eyebrow">화면 관리</span><span class="coverage-chip is-current">30가지 비교</span></div>
          <h1>벨로르 그린 색상 비교</h1>
          <p>네이버 대표 초록을 포함한 30가지 색상을 비교하고 누른 색상을 관리자·홈·마이페이지 예시에 바로 적용합니다.</p>
        </div>
        <div class="page-actions"><button class="secondary-button" type="button" data-theme-reset>현재 벨로르색으로 돌아가기</button></div>
      </div>

      <section class="theme-live-preview" aria-labelledby="themePreviewTitle">
        <div class="theme-live-preview__head">
          <div><span>선택한 색상</span><h2 id="themePreviewTitle">현재 벨로르</h2><p data-theme-description>차분하고 단정한 기준 색상</p></div>
          <strong data-theme-status>01 / 30</strong>
        </div>
        <div class="theme-preview-surfaces">
          <article class="theme-preview-admin"><header><i></i><b>운영 관리자</b><span></span></header><div><aside></aside><main><span></span><strong>오늘 처리할 일</strong><p>견적 승인과 주문 처리를 확인합니다.</p><button type="button">업무 확인</button></main></div></article>
          <article class="theme-preview-store"><header><b>BELLORE</b><span>MY</span></header><main><small>회원</small><h3>정성호님</h3><p>주문과 비교견적 현황을 확인하세요.</p><div><span>주문 내역</span><span>비교견적</span><span>관심 상품</span></div><button type="button">내 거래 확인</button></main></article>
        </div>
        <p class="theme-preview-note">선택 즉시 현재 관리자 화면에 임시 적용됩니다. 운영 고객 화면에는 저장되지 않습니다.</p>
      </section>

      <section class="theme-options-section" aria-labelledby="themeOptionsTitle">
        <div class="theme-options-heading"><div><span class="eyebrow">전체 색상</span><h2 id="themeOptionsTitle">30가지 모두 보기</h2></div><p>가장 큰 막대가 운영 관리자 메인색이며, 아래에서 밝은 배경·보조색·포인트·딥그린을 함께 비교합니다.</p></div>
        <div class="theme-options-grid">${themes.map(cardMarkup).join('')}</div>
      </section>
    </div>`;
}

function paintCard(card, theme) {
  card.querySelector('.theme-option__primary').style.backgroundColor = theme.deep;
  card.querySelector('[data-color="pale"]').style.backgroundColor = theme.pale;
  card.querySelector('[data-color="soft"]').style.backgroundColor = theme.soft;
  card.querySelector('[data-color="accent"]').style.backgroundColor = theme.accent;
  card.querySelector('[data-color="deep"]').style.backgroundColor = theme.deep;
}

export function createAdminThemePreview() {
  function mount(root) {
    const page = root.querySelector('[data-page="themePalette"]');
    if (!page) return;
    const adminApp = document.getElementById('adminApp');

    function select(theme) {
      page.querySelectorAll('[data-theme-id]').forEach((card) => {
        const active = card.dataset.themeId === theme.id;
        card.classList.toggle('is-selected', active);
        card.setAttribute('aria-pressed', String(active));
      });
      page.querySelector('#themePreviewTitle').textContent = theme.name;
      page.querySelector('[data-theme-description]').textContent = theme.description;
      page.querySelector('[data-theme-status]').textContent = `${theme.number} / 30`;
      themeTokens(theme).forEach((value, index) => adminApp.style.setProperty(tokenNames[index], value));
    }

    page.querySelectorAll('[data-theme-id]').forEach((card) => {
      const theme = themes.find((item) => item.id === card.dataset.themeId);
      paintCard(card, theme);
      card.addEventListener('click', () => select(theme));
    });
    page.querySelector('[data-theme-reset]').addEventListener('click', () => select(themes[0]));
    select(themes[0]);
  }

  return { render: pageMarkup, mount };
}
