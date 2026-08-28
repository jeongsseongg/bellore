function fieldMarkup(name, label, input) {
  return `<label class="shipping-address-popup__field"><span>${label}</span>${input.replace('>', ` data-address-field="${name}">`)}</label>`;
}

function markup(max) {
  return `<button type="button" class="shipping-address-popup__backdrop" data-address-dismiss aria-label="배송지 관리 닫기"></button>
    <section class="shipping-address-popup__sheet" role="dialog" aria-modal="true" aria-labelledby="shippingAddressPopupTitle" tabindex="-1">
      <header class="shipping-address-popup__header">
        <button type="button" class="shipping-address-popup__back" data-address-back aria-label="배송지 목록으로 돌아가기" hidden>‹</button>
        <div><p data-address-eyebrow>DELIVERY ADDRESS</p><h2 id="shippingAddressPopupTitle" data-address-title>배송지 관리</h2></div>
        <button type="button" class="shipping-address-popup__close" data-address-dismiss aria-label="닫기">×</button>
      </header>
      <div class="shipping-address-popup__list-view" data-address-list-view>
        <div class="shipping-address-popup__toolbar"><strong>내 배송지 <span data-address-count>0 / ${max}</span></strong><button type="button" data-address-new>새 배송지</button></div>
        <div class="shipping-address-popup__list" data-address-list></div>
      </div>
      <form class="shipping-address-popup__editor" data-address-editor hidden>
        <input type="hidden" data-address-field="id">
        ${fieldMarkup('label', '배송지 이름', '<input type="text" maxlength="30" placeholder="예) 집, 회사">')}
        ${fieldMarkup('recipient', '받는 분', '<input type="text" maxlength="120" placeholder="수령인 이름">')}
        ${fieldMarkup('phone', '받는 분 연락처', '<input type="tel" maxlength="13" inputmode="numeric" autocomplete="tel" placeholder="010-0000-0000">')}
        <label class="shipping-address-popup__field"><span>주소</span><div class="shipping-address-popup__postcode"><input type="text" data-address-field="postcode" placeholder="우편번호" readonly><button type="button" data-address-find>주소 찾기</button></div><input type="text" data-address-field="addr1" placeholder="기본 주소" readonly><input type="text" data-address-field="addr2" placeholder="상세 주소 (동·호수 등)"></label>
        <label class="shipping-address-popup__default"><input type="checkbox" data-address-field="is_default"><span>기본 배송지로 설정</span></label>
        <button type="submit" class="shipping-address-popup__save">배송지 저장</button>
      </form>
      <div class="shipping-address-popup__search" data-address-search-view hidden>
        <p>도로명, 건물명 또는 지번을 입력해 주세요.</p>
        <div class="shipping-address-popup__postcode-search" data-address-postcode-search></div>
      </div>
      <p class="shipping-address-popup__message" data-address-message role="status" aria-live="polite" hidden></p>
    </section>`;
}

