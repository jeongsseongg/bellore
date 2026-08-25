const TABLE = 'shipping_addresses';
const MAX_ADDRESSES = 10;

export function formatKoreanPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('82')) digits = `0${digits.slice(2)}`;
  digits = digits.slice(0, 11);
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  const middleEnd = digits.length === 10 ? 6 : 7;
  return `${digits.slice(0, 3)}-${digits.slice(3, middleEnd)}-${digits.slice(middleEnd)}`;
}

export function normalizeAddress(input = {}) {
  return {
    id: input.id || '',
    label: String(input.label || '배송지').trim().slice(0, 30),
    recipient: String(input.recipient || '').trim().slice(0, 120),
    phone: formatKoreanPhone(input.phone),
    postcode: String(input.postcode || '').trim().slice(0, 20),
    addr1: String(input.addr1 || '').trim().slice(0, 300),
    addr2: String(input.addr2 || '').trim().slice(0, 300),
    is_default: !!input.is_default,
  };
}

export function createAddressRepository({ getClient, getUser }) {
  function requireSession() {
    const client = getClient?.();
    const user = getUser?.();
    if (!client || !user?.uid) throw new Error('LOGIN_REQUIRED');
    return { client, user };
  }
  async function list() {
    const { client } = requireSession();
    const result = await client.from(TABLE).select('id,label,recipient,phone,postcode,addr1,addr2,is_default,created_at').order('is_default', { ascending: false }).order('created_at', { ascending: false });
    if (result.error) throw result.error;
    return (result.data || []).map(normalizeAddress);
  }
  async function save(input) {
    const { client } = requireSession();
    const address = normalizeAddress(input);
    if (!address.recipient || !address.phone || !address.postcode || !address.addr1) throw new Error('ADDRESS_REQUIRED');
    let query;
    if (address.id) {
      const { id, ...patch } = address;
      query = client.from(TABLE).update(patch).eq('id', id).select().single();
    } else {
      const current = await list();
      if (current.length >= MAX_ADDRESSES) throw new Error('ADDRESS_LIMIT');
      const { id: _id, ...insert } = address;
      query = client.from(TABLE).insert(insert).select().single();
    }
    const result = await query;
    if (result.error) throw result.error;
    return normalizeAddress(result.data);
  }
  async function remove(id) {
    const { client } = requireSession();
    const result = await client.from(TABLE).delete().eq('id', id);
    if (result.error) throw result.error;
  }
  async function makeDefault(id) {
    const { client } = requireSession();
    const result = await client.from(TABLE).update({ is_default: true }).eq('id', id).select().single();
    if (result.error) throw result.error;
    return normalizeAddress(result.data);
  }
  return { list, save, remove, makeDefault, max: MAX_ADDRESSES };
}

