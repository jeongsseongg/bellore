export const EDITOR_BLOCKS = Object.freeze([
  { id: 'header', label: '회원 정보', description: '제목·안내 문구·요약 이름', lane: 'fixed' },
  { id: 'order', label: '최근 주문', description: '표시 여부·버튼 문구', lane: 'content' },
  { id: 'banner', label: '혜택 배너', description: '배너 미리보기 문구', lane: 'content' },
  { id: 'trade', label: '거래 메뉴', description: '영역 제목·메뉴 이름과 순서', lane: 'menu' },
  { id: 'activity', label: '내 활동 메뉴', description: '영역 제목·메뉴 이름과 순서', lane: 'menu' },
  { id: 'footer', label: '고객센터', description: '소개·전화번호·운영시간', lane: 'fixed' }
]);

function escapeHTML(value) {
  return String(value == null ? '' : value).replace(/[&<>'"]/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]
  ));
}

function inputField(label, path, value, options = {}) {
  const type = options.type || 'text';
  const help = options.help ? `<small>${escapeHTML(options.help)}</small>` : '';
  const placeholder = options.placeholder ? ` placeholder="${escapeHTML(options.placeholder)}"` : '';
  return `<label class="editor-field"><span>${escapeHTML(label)}</span><input type="${type}" data-edit-field="${escapeHTML(path)}" value="${escapeHTML(value)}"${placeholder}>${help}</label>`;
}

function toggleField(label, path, checked, help) {
  return `<label class="editor-toggle"><input type="checkbox" data-edit-field="${escapeHTML(path)}"${checked ? ' checked' : ''}><span aria-hidden="true"></span><b>${escapeHTML(label)}</b>${help ? `<small>${escapeHTML(help)}</small>` : ''}</label>`;
}

function blockVisible(content, blockId) {
  if (blockId === 'order') return !!content.order.visible;
  if (blockId === 'banner') return !!content.banner.visible;
  return true;
}

export function renderBlockNavigator(content, activeBlock) {
  const byId = new Map(EDITOR_BLOCKS.map((block) => [block.id, block]));
  const ordered = (content.blockOrder || []).map((id) => byId.get(id)).filter(Boolean);
  EDITOR_BLOCKS.forEach((block) => { if (!ordered.includes(block)) ordered.push(block); });
  const rows = ordered.map((block, index) => {
    const visible = blockVisible(content, block.id);
    const movable = block.lane !== 'fixed';
    return `<button type="button" class="block-row${block.id === activeBlock ? ' is-active' : ''}" data-block-select="${block.id}" data-block-lane="${block.lane}" aria-pressed="${String(block.id === activeBlock)}"${movable ? ' draggable="true"' : ''}><span class="block-row__number">${movable ? '⋮⋮' : String(index + 1).padStart(2, '0')}</span><span class="block-row__copy"><b>${escapeHTML(block.label)}</b><small>${escapeHTML(block.description)}</small></span><i class="block-row__state ${visible ? 'is-visible' : ''}">${visible ? '노출' : '숨김'}</i></button>`;
  }).join('');
  return `<aside class="block-panel" aria-label="마이페이지 블록 목록"><div class="block-panel__head"><small>운영 화면 구성</small><strong>블록 선택·순서 변경</strong></div><div class="block-panel__list">${rows}</div><p>⋮⋮ 블록은 같은 영역 안에서 드래그할 수 있습니다. 가운데 문구를 더블클릭하면 바로 수정됩니다.</p></aside>`;
}

function menuField(group, content) {
  const title = group === 'trade' ? '거래 메뉴 · 한 줄에 하나' : '내 활동 메뉴 · 한 줄에 하나';
  return `<label class="editor-field"><span>${title}</span><textarea rows="7" data-menu-group="${group}">${escapeHTML(content.menuGroups[group].join('\n'))}</textarea><small>줄 순서가 실제 화면의 메뉴 순서가 됩니다.</small></label>`;
}

function headerFields(content) {
  return inputField('화면 제목', 'profile.pageTitle', content.profile.pageTitle) +
    inputField('회원 안내 문구', 'headerMessage', content.headerMessage) +
    `<div class="editor-grid editor-grid--stats">${content.stats.map((stat, index) => `<div>${inputField(`요약 이름 ${index + 1}`, `stats.${index}.label`, stat.label)}</div>`).join('')}</div>` +
    '<p class="editor-data-note"><b>실제 회원 데이터</b> 회원 이름·포인트·쿠폰·관심 수치는 로그인한 계정의 값을 사용하므로 여기서 변경하지 않습니다.</p>';
}

function orderFields(content) {
  return toggleField('최근 주문 블록 표시', 'order.visible', content.order.visible, '끄면 이 역할의 최근 주문 블록을 숨깁니다.') +
    inputField('왼쪽 버튼', 'order.primaryAction', content.order.primaryAction) +
    inputField('오른쪽 버튼', 'order.secondaryAction', content.order.secondaryAction) +
    '<p class="editor-data-note"><b>실제 주문 데이터</b> 상태·상품명·주문번호·배송 정보·상품 이미지는 주문 데이터에서 자동으로 표시됩니다.</p>';
}

function bannerFields(content) {
  return toggleField('배너 블록 미리보기', 'banner.visible', content.banner.visible, '운영 배너의 게시 여부는 배너 관리에서 설정합니다.') +
    inputField('미리보기 제목', 'banner.title', content.banner.title) +
    inputField('미리보기 설명', 'banner.description', content.banner.description) +
    inputField('미리보기 이미지 경로', 'banner.image', content.banner.image, { placeholder: '../../assets/…' }) +
    '<p class="editor-data-note"><b>운영 연결 기준</b> 실제 이미지·링크·게시 기간은 배너 관리에서 저장하고, 여기서는 마이페이지 안의 배치와 문구를 확인합니다.</p>';
}

function fieldsFor(content, blockId) {
  if (blockId === 'header') return headerFields(content);
  if (blockId === 'order') return orderFields(content);
  if (blockId === 'banner') return bannerFields(content);
  if (blockId === 'trade') return inputField('영역 제목', 'labels.tradeHeading', content.labels.tradeHeading) + menuField('trade', content);
  if (blockId === 'activity') return inputField('영역 제목', 'labels.activityHeading', content.labels.activityHeading) + menuField('activity', content);
  return inputField('브랜드 소개', 'footer.description', content.footer.description) + inputField('전화번호', 'footer.phone', content.footer.phone) + inputField('운영시간', 'footer.hours', content.footer.hours);
}

export function renderBlockInspector(content, role, activeBlock) {
  const block = EDITOR_BLOCKS.find((item) => item.id === activeBlock) || EDITOR_BLOCKS[0];
  const roleNote = role === 'admin'
    ? '관리자 마이페이지는 업체 구조를 공유하되 운영자 역할 문구를 따로 저장합니다.'
    : (role === 'vendor' ? '업체 화면에는 비교견적·입찰 메뉴가 포함됩니다.' : '고객 화면은 구매와 관심 활동 중심으로 표시됩니다.');
  return `<div class="editor-panel__head"><div><small>${escapeHTML(content.label)} 마이페이지</small><strong>${escapeHTML(block.label)} 편집</strong></div><button type="button" data-editor-collapse>편집 숨기기</button></div><div class="editor-panel__scroll"><section class="editor-section">${fieldsFor(content, block.id)}</section><p class="editor-role-note">${escapeHTML(roleNote)}</p></div>`;
}