function escapeHTML(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function createShippingAddressPopup({ document: doc, window: win, max = 10, formatPhone, onUse, onSave, onDelete, onDefault, newAddress }) {
  const root = doc.createElement('div');
  root.className = 'shipping-address-popup';
  root.hidden = true;
  root.innerHTML = markup(max);
  doc.body.append(root);

  const sheet = root.querySelector('.shipping-address-popup__sheet');
  const listView = root.querySelector('[data-address-list-view]');
  const list = root.querySelector('[data-address-list]');
  const editor = root.querySelector('[data-address-editor]');
  const searchView = root.querySelector('[data-address-search-view]');
  const postcodeSearch = root.querySelector('[data-address-postcode-search]');
  const back = root.querySelector('[data-address-back]');
  const count = root.querySelector('[data-address-count]');
  const message = root.querySelector('[data-address-message]');
  const title = root.querySelector('[data-address-title]');
  const eyebrow = root.querySelector('[data-address-eyebrow]');
  const fields = Object.fromEntries([...root.querySelectorAll('[data-address-field]')].map((field) => [field.dataset.addressField, field]));
  let addresses = [];
  let returnFocus = null;
  let searchSeed = {};

  function announce(text = '', error = false) {
    message.textContent = text;
    message.classList.toggle('is-error', error);
    message.hidden = !text;
  }

  function showList() {
    root.classList.remove('is-searching');
    listView.hidden = false;
    editor.hidden = true;
    searchView.hidden = true;
    back.hidden = true;
    title.textContent = '배송지 관리';
    eyebrow.textContent = 'DELIVERY ADDRESS';
    announce();
    root.querySelector('[data-address-new]')?.focus();
  }

  function showEditor(address = {}) {
    root.classList.remove('is-searching');
    const value = { label: '배송지', recipient: '', phone: '', postcode: '', addr1: '', addr2: '', is_default: false, ...address };
    Object.entries(fields).forEach(([name, field]) => {
      if (field.type === 'checkbox') field.checked = !!value[name];
      else field.value = value[name] || '';
    });
    listView.hidden = true;
    editor.hidden = false;
    searchView.hidden = true;
    back.hidden = false;
    title.textContent = value.id ? '배송지 수정' : '새 배송지';
    eyebrow.textContent = 'DELIVERY ADDRESS';
    announce();
    fields.label.focus();
  }

  function finishCheckoutSearch(data) {
    onUse?.({
      ...searchSeed,
      postcode: data.zonecode || '',
      addr1: data.roadAddress || data.jibunAddress || '',
      addr2: '',
    });
    close();
    win.requestAnimationFrame?.(() => doc.getElementById('coAddr2')?.focus());
  }

  function showSearch(initial = {}) {
    if (!win.daum?.Postcode) {
      announce('주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
      return false;
    }
    searchSeed = initial;
    root.classList.add('is-searching');
    listView.hidden = true;
    editor.hidden = true;
    searchView.hidden = false;
    back.hidden = false;
    title.textContent = '주소검색';
    eyebrow.textContent = '배송지 찾기';
    announce();
    postcodeSearch.replaceChildren();
    new win.daum.Postcode({
      oncomplete: finishCheckoutSearch,
      onresize(size) {
        const viewport = Number(win.innerHeight) || 760;
        const available = Math.max(300, Math.min(640, Math.floor(viewport * 0.88) - 180));
        const height = Math.min(Math.max(Number(size?.height) || available, 300), available);
        postcodeSearch.style.height = `${height}px`;
      },
      width: '100%',
      height: '100%',
    }).embed(postcodeSearch);
    return true;
  }

  function values() {
    return {
      id: fields.id.value, label: fields.label.value, recipient: fields.recipient.value,
      phone: fields.phone.value, postcode: fields.postcode.value, addr1: fields.addr1.value,
      addr2: fields.addr2.value, is_default: fields.is_default.checked,
    };
  }

  function render(items = []) {
    addresses = items;
    count.textContent = `${addresses.length} / ${max}`;
    if (!addresses.length) {
      list.innerHTML = '<p class="shipping-address-popup__empty">저장된 배송지가 없습니다.<br>자주 쓰는 배송지를 추가해 주세요.</p>';
      return;
    }
    list.innerHTML = addresses.map((address) => `<article class="shipping-address-popup__card${address.is_default ? ' is-default' : ''}" data-id="${escapeHTML(address.id)}"><div class="shipping-address-popup__card-copy"><strong>${escapeHTML(address.label)}${address.is_default ? '<em>기본</em>' : ''}</strong><span>${escapeHTML(address.recipient)} · ${escapeHTML(address.phone)}</span><p>(${escapeHTML(address.postcode)}) ${escapeHTML(address.addr1)} ${escapeHTML(address.addr2)}</p></div><div class="shipping-address-popup__actions"><button type="button" class="is-primary" data-address-action="use">이 주소 선택</button><button type="button" data-address-action="edit">수정</button>${address.is_default ? '' : '<button type="button" data-address-action="default">기본 설정</button>'}<button type="button" data-address-action="delete">삭제</button></div></article>`).join('');
  }

  function open(trigger) {
    returnFocus = trigger || doc.activeElement;
    root.hidden = false;
    doc.body.classList.add('shipping-address-popup-open');
    showList();
    sheet.focus();
  }

  function openSearch(trigger, initial = {}) {
    returnFocus = trigger || doc.activeElement;
    root.hidden = false;
    doc.body.classList.add('shipping-address-popup-open');
    if (!showSearch(initial)) close();
    else sheet.focus();
  }

  function close() {
    root.hidden = true;
    root.classList.remove('is-searching');
    doc.body.classList.remove('shipping-address-popup-open');
    returnFocus?.focus?.();
  }

  async function onRootClick(event) {
    if (event.target.closest('[data-address-dismiss]')) { close(); return; }
    if (event.target.closest('[data-address-back]')) {
      if (!searchView.hidden) close();
      else showList();
      return;
    }
    if (event.target.closest('[data-address-new]')) { showEditor(newAddress?.() || {}); return; }
    if (event.target.closest('[data-address-find]')) {
      if (!win.daum?.Postcode) { announce('주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', true); return; }
      new win.daum.Postcode({ oncomplete(data) { fields.postcode.value = data.zonecode || ''; fields.addr1.value = data.roadAddress || data.jibunAddress || ''; fields.addr2.focus(); } }).open();
      return;
    }
    const button = event.target.closest('[data-address-action]');
    const address = addresses.find((item) => item.id === button?.closest('[data-id]')?.dataset.id);
    if (!button || !address) return;
    const action = button.dataset.addressAction;
    if (action === 'use') { onUse?.(address); close(); return; }
    if (action === 'edit') { showEditor(address); return; }
    if (action === 'delete' && !win.confirm('이 배송지를 삭제할까요?')) return;
    try {
      if (action === 'delete') await onDelete?.(address.id);
      if (action === 'default') await onDefault?.(address.id);
    } catch (_error) { announce('배송지를 변경하지 못했습니다.', true); }
  }

  fields.phone.addEventListener('input', () => { fields.phone.value = formatPhone(fields.phone.value); });
  editor.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = editor.querySelector('.shipping-address-popup__save');
    button.disabled = true;
    try { await onSave?.(values()); showList(); }
    catch (error) { announce(error?.customerMessage || '배송지를 저장하지 못했습니다.', true); }
    finally { button.disabled = false; }
  });
  function onKeydown(event) { if (event.key === 'Escape' && !root.hidden) close(); }
  root.addEventListener('click', onRootClick);
  doc.addEventListener('keydown', onKeydown);

  return { open, openSearch, close, render, showEditor, showSearch, announce, destroy() { root.removeEventListener('click', onRootClick); doc.removeEventListener('keydown', onKeydown); root.remove(); doc.body.classList.remove('shipping-address-popup-open'); } };
}
