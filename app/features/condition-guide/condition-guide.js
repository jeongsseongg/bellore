const CONDITION_PATTERN = /(?:^|\s)(?:중고\s*)?(10|[1-9])\/10(?:\s*·\s*([^\n]+))?/;

const SCORE_ROWS = [
  [10, '미사용급', '착용 흔적을 거의 확인하기 어려운 상태'],
  [9, '최상', '아주 미세한 보관·착용 흔적만 확인되는 상태'],
  [8, '상급', '가벼운 생활 스크래치가 있으나 전체적으로 깔끔한 상태'],
  [7, '양호', '일반적인 사용 흔적이 있으나 착용에 무리가 없는 상태'],
  [6, '보통 이상', '눈에 띄는 사용 흔적이 일부 있는 상태'],
  [5, '보통', '전반적인 사용감과 스크래치가 확인되는 상태'],
  [4, '사용감 많음', '다수의 흠집과 마모가 확인되는 상태'],
  [3, '정비 권장', '외관 손상 또는 정비 필요 가능성이 큰 상태'],
  [2, '수리 필요', '큰 손상이나 부품 수리가 필요한 상태'],
  [1, '정상 사용 어려움', '복원·수리 전 정상 착용이 어려운 상태'],
];

function createHelpButton(document) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'condition-guide-help';
  button.textContent = '?';
  button.setAttribute('aria-label', '시계 상태 점수 안내');
  button.setAttribute('aria-haspopup', 'dialog');
  return button;
}

function conditionMatch(element) {
  const text = String(element?.textContent || '').replace(/\s+/g, ' ').trim();
  return text.match(CONDITION_PATTERN);
}

function decorateCondition(element, document) {
  if (!element || element.querySelector('.condition-guide-help')) return;
  const match = conditionMatch(element);
  if (!match) return;
  element.classList.add('has-condition-guide');
  const button = createHelpButton(document);
  button.dataset.condition = match[0].trim();
  button.dataset.score = match[1];
  element.append(button);
}

function guideMarkup() {
  return `<div class="condition-guide-backdrop" data-condition-dismiss></div>
    <section class="condition-guide-sheet" role="dialog" aria-modal="true" aria-labelledby="conditionGuideTitle">
      <header class="condition-guide-head">
        <div><p>WATCH CONDITION</p><h2 id="conditionGuideTitle">시계 상태 점수 안내</h2></div>
        <button type="button" class="condition-guide-close" data-condition-dismiss aria-label="닫기">×</button>
      </header>
      <div class="condition-guide-current" hidden>
        <span>이 상품의 상태</span><strong data-condition-current></strong>
      </div>
      <div class="condition-guide-intro">
        <b>10에 가까울수록 외관 사용 흔적이 적습니다.</b>
        <span>벨로르가 실물 외관을 확인해 이해하기 쉽게 표시한 기준입니다.</span>
      </div>
      <ol class="condition-guide-scale">
        ${SCORE_ROWS.map(([score, label, description]) => `<li data-guide-score="${score}"><strong>${score}<small>/10</small></strong><div><b>${label}</b><span>${description}</span></div></li>`).join('')}
      </ol>
      <p class="condition-guide-note">상태 점수는 외관 기준 안내입니다. 정품 여부·무브먼트 성능·연식·구성품 평가는 별도이며, 실제 상품 사진과 상세 검수 안내가 우선합니다.</p>
    </section>`;
}

export function initConditionGuide({ document, window }) {
  const assurance = document.getElementById('pmAssurance');
  const stateList = document.getElementById('pmStateList');
  if (!assurance || !stateList) return { destroy() {} };

  const popover = document.createElement('div');
  popover.className = 'condition-guide-popover';
  popover.hidden = true;
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', '상태 점수 간단 안내');
  popover.innerHTML = '<b>상태 점수란?</b><p>10에 가까울수록 외관 사용 흔적이 적습니다.</p><button type="button" data-condition-more>자세히 보기</button>';
  document.body.append(popover);

  const modal = document.createElement('div');
  modal.className = 'condition-guide-modal';
  modal.hidden = true;
  modal.innerHTML = guideMarkup();
  document.body.append(modal);

  let activeButton = null;

  function decorate() {
    assurance.querySelectorAll(':scope > span').forEach((element) => decorateCondition(element, document));
    stateList.querySelectorAll(':scope > li').forEach((element) => decorateCondition(element, document));
  }

  function closePopover() {
    popover.hidden = true;
    activeButton?.setAttribute('aria-expanded', 'false');
    activeButton = null;
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('condition-guide-open');
    activeButton?.focus();
  }

  function openPopover(button) {
    if (activeButton === button && !popover.hidden) {
      closePopover();
      return;
    }
    activeButton?.setAttribute('aria-expanded', 'false');
    activeButton = button;
    button.setAttribute('aria-expanded', 'true');
    popover.hidden = false;
    const rect = button.getBoundingClientRect();
    const width = Math.min(284, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
    const above = rect.top > 160;
    popover.style.width = `${width}px`;
    popover.style.left = `${left}px`;
    popover.style.top = above ? `${Math.max(12, rect.top - popover.offsetHeight - 10)}px` : `${rect.bottom + 10}px`;
  }

  function openModal() {
    const current = modal.querySelector('[data-condition-current]');
    const currentBox = modal.querySelector('.condition-guide-current');
    const score = activeButton?.dataset.score || '';
    current.textContent = activeButton?.dataset.condition || '';
    currentBox.hidden = !current.textContent;
    modal.querySelectorAll('[data-guide-score]').forEach((row) => row.classList.toggle('is-current', row.dataset.guideScore === score));
    popover.hidden = true;
    modal.hidden = false;
    document.body.classList.add('condition-guide-open');
    modal.querySelector('.condition-guide-close')?.focus();
  }

  function onClick(event) {
    const help = event.target.closest('.condition-guide-help');
    if (help) {
      event.preventDefault();
      event.stopPropagation();
      openPopover(help);
      return;
    }
    if (event.target.closest('[data-condition-more]')) {
      openModal();
      return;
    }
    if (event.target.closest('[data-condition-dismiss]')) {
      closeModal();
      return;
    }
    if (!popover.hidden && !event.target.closest('.condition-guide-popover')) closePopover();
  }

  function onKeydown(event) {
    if (event.key !== 'Escape') return;
    if (!modal.hidden) closeModal();
    else closePopover();
  }

  const observer = new MutationObserver(decorate);
  observer.observe(assurance, { childList: true, subtree: true, characterData: true });
  observer.observe(stateList, { childList: true, subtree: true, characterData: true });
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
  decorate();

  return {
    destroy() {
      observer.disconnect();
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeydown);
      popover.remove();
      modal.remove();
    },
  };
}
