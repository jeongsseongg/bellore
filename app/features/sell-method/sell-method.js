import { createSellReferenceController } from './sell-reference-controller.js?v=20260826-sell-services-blue-v1';
import { createSellQuoteController } from './sell-quote-controller.js?v=20260826-sell-services-blue-v1';
import { createSellGuidePreview } from './sell-guide-preview.js?v=20260826-sell-services-blue-v1';

const METHODS = new Set(['compare', 'consignment', 'instant']);
const DB_NAME = 'bellore-sell-drafts';
const STORE_NAME = 'drafts';
const DRAFT_ID = 'current';
const FALLBACK_BRANDS = [
  { slug: 'rolex', name: '롤렉스', eng: 'ROLEX', models: ['서브마리너', '데이트저스트', '데이데이트', 'GMT마스터 II', '스카이드웰러', '요트마스터', '데이토나', '익스플로러', '씨드웰러', '에어킹', '오이스터 퍼페추얼'] },
  { slug: 'patek', name: '파텍필립', eng: 'PATEK PHILIPPE', models: ['노틸러스', '아쿠아넛', '칼라트라바', '컴플리케이션', '그랜드 컴플리케이션'] },
  { slug: 'ap', name: '오데마피게', eng: 'AUDEMARS PIGUET', models: ['로얄오크', '로얄오크 오프쇼어', '로얄오크 컨셉', '코드 11.59'] },
  { slug: 'vacheron', name: '바쉐론 콘스탄틴', eng: 'VACHERON CONSTANTIN', models: ['오버시즈', '패트리모니', '트래디셔널', '피프티식스'] },
  { slug: 'cartier', name: '까르띠에', eng: 'CARTIER', models: ['산토스', '탱크', '발롱블루', '파샤', '롱드'] },
  { slug: 'omega', name: '오메가', eng: 'OMEGA', models: ['스피드마스터', '씨마스터', '컨스텔레이션', '드빌', '아쿠아테라'] },
  { slug: 'richardmille', name: '리차드밀', eng: 'RICHARD MILLE', models: ['RM 011', 'RM 035', 'RM 055', 'RM 07'] },
  { slug: 'franckmuller', name: '프랭크 뮬러', eng: 'FRANCK MULLER', models: ['카사블랑카', '톤보', '본투바이', '롱아일랜드'] }
];
const ACCESSORY_QUESTIONS = [
  { value: 'warranty', label: '보증서', question: '보증서가 있나요?', image: '구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_56 (1).png' },
  { value: 'box', label: '정품 박스', question: '정품 박스가 있나요?', image: '구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_57 (3).png' },
  { value: 'manual', label: '설명서·책자', question: '설명서나 책자가 있나요?', image: '구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_57 (5).png' },
  { value: 'extra-link', label: '추가 링크', question: '여분의 시계줄 링크가 있나요?', image: '구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_56 (2).png' },
  { value: 'tag', label: '정품 택', question: '정품 택이 있나요?', image: '구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_57 (4).png' },
  { value: 'receipt', label: '구매 영수증', question: '구매 영수증이 있나요?', image: '구성품 이미지/ChatGPT Image 2026년 8월 26일 오전 11_18_58 (6).png' }
];
const METHOD_CONTENT = {
  compare: { label: '비교견적', eyebrow: '72시간 파트너 입찰', title: '비교견적 신청', description: '시계 정보를 한 번만 등록하면 벨로르 제휴사들의 견적을 비교하고 원하는 금액을 선택할 수 있습니다.', image: '시계판매 이미지/비교견적.png', submit: '비교견적 신청하기', note: '* 등록 후 정가품 구별 및 감정 승인 절차가 진행됩니다.' },
  consignment: { label: '위탁판매', eyebrow: '벨로르 판매금액 안내', title: '위탁판매 신청', description: '시계 정보를 보내주시면 벨로르가 판매금액을 안내하고, 수락 후 실물 검수와 판매를 진행합니다.', image: '시계판매 이미지/위탁판매.png', submit: '위탁판매 신청하기', note: '* 판매 성사 시 안내 판매금액의 7% 수수료가 발생합니다.' },
  instant: { label: '즉시매입', eyebrow: '빠른 매입금액 안내', title: '즉시매입 신청', description: '사진과 정보를 확인해 매입 가능금액을 안내하고, 실물 검수 후 감가 사유와 최종금액을 안내합니다.', image: '시계판매 이미지/즉시매입.png', submit: '즉시매입 신청하기', note: '* 실물이 사진·정보와 다르면 감가 사유와 변경된 최종금액을 안내드립니다.' }
};

