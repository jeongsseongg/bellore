import assert from 'node:assert/strict';
import { initCheckoutAddresses } from '../app/features/checkout/checkout-addresses.mjs';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : !!force;
    if (enabled) this.values.add(name); else this.values.delete(name);
    return enabled;
  }
  contains(name) { return this.values.has(name); }
}

function dataKey(selector) {
  const match = /^\[data-([^\]]+)\]$/.exec(selector);
  if (!match) return '';
  return match[1].replace(/-([a-z])/g, (_all, letter) => letter.toUpperCase());
}

class FakeElement {
  constructor({ id = '', dataset = {}, type = 'text', className = '' } = {}) {
    this.id = id;
    this.dataset = dataset;
    this.type = type;
    this.className = className;
    this.classList = new FakeClassList();
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.style = {};
    this.listeners = new Map();
    this.children = [];
    this.parentElement = null;
    this._innerHTML = '';
    this.selectorMap = new Map();
    this.selectorLists = new Map();
  }
  set innerHTML(value) { this._innerHTML = String(value); }
  get innerHTML() { return this._innerHTML; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener));
  }
  dispatch(type, target = this) {
    const event = { type, target, currentTarget: this, preventDefault() {} };
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
  matches(selector) {
    const key = dataKey(selector);
    if (key) return Object.prototype.hasOwnProperty.call(this.dataset, key);
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    return false;
  }
  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }
  querySelector(selector) { return this.selectorMap.get(selector) || null; }
  querySelectorAll(selector) { return this.selectorLists.get(selector) || []; }
  append(child) { child.parentElement = this; this.children.push(child); }
  replaceChildren(...children) {
    this.children = [];
    children.forEach((child) => this.append(child));
  }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
}

class FakePopupRoot extends FakeElement {
  constructor() {
    super();
    const node = (options) => new FakeElement(options);
    this.sheet = node({ className: 'shipping-address-popup__sheet' });
    this.listView = node({ dataset: { addressListView: '' } });
    this.list = node({ dataset: { addressList: '' } });
    this.editor = node({ dataset: { addressEditor: '' } });
    this.searchView = node({ dataset: { addressSearchView: '' } });
    this.searchView.hidden = true;
    this.postcodeSearch = node({ dataset: { addressPostcodeSearch: '' } });
    this.back = node({ dataset: { addressBack: '' } });
    this.count = node({ dataset: { addressCount: '' } });
    this.message = node({ dataset: { addressMessage: '' } });
    this.title = node({ dataset: { addressTitle: '' } });
    this.eyebrow = node({ dataset: { addressEyebrow: '' } });
    this.newButton = node({ dataset: { addressNew: '' } });
    this.findButton = node({ dataset: { addressFind: '' } });
    this.saveButton = node({ className: 'shipping-address-popup__save' });
    this.fields = Object.fromEntries([
      'id', 'label', 'recipient', 'phone', 'postcode', 'addr1', 'addr2', 'is_default',
    ].map((name) => [name, node({ dataset: { addressField: name }, type: name === 'is_default' ? 'checkbox' : 'text' })]));

    const selectors = {
      '.shipping-address-popup__sheet': this.sheet,
      '[data-address-list-view]': this.listView,
      '[data-address-list]': this.list,
      '[data-address-editor]': this.editor,
      '[data-address-search-view]': this.searchView,
      '[data-address-postcode-search]': this.postcodeSearch,
      '[data-address-back]': this.back,
      '[data-address-count]': this.count,
      '[data-address-message]': this.message,
      '[data-address-title]': this.title,
      '[data-address-eyebrow]': this.eyebrow,
      '[data-address-new]': this.newButton,
    };
    Object.entries(selectors).forEach(([selector, element]) => this.selectorMap.set(selector, element));
    this.selectorLists.set('[data-address-field]', Object.values(this.fields));
    this.editor.selectorMap.set('.shipping-address-popup__save', this.saveButton);
    this.findButton.parentElement = this.editor;
  }
}