function escapeHTML(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function initCheckoutAddresses({ document: doc, window: win, getClient, getUser }) {
  const byId = (id) => doc.getElementById(id);
  const repository = createAddressRepository({ getClient, getUser });
  const fields = {
    buyerName: byId('coName'), buyerPhone: byId('coPhone'), recipient: byId('coShipName'),
    phone: byId('coShipPhone'), postcode: byId('coPostcode'), addr1: byId('coAddr1'), addr2: byId('coAddr2'),
    label: byId('coAddressLabel'), isDefault: byId('coAddressDefault'), editId: byId('coAddressEditId'),
  };
  const same = byId('coSameBuyer');
  const panel = byId('coAddressBook');
  const listBox = byId('coAddressList');
  const message = byId('coAddressMessage');
  const saveButton = byId('coSaveAddress');
  let addresses = [];

  function notify(text, error = false) {
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('is-error', error);
    message.hidden = !text;
  }
  function fill(address) {
    const data = normalizeAddress(address);
    fields.recipient.value = data.recipient;
    fields.phone.value = data.phone;
    fields.postcode.value = data.postcode;
    fields.addr1.value = data.addr1;
    fields.addr2.value = data.addr2;
    fields.label.value = data.label;
    fields.isDefault.checked = data.is_default;
    fields.editId.value = data.id;
    saveButton.textContent = data.id ? '배송지 수정 저장' : '배송지 저장';
  }
  function currentForm() {
    return normalizeAddress({
      id: fields.editId.value, label: fields.label.value, recipient: fields.recipient.value,
      phone: fields.phone.value, postcode: fields.postcode.value, addr1: fields.addr1.value,
      addr2: fields.addr2.value, is_default: fields.isDefault.checked,
    });
  }
  function resetForm() {
    fill({ recipient: same?.checked ? fields.buyerName.value : '', phone: same?.checked ? fields.buyerPhone.value : '' });
    fields.addr2.focus();
  }
  function render() {
    if (!listBox) return;
    if (!getUser?.()?.uid) {
      listBox.innerHTML = '<p class="co-address-empty">로그인하면 배송지를 최대 10개까지 저장할 수 있습니다.</p>';
      return;
    }
    if (!addresses.length) {
      listBox.innerHTML = '<p class="co-address-empty">저장된 배송지가 없습니다.</p>';
      return;
    }
    listBox.innerHTML = addresses.map((address) => `<article class="co-address-card${address.is_default ? ' is-default' : ''}" data-id="${escapeHTML(address.id)}"><div><strong>${escapeHTML(address.label)}${address.is_default ? '<em>기본</em>' : ''}</strong><span>${escapeHTML(address.recipient)} · ${escapeHTML(address.phone)}</span><p>(${escapeHTML(address.postcode)}) ${escapeHTML(address.addr1)} ${escapeHTML(address.addr2)}</p></div><div class="co-address-actions"><button type="button" data-address-action="use">선택</button><button type="button" data-address-action="edit">수정</button>${address.is_default ? '' : '<button type="button" data-address-action="default">기본 설정</button>'}<button type="button" data-address-action="delete">삭제</button></div></article>`).join('');
  }
  async function refresh(useDefault = false) {
    if (!getUser?.()?.uid) { addresses = []; render(); return; }
    try {
      addresses = await repository.list();
      render();
      const chosen = addresses.find((item) => item.is_default) || addresses[0];
      if (useDefault && chosen) fill(chosen);
    } catch (error) {
      notify(error.message === 'LOGIN_REQUIRED' ? '로그인 후 배송지를 관리할 수 있습니다.' : '배송지 목록을 불러오지 못했습니다.', true);
    }
  }
  function syncBuyer(includeAddress) {
    if (!same?.checked) return;
    const user = getUser?.() || {};
    fields.recipient.value = fields.buyerName.value;
    fields.phone.value = formatKoreanPhone(fields.buyerPhone.value);
    if (includeAddress && user.postcode) {
      fields.postcode.value = user.postcode || '';
      fields.addr1.value = user.addr1 || '';
      fields.addr2.value = user.addr2 || '';
    }
  }
  [fields.buyerPhone, fields.phone].forEach((input) => input?.addEventListener('input', () => { input.value = formatKoreanPhone(input.value); }));
  fields.buyerName?.addEventListener('input', () => syncBuyer(false));
  fields.buyerPhone?.addEventListener('input', () => syncBuyer(false));
  same?.addEventListener('change', () => syncBuyer(true));
  byId('coManageAddresses')?.addEventListener('click', async () => { panel.hidden = !panel.hidden; if (!panel.hidden) await refresh(false); });
  byId('coNewAddress')?.addEventListener('click', resetForm);
  saveButton?.addEventListener('click', async () => {
    try {
      const saved = await repository.save(currentForm());
      notify(saved.id ? '배송지를 저장했습니다.' : '', false);
      await refresh(false);
      fill(saved);
    } catch (error) {
      const text = error.message === 'LOGIN_REQUIRED' ? '로그인 후 배송지를 저장할 수 있습니다.' : error.message === 'ADDRESS_LIMIT' ? '배송지는 최대 10개까지 저장할 수 있습니다.' : error.message === 'ADDRESS_REQUIRED' ? '받는 분·연락처·주소를 모두 입력해 주세요.' : '배송지를 저장하지 못했습니다.';
      notify(text, true);
    }
  });
  listBox?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-address-action]');
    const card = button?.closest('[data-id]');
    const address = addresses.find((item) => item.id === card?.dataset.id);
    if (!address) return;
    const action = button.dataset.addressAction;
    if (action === 'use' || action === 'edit') { fill(address); if (action === 'use') panel.hidden = true; return; }
    if (action === 'delete' && !win.confirm('이 배송지를 삭제할까요?')) return;
    try {
      if (action === 'delete') await repository.remove(address.id);
      if (action === 'default') await repository.makeDefault(address.id);
      await refresh(action === 'default');
    } catch (_error) { notify('배송지를 변경하지 못했습니다.', true); }
  });
  doc.addEventListener('bellore:checkout-opened', async () => {
    fields.buyerPhone.value = formatKoreanPhone(fields.buyerPhone.value);
    fields.phone.value = formatKoreanPhone(fields.phone.value);
    await refresh(!fields.postcode.value);
  });
  render();
  return { formatPhone: formatKoreanPhone, refresh };
}