function dbRequest(window, mode, action) {
  return new Promise((resolve, reject) => {
    const opening = window.indexedDB.open(DB_NAME, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction(STORE_NAME, mode);
      const request = action(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
    };
  });
}

export function initSellMethodSheet({ document, window, backend }) {
  const root = document.getElementById('sellMethodSheet');
  const form = document.getElementById('compareForm');
  const hero = document.getElementById('sellFormHero');
  if (!root || !form || !hero) return;

  const sheet = root.querySelector('.sell-method__sheet');
  const mount = document.getElementById('sellMethodFormMount');
  const views = Object.fromEntries([...root.querySelectorAll('[data-sell-view]')].map((node) => [node.dataset.sellView, node]));
  const resume = document.getElementById('sellMethodResume');
  const resumeTitle = document.getElementById('sellMethodResumeTitle');
  const resumeTime = document.getElementById('sellMethodResumeTime');
  const draftTitle = document.getElementById('sellDraftTitle');
  const draftStatus = document.getElementById('sellDraftStatus');
  const guide = document.getElementById('sellGuidedFlow');
  const guideIdentity = document.getElementById('sellGuideIdentity');
  const guideDetails = document.getElementById('sellGuideDetails');
  const guideQuestion = document.getElementById('sellGuideQuestion');
  const guideBrandInput = document.getElementById('sellGuideBrandInput');
  const guideBrandSuggestions = document.getElementById('sellGuideBrandSuggestions');
  const guideModelGroup = document.getElementById('sellGuideModelGroup');
  const guideModelInput = document.getElementById('sellGuideModelInput');
  const guideModelSuggestions = document.getElementById('sellGuideModelSuggestions');
  const guideNext = document.getElementById('sellGuideNext');
  const guideDetailsBack = document.getElementById('sellGuideDetailsBack');
  const guideDetailsNext = document.getElementById('sellGuideDetailsNext');
  const guideRefInput = document.getElementById('sellGuideRefInput');
  const guideRefSuggestions = document.getElementById('sellGuideRefSuggestions');
  const guideYearInput = document.getElementById('sellGuideYearInput');
  const guideYearSuggestions = document.getElementById('sellGuideYearSuggestions');
  const guideQuestionProgress = document.getElementById('sellGuideQuestionProgress');
  const guideQuestionImage = document.getElementById('sellGuideQuestionImage');
  const guideQuestionTitle = document.getElementById('sellGuideQuestionTitle');
  const directEntry = document.getElementById('sellDirectEntry');
  const brandField = form.querySelector('[name="brand"]');
  const modelField = form.querySelector('[name="model"]');
  const refField = form.querySelector('[name="ref"]');
  const yearField = form.querySelector('[name="year"]');
  let returnFocus = null;
  let activeView = 'chooser';
  let pendingClose = null;
  let saveTimer = 0;
  let lastDraft = null;
  let draftPhotos = [];
  let entryMode = 'guided';
  let selectedBrand = null;
  let selectedModel = '';
  let accessoryIndex = 0;
  let guideComplete = false;
  let referenceController;
  let quoteController;

  mount.append(hero, form);
  const oldPage = document.getElementById('compare');
  if (oldPage) oldPage.remove();
  if (window.location.hash === '#compare') {
    window.history.replaceState({ page: 'home' }, '', window.location.pathname + window.location.search);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { page: 'home' } }));
  }

  function showView(name) {
    activeView = name;
    Object.entries(views).forEach(([key, node]) => { node.hidden = key !== name; });
    sheet.scrollTop = 0;
  }

  function brands() {
    return Array.isArray(window.BELLORE_BRANDS) && window.BELLORE_BRANDS.length ? window.BELLORE_BRANDS : FALLBACK_BRANDS;
  }

  const makePreview = (options) => createSellGuidePreview(document, options);

  function syncBrandToForm(brand) {
    if (!brandField) return;
    const value = brand.custom ? brand.name : (brand.eng + ' (' + brand.name + ')');
    let option = [...brandField.options].find((item) => item.value === value);
    if (!option) {
      option = document.createElement('option');
      option.value = value;
      option.textContent = brand.custom ? value : (brand.eng + ' (' + brand.name + ')');
      brandField.append(option);
    }
    brandField.value = value;
    brandField.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function chooseBrand(brand) {
    selectedBrand = brand;
    selectedModel = '';
    guideBrandInput.value = brand.name;
    guideModelInput.value = '';
    guideModelGroup.hidden = false;
    guideNext.disabled = true;
    syncBrandToForm(brand);
    if (modelField) modelField.value = '';
    renderBrandSuggestions(guideBrandInput.value);
    renderModelSuggestions('');
    guideModelInput.focus({ preventScroll: true });
  }

  function renderBrandSuggestions(query) {
    const raw = String(query || '').trim();
    const q = raw.toLowerCase().replace(/\s+/g, '');
    const matches = brands().filter((brand) => {
      const target = (brand.name + brand.eng).toLowerCase().replace(/\s+/g, '');
      return !q || target.includes(q);
    });
    guideBrandSuggestions.replaceChildren();
    const exact = matches.some((brand) => brand.name.toLowerCase() === raw.toLowerCase() || brand.eng.toLowerCase() === raw.toLowerCase());
    if (raw && !exact) {
      const custom = { custom: true, slug: '', name: raw, eng: raw, models: [] };
      guideBrandSuggestions.append(makePreview({ title: raw, subtitle: '입력한 브랜드로 선택', selected: selectedBrand?.custom && selectedBrand.name === raw, onClick: () => chooseBrand(custom) }));
    }
    matches.forEach((brand) => {
      const logo = window.BELLORE_BRAND_LOGO ? window.BELLORE_BRAND_LOGO(brand.slug) : ('assets/brands/' + brand.slug + '.png');
      guideBrandSuggestions.append(makePreview({ logo, title: brand.name, subtitle: brand.eng, selected: selectedBrand?.slug === brand.slug, onClick: () => chooseBrand(brand) }));
    });
  }

  function chooseModel(model) {
    selectedModel = model;
    guideModelInput.value = model;
    if (modelField) {
      modelField.value = model;
      modelField.dispatchEvent(new Event('input', { bubbles: true }));
    }
    guideNext.disabled = !selectedBrand || !selectedModel;
    renderModelSuggestions(model);
    referenceController.render('');
  }

  referenceController = createSellReferenceController({
    backend,
    elements: { details: guideDetails, input: guideRefInput, list: guideRefSuggestions, field: refField },
    selected: { brand: () => selectedBrand, model: () => selectedModel },
    makePreview,
    syncDetail: syncGuideDetail
  });
  quoteController = createSellQuoteController({
    document, window, backend, root, sheet, chooser: views.chooser, showView,
    activeView: () => activeView,
    openedBy: (trigger) => { returnFocus = trigger || returnFocus || document.activeElement; }
  });
  views.quotes = root.querySelector('[data-sell-view="quotes"]');

  function renderModelSuggestions(query) {
    const raw = String(query || '').trim();
    const q = raw.toLowerCase().replace(/\s+/g, '');
    const models = Array.isArray(selectedBrand?.models) ? selectedBrand.models : [];
    const matches = models.filter((model) => !q || model.toLowerCase().replace(/\s+/g, '').includes(q));
    guideModelSuggestions.replaceChildren();
    const exact = matches.some((model) => model.toLowerCase() === raw.toLowerCase());
    if (raw && !exact) {
      guideModelSuggestions.append(makePreview({ title: raw, subtitle: '입력한 모델명으로 선택', selected: selectedModel === raw, onClick: () => chooseModel(raw) }));
    }
    matches.forEach((model) => {
      guideModelSuggestions.append(makePreview({ title: model, subtitle: selectedBrand?.name || '모델 미리보기', selected: selectedModel === model, onClick: () => chooseModel(model) }));
    });
  }

  function syncGuideDetail(field, input, value) {
    const normalized = String(value || '').trim();
    input.value = normalized;
    if (field) {
      field.value = normalized;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function renderYearSuggestions(query) {
    const raw = String(query || '').trim();
    const q = raw.replace(/[^0-9가-힣]/g, '');
    const currentYear = new Date().getFullYear();
    const options = ['잘 모름', '빈티지/확인 필요'];
    for (let year = currentYear; year >= 1980; year -= 1) options.push(year + '년');
    const matches = options.filter((value) => !q || value.replace(/[^0-9가-힣]/g, '').includes(q));
    guideYearSuggestions.replaceChildren();
    matches.forEach((value) => {
      guideYearSuggestions.append(makePreview({
        title: value,
        subtitle: value === '잘 모름' ? '검수 후 확인' : '스탬핑 또는 제품 연식',
        selected: guideYearInput.value === value,
        hideLogo: true,
        onClick: () => {
          syncGuideDetail(yearField, guideYearInput, value);
          renderYearSuggestions(value);
        }
      }));
    });
  }

  function showIdentityStep() {
    guideIdentity.hidden = false; guideDetails.hidden = true; guideQuestion.hidden = true;
    sheet.scrollTop = 0;
  }

  function showDetailsStep() {
    guideIdentity.hidden = true; guideDetails.hidden = false; guideQuestion.hidden = true;
    referenceController.render(guideRefInput.value);
    renderYearSuggestions(guideYearInput.value);
    sheet.scrollTop = 0;
  }

  function showAccessoryQuestion(index) {
    accessoryIndex = Math.max(0, Math.min(index, ACCESSORY_QUESTIONS.length - 1));
    const question = ACCESSORY_QUESTIONS[accessoryIndex];
    guideIdentity.hidden = true; guideDetails.hidden = true; guideQuestion.hidden = false;
    guideQuestionProgress.textContent = '구성품 ' + (accessoryIndex + 1) + ' / ' + ACCESSORY_QUESTIONS.length;
    guideQuestionImage.src = question.image;
    guideQuestionImage.alt = question.label;
    guideQuestionTitle.textContent = question.question;
    sheet.scrollTop = 0;
  }

  function setEntryMode(mode) {
    entryMode = mode === 'manual' || mode === 'details' ? mode : 'guided';
    guide.hidden = entryMode !== 'guided';
    mount.hidden = entryMode === 'guided';
    mount.classList.toggle('is-guided-details', entryMode === 'details');
    directEntry.textContent = entryMode === 'manual' ? (guideComplete ? '간편입력' : '안내입력') : (entryMode === 'details' ? '전체입력' : '직접입력');
    if (entryMode === 'manual') {
      if (isDirty()) scheduleSave();
      else if (draftStatus) draftStatus.textContent = '직접 입력 모드 · 입력 내용 자동 저장';
    } else if (entryMode === 'details') {
      scheduleSave();
      if (draftStatus) draftStatus.textContent = '안내 입력 저장됨 · 사진과 연락처를 입력해주세요';
    } else {
      showIdentityStep();
      renderBrandSuggestions(guideBrandInput.value);
    }
    sheet.scrollTop = 0;
  }

  function resetGuide() {
    selectedBrand = null;
    selectedModel = '';
    accessoryIndex = 0;
    guideComplete = false;
    guideBrandInput.value = '';
    guideModelInput.value = '';
    guideRefInput.value = '';
    guideYearInput.value = '';
    guideModelGroup.hidden = true;
    guideNext.disabled = true;
    [brandField, modelField, refField, yearField].forEach((field) => { if (field) field.value = ''; });
    form.querySelectorAll('[name="parts"]').forEach((field) => { field.checked = false; });
    ACCESSORY_QUESTIONS.forEach((question) => {
      const field = form.querySelector('[name="guide_parts_' + question.value + '"]');
      if (field) field.value = '';
    });
    renderBrandSuggestions('');
    guideModelSuggestions.replaceChildren();
    referenceController.render('');
    renderYearSuggestions('');
    showIdentityStep();
  }

  function applyFormMethod(method) {
    const safeMethod = METHODS.has(method) ? method : 'compare';
    const content = METHOD_CONTENT[safeMethod];
    const methodInput = document.getElementById('saleMethodInput');
    const image = document.getElementById('sellFormImage');
    const eyebrow = document.getElementById('sellFormEyebrow');
    const title = document.getElementById('sellFormTitle');
    const description = document.getElementById('sellFormDescription');
    const priceField = document.getElementById('consignmentPriceField');
    const priceInput = document.getElementById('desiredPriceInput');
    const submit = document.getElementById('sellFormSubmit');
    const note = document.getElementById('sellFormNote');
    if (methodInput) methodInput.value = safeMethod;
    hero.dataset.method = safeMethod;
    if (image) image.src = content.image;
    if (eyebrow) eyebrow.textContent = content.eyebrow;
    if (title) title.textContent = content.title;
    if (description) description.textContent = content.description;
    if (priceField) priceField.hidden = true;
    if (priceInput) priceInput.required = false;
    if (submit) submit.textContent = content.submit;
    if (note) note.textContent = content.note;
    if (draftTitle) draftTitle.textContent = content.label + ' 양식';
  }

  function getPhotos() {
    return draftPhotos.slice();
  }

  function formValues() {
    const values = {};
    [...form.elements].forEach((field) => {
      if (!field.name || field.type === 'file' || field.disabled) return;
      if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) return;
      if (!values[field.name]) values[field.name] = [];
      values[field.name].push(field.value);
    });
    return values;
  }

  function isDirty() {
    const hasValue = Object.entries(formValues()).some(([name, items]) => name !== 'sale_method' && items.some((value) => String(value).trim()));
    return hasValue || getPhotos().length > 0;
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(timestamp);
  }

  async function readDraft() {
    try { return await dbRequest(window, 'readonly', (store) => store.get(DRAFT_ID)); }
    catch (error) { console.warn('[Bellore] 판매 양식 저장본을 읽지 못했습니다.', error); return null; }
  }

  function updateResume(draft) {
    if (!resume) return;
    resume.hidden = !draft;
    if (!draft) return;
    const content = METHOD_CONTENT[draft.method] || METHOD_CONTENT.compare;
    resumeTitle.textContent = '작성 중인 ' + content.label + ' 이어쓰기';
    resumeTime.textContent = formatTime(draft.updatedAt) + ' 저장';
  }

  async function writeDraft() {
    if (!isDirty()) {
      try { await dbRequest(window, 'readwrite', (store) => store.delete(DRAFT_ID)); }
      catch (error) { console.warn('[Bellore] 비어 있는 판매 양식 저장본 정리 실패', error); }
      lastDraft = null;
      updateResume(null);
      if (draftStatus) draftStatus.textContent = '입력 내용 자동 저장';
      return null;
    }
    const draft = { id: DRAFT_ID, method: document.getElementById('saleMethodInput')?.value || 'compare', stage: entryMode, guideComplete, values: formValues(), photos: getPhotos(), updatedAt: Date.now() };
    try {
      await dbRequest(window, 'readwrite', (store) => store.put(draft));
      lastDraft = draft;
      if (draftStatus) draftStatus.textContent = '자동 저장됨 · ' + formatTime(draft.updatedAt);
      updateResume(draft);
      return draft;
    } catch (error) {
      console.error('[Bellore] 판매 양식 자동 저장 실패', error);
      if (draftStatus) draftStatus.textContent = '자동 저장에 실패했습니다';
      return null;
    }
  }

  async function clearDraft() {
    window.clearTimeout(saveTimer);
    try { await dbRequest(window, 'readwrite', (store) => store.delete(DRAFT_ID)); }
    catch (error) { console.warn('[Bellore] 제출 후 판매 양식 저장본 삭제 실패', error); }
    lastDraft = null;
    updateResume(null);
  }

  function scheduleSave() {
    if (draftStatus) draftStatus.textContent = '저장 중…';
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(writeDraft, 320);
  }

  function restoreDraft(draft) {
    if (!draft) return;
    applyFormMethod(draft.method);
    Object.entries(draft.values || {}).forEach(([name, values]) => {
      [...form.elements].filter((field) => field.name === name).forEach((field) => {
        if (field.type === 'checkbox' || field.type === 'radio') field.checked = values.includes(field.value);
        else field.value = values[0] || '';
      });
    });
    draftPhotos = Array.isArray(draft.photos) ? draft.photos.slice() : [];
    window.dispatchEvent(new CustomEvent('bellore:sell-photos-restore', { detail: { photos: draftPhotos } }));
    showView('form');
    guideComplete = draft.guideComplete === true || draft.stage === 'details';
    setEntryMode(guideComplete ? 'details' : 'manual');
    if (draftStatus) draftStatus.textContent = '자동 저장됨 · ' + formatTime(draft.updatedAt);
  }

  async function open(trigger) {
    returnFocus = trigger || document.activeElement;
    lastDraft = await readDraft();
    updateResume(lastDraft);
    showView('chooser');
    root.hidden = false;
    document.body.classList.add('sell-method-open');
    window.requestAnimationFrame(() => { root.classList.add('is-open'); sheet.focus({ preventScroll: true }); });
  }

  function closeNow({ restoreFocus = true } = {}) {
    root.classList.remove('is-open');
    document.body.classList.remove('sell-method-open');
    window.setTimeout(() => {
      root.hidden = true;
      showView('chooser');
      if (restoreFocus && returnFocus && document.contains(returnFocus)) returnFocus.focus();
    }, 1000);
  }

  async function requestClose(action) {
    if (activeView === 'form' && isDirty()) {
      await writeDraft();
      pendingClose = action || (() => closeNow());
      showView('leave');
      return;
    }
    (action || (() => closeNow()))();
  }

  function select(method) {
    if (!METHODS.has(method)) return;
    form.reset();
    draftPhotos = [];
    window.dispatchEvent(new CustomEvent('bellore:sell-photos-restore', { detail: { photos: [] } }));
    applyFormMethod(method);
    if (draftStatus) draftStatus.textContent = '입력 내용 자동 저장';
    resetGuide();
    showView('form');
    setEntryMode('guided');
    scheduleSave();
    window.dispatchEvent(new CustomEvent('bellore:sale-method-selected', { detail: { method } }));
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-sell-method-open]');
    if (trigger) { event.preventDefault(); open(trigger); return; }
    const quoteTrigger = event.target.closest('[data-sell-quotes-open]');
    if (quoteTrigger) { event.preventDefault(); quoteController.open(quoteTrigger, quoteTrigger.dataset.sellQuoteId); return; }
    if (!root.hidden && event.target.closest('[data-sell-method-close]')) { event.preventDefault(); requestClose(); }
  });

  root.addEventListener('click', async (event) => {
    const choice = event.target.closest('[data-sell-method]');
    if (choice) { select(choice.dataset.sellMethod); return; }
    if (event.target.closest('#sellMethodResume')) { restoreDraft(lastDraft || await readDraft()); return; }
    if (event.target.closest('[data-sell-form-back]')) { requestClose(() => showView('chooser')); return; }
    if (event.target.closest('[data-sell-leave-cancel]')) { pendingClose = null; showView('form'); return; }
    if (event.target.closest('[data-sell-leave-confirm]')) {
      await writeDraft();
      const action = pendingClose || (() => closeNow());
      pendingClose = null;
      action();
    }
    await quoteController.handleClick(event);
  });

  directEntry.addEventListener('click', () => {
    if (entryMode === 'manual') setEntryMode(guideComplete ? 'details' : 'guided');
    else setEntryMode('manual');
  });

  guideBrandInput.addEventListener('input', () => {
    selectedBrand = null;
    selectedModel = '';
    guideModelInput.value = '';
    guideModelGroup.hidden = true;
    guideNext.disabled = true;
    if (brandField) brandField.value = '';
    if (modelField) modelField.value = '';
    renderBrandSuggestions(guideBrandInput.value);
  });

  guideModelInput.addEventListener('input', () => {
    selectedModel = '';
    guideNext.disabled = true;
    if (modelField) modelField.value = '';
    renderModelSuggestions(guideModelInput.value);
  });

  guideNext.addEventListener('click', () => {
    if (selectedBrand && selectedModel) showDetailsStep();
  });

  guideDetailsBack.addEventListener('click', showIdentityStep);

  guideRefInput.addEventListener('input', () => {
    syncGuideDetail(refField, guideRefInput, guideRefInput.value);
    referenceController.render(guideRefInput.value);
  });
  guideYearInput.addEventListener('input', () => {
    syncGuideDetail(yearField, guideYearInput, guideYearInput.value);
    renderYearSuggestions(guideYearInput.value);
  });

  guideDetailsNext.addEventListener('click', () => showAccessoryQuestion(0));

  document.getElementById('sellGuideQuestionBack').addEventListener('click', () => {
    if (accessoryIndex === 0) showDetailsStep();
    else showAccessoryQuestion(accessoryIndex - 1);
  });

  guideQuestion.addEventListener('click', (event) => {
    const answer = event.target.closest('[data-guide-answer]');
    if (!answer) return;
    const question = ACCESSORY_QUESTIONS[accessoryIndex];
    const checkbox = [...form.querySelectorAll('[name="parts"]')].find((field) => field.value === question.value);
    const guideAnswer = form.querySelector('[name="guide_parts_' + question.value + '"]');
    if (guideAnswer) guideAnswer.value = answer.dataset.guideAnswer;
    if (checkbox) {
      checkbox.checked = answer.dataset.guideAnswer === 'yes';
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (accessoryIndex < ACCESSORY_QUESTIONS.length - 1) {
      showAccessoryQuestion(accessoryIndex + 1);
    } else {
      guideComplete = true;
      setEntryMode('details');
    }
  });

  form.addEventListener('input', scheduleSave);
  form.addEventListener('change', scheduleSave);
  window.addEventListener('bellore:sell-photos-changed', (event) => {
    draftPhotos = Array.isArray(event.detail?.photos) ? event.detail.photos.slice() : [];
    scheduleSave();
  });
  window.addEventListener('bellore:sell-submitted', async () => { await clearDraft(); closeNow({ restoreFocus: false }); });
  window.addEventListener('beforeunload', (event) => {
    if (activeView === 'form' && isDirty()) { event.preventDefault(); event.returnValue = ''; }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && activeView === 'form' && isDirty()) writeDraft();
  });
  window.addEventListener('pagehide', () => {
    if (activeView === 'form' && isDirty()) writeDraft();
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !root.hidden) requestClose(); });

  referenceController.connect();
  quoteController.connect();

  applyFormMethod('compare');
  resetGuide();
  setEntryMode('guided');
  readDraft().then((draft) => { lastDraft = draft; updateResume(draft); });
}

function boot() { initSellMethodSheet({ document, window, backend: globalThis['NWBackend'] }); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
