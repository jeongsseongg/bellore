import { createShippingAddressPopup } from './shipping-address-popup.mjs';

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

export function initCheckoutAddresses({ document: doc, window: win, getClient, getUser }) {
  const byId = (id) => doc.getElementById(id);
  const repository = createAddressRepository({ getClient, getUser });
  const fields = {
    buyerName: byId('coName'), buyerPhone: byId('coPhone'), recipient: byId('coShipName'),
    phone: byId('coShipPhone'), postcode: byId('coPostcode'), addr1: byId('coAddr1'), addr2: byId('coAddr2'),
  };
  const same = byId('coSameBuyer');
  let addresses = [];

  function fill(address) {
    const data = normalizeAddress(address);
    fields.recipient.value = data.recipient;
    fields.phone.value = data.phone;
    fields.postcode.value = data.postcode;
    fields.addr1.value = data.addr1;
    fields.addr2.value = data.addr2;
  }

  function currentCheckoutAddress() {
    return normalizeAddress({
      recipient: fields.recipient?.value,
      phone: fields.phone?.value,
      postcode: fields.postcode?.value,
      addr1: fields.addr1?.value,
      addr2: fields.addr2?.value,
    });
  }

  const popup = createShippingAddressPopup({
    document: doc, window: win, max: repository.max, formatPhone: formatKoreanPhone,
    onUse: fill,
    newAddress: () => ({ recipient: same?.checked ? fields.buyerName.value : '', phone: same?.checked ? fields.buyerPhone.value : '' }),
    async onSave(input) {
      try {
        const saved = await repository.save(input);
        await refresh(false);
        fill(saved);
      } catch (error) {
        error.customerMessage = error.message === 'LOGIN_REQUIRED' ? '로그인 후 배송지를 저장할 수 있습니다.' : error.message === 'ADDRESS_LIMIT' ? '배송지는 최대 10개까지 저장할 수 있습니다.' : error.message === 'ADDRESS_REQUIRED' ? '받는 분·연락처·주소를 모두 입력해 주세요.' : '배송지를 저장하지 못했습니다.';
        throw error;
      }
    },
    async onDelete(id) { await repository.remove(id); await refresh(false); },
    async onDefault(id) { await repository.makeDefault(id); await refresh(true); },
  });

  async function refresh(useDefault = false) {
    if (!getUser?.()?.uid) { addresses = []; popup.render([]); return; }
    try {
      addresses = await repository.list();
      popup.render(addresses);
      const chosen = addresses.find((item) => item.is_default) || addresses[0];
      if (useDefault && chosen) fill(chosen);
    } catch (error) {
      popup.announce(error.message === 'LOGIN_REQUIRED' ? '로그인 후 배송지를 관리할 수 있습니다.' : '배송지 목록을 불러오지 못했습니다.', true);
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
  byId('coManageAddresses')?.addEventListener('click', async (event) => { popup.open(event.currentTarget); await refresh(false); });
  byId('coFindAddr')?.addEventListener('click', (event) => { popup.openSearch(event.currentTarget, currentCheckoutAddress()); });
  doc.addEventListener('bellore:checkout-opened', async () => {
    fields.buyerPhone.value = formatKoreanPhone(fields.buyerPhone.value);
    fields.phone.value = formatKoreanPhone(fields.phone.value);
    await refresh(!fields.postcode.value);
  });
  popup.render([]);
  return { formatPhone: formatKoreanPhone, refresh, popup };
}