class FakeDocument {
  constructor(elements) {
    this.elements = elements;
    this.listeners = new Map();
    this.activeElement = null;
    this.body = new FakeElement();
  }
  createElement() { this.popupRoot = new FakePopupRoot(); return this.popupRoot; }
  getElementById(id) { return this.elements[id] || null; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener));
  }
}

const ids = [
  'coName', 'coPhone', 'coShipName', 'coShipPhone', 'coPostcode', 'coAddr1', 'coAddr2',
  'coSameBuyer', 'coManageAddresses', 'coFindAddr',
];
const elements = Object.fromEntries(ids.map((id) => [id, new FakeElement({ id })]));
elements.coShipName.value = '수령인';
elements.coShipPhone.value = '01012345678';
elements.coPostcode.value = '00000';
elements.coAddr1.value = '기존 주소';
elements.coAddr2.value = '기존 상세';

const postcodeInstances = [];
class FakePostcode {
  constructor(options) { this.options = options; this.openCount = 0; this.embedCount = 0; postcodeInstances.push(this); }
  open() { this.openCount += 1; }
  embed(container) { this.embedCount += 1; this.container = container; }
}
const documentObject = new FakeDocument(elements);
const windowObject = {
  innerHeight: 844,
  daum: { Postcode: FakePostcode },
  requestAnimationFrame(callback) { callback(); },
  confirm() { return true; },
};

const checkoutAddresses = initCheckoutAddresses({
  document: documentObject,
  window: windowObject,
  getClient: () => null,
  getUser: () => null,
});

elements.coFindAddr.dispatch('click');
assert.equal(postcodeInstances.length, 1, '결제 폼 주소 찾기는 Daum 검색을 생성해야 합니다.');
assert.equal(postcodeInstances[0].embedCount, 1, '결제 폼 검색은 현재 모달 안에 임베드되어야 합니다.');
assert.equal(postcodeInstances[0].openCount, 0, '결제 폼 검색은 별도 팝업을 중복으로 열면 안 됩니다.');
assert.equal(documentObject.popupRoot.searchView.hidden, false);
windowObject.innerHeight = 568;
postcodeInstances[0].options.onresize({ height: 700 });
const compactSearchHeight = Number.parseInt(documentObject.popupRoot.postcodeSearch.style.height, 10);
assert(compactSearchHeight >= 300 && compactSearchHeight <= 320, '작은 화면에서 검색 iframe이 시트 높이를 넘으면 안 됩니다.');
postcodeInstances[0].options.oncomplete({ zonecode: '06236', roadAddress: '서울 강남구 테헤란로 152' });
assert.equal(elements.coShipName.value, '수령인');
assert.equal(elements.coShipPhone.value, '010-1234-5678');
assert.equal(elements.coPostcode.value, '06236');
assert.equal(elements.coAddr1.value, '서울 강남구 테헤란로 152');
assert.equal(elements.coAddr2.value, '');
assert.equal(elements.coAddr2.focused, true);
assert.equal(documentObject.popupRoot.hidden, true);

checkoutAddresses.popup.showEditor({
  label: '회사', recipient: '편집 수령인', phone: '010-9999-8888',
  postcode: '11111', addr1: '편집 전 주소', addr2: '7층',
});
documentObject.popupRoot.dispatch('click', documentObject.popupRoot.findButton);
assert.equal(postcodeInstances.length, 2, '배송지 편집의 기존 Daum 팝업 경로도 유지되어야 합니다.');
assert.equal(postcodeInstances[1].openCount, 1, '배송지 편집은 기존 별도 Daum 팝업을 열어야 합니다.');
assert.equal(postcodeInstances[1].embedCount, 0);
postcodeInstances[1].options.oncomplete({ zonecode: '04524', jibunAddress: '서울 중구 태평로1가 31' });
assert.equal(documentObject.popupRoot.fields.postcode.value, '04524');
assert.equal(documentObject.popupRoot.fields.addr1.value, '서울 중구 태평로1가 31');
assert.equal(documentObject.popupRoot.fields.addr2.focused, true);

console.log('checkout address runtime: embedded checkout + legacy editor paths ok');
