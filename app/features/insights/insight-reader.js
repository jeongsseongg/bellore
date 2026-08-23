const FALLBACK_BODIES = Object.freeze({
  price: '본 글에서는 최근 6개월간의 시세 흐름을 모델별로 분석합니다.\n\n주요 모델의 매입 시세는 글로벌 옥션 결과를 바탕으로 집계되었으며, 분기별 변동을 함께 살펴봅니다.\n\n향후 6개월간의 시세 전망과 함께, 매입을 고려하시는 분들이 참고하실 수 있는 핵심 포인트를 정리했습니다.',
  guide: '명품시계를 매입하실 때 매입가에 영향을 미치는 핵심 요소들을 알아봅니다.\n\n보증서, 박스, 풀세트 보관 상태, 컨디션, 진품 여부, 시리얼 번호 매칭 등 각 요소별로 매입가가 최대 30%까지 차이날 수 있으니 사전 체크가 중요합니다.\n\n40년 경력 감정사가 직접 알려드리는 실전 노하우를 정리했습니다.',
  brand: '브랜드의 역사와 함께 현재 매입 시장에서의 가치를 짚어봅니다.\n\n탄생 배경, 대표 모델, 시장에서의 위상까지 - 매입을 고려하시는 분이라면 알아두면 좋을 브랜드 정보를 깊이 있게 다룹니다.\n\n각 브랜드별 핵심 모델과 매입 시 평가 포인트를 함께 안내드립니다.',
  wiki: '시계의 무브먼트와 메커니즘에 대한 전문 지식을 정리합니다.\n\n칼럼 휠과 캠 방식의 차이, 인하우스 무브먼트와 외주 무브먼트, 매입 시 무브먼트 상태를 평가하는 방법까지.\n\n시계 애호가뿐 아니라 매입을 고려하시는 분도 꼭 알아야 할 기초 지식입니다.',
  review: '실제 고객님이 남겨주신 매입 후기입니다.\n\n벨로르를 선택하신 이유, 거래 진행 과정, 그리고 만족하셨던 부분들을 진솔하게 공유해주셨습니다.\n\n매입을 고려하시는 분들께 참고가 되었으면 좋겠습니다. 항상 신뢰로 보답하겠습니다.'
});

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeMetaHtml(meta) {
  if (!meta) return '';
  const parts = Array.from(meta.querySelectorAll('span'));
  if (!parts.length) return escapeHtml(meta.textContent);
  return parts.map((part) => `<span>${escapeHtml(part.textContent)}</span>`).join('');
}

export function initInsightReader({ document: doc }) {
  if (!doc) throw new Error('insight reader requires document');

  const modal = doc.getElementById('postModal');
  if (!modal) return Object.freeze({ destroy() {} });

  const imageTarget = doc.getElementById('postModalImg');
  const titleTarget = doc.getElementById('postModalTitle');
  const tagTarget = doc.getElementById('postModalTag');
  const metaTarget = doc.getElementById('postModalMeta');
  const textTarget = doc.getElementById('postModalText');
  modal.dataset.insightReaderReady = 'true';

  function closePost() {
    modal.hidden = true;
    doc.body.style.overflow = '';
  }

  function openPost(row) {
    const image = row.querySelector('img');
    const title = row.querySelector('h3');
    const tag = row.querySelector('.tag-mini');
    const meta = row.querySelector('.insight-meta');
    const summary = row.querySelector('p');
    const body = row.dataset.body || FALLBACK_BODIES[row.dataset.cat] || '본문 내용 준비 중입니다.';
    const lead = summary ? `<p><strong>${escapeHtml(summary.textContent)}</strong></p>` : '';
    const paragraphs = body
      .split('\n\n')
      .map((text) => `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`)
      .join('');

    if (imageTarget) imageTarget.src = image ? image.src : '';
    if (titleTarget) titleTarget.textContent = title ? title.textContent : '';
    if (tagTarget) tagTarget.textContent = tag ? tag.textContent : '';
    if (metaTarget) metaTarget.innerHTML = safeMetaHtml(meta);
    if (textTarget) textTarget.innerHTML = lead + paragraphs;

    modal.hidden = false;
    doc.body.style.overflow = 'hidden';
  }

  function onDocumentClick(event) {
    const target = event.target;
    if (target?.closest?.('[data-edit], [data-del]')) return;

    const row = target?.closest?.('.insight-row');
    if (row) {
      event.preventDefault();
      openPost(row);
      return;
    }

    if (target?.closest?.('[data-close]')) {
      event.preventDefault();
      closePost();
    }
  }

  function onDocumentKeydown(event) {
    if (event.key === 'Escape') closePost();
  }

  doc.addEventListener('click', onDocumentClick);
  doc.addEventListener('keydown', onDocumentKeydown);

  return Object.freeze({
    destroy() {
      doc.removeEventListener('click', onDocumentClick);
      doc.removeEventListener('keydown', onDocumentKeydown);
      delete modal.dataset.insightReaderReady;
      closePost();
    }
  });
}
