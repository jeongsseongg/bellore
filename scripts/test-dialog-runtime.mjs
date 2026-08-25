import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

class FakeClassList {
  constructor(element) { this.element = element; this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
}

class FakeElement {
  constructor(tagName, documentObject) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = documentObject;
    this.children = [];
    this.listeners = new Map();
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.isConnected = false;
    this.className = '';
    this.classList = new FakeClassList(this);
    this._text = '';
  }
  set textContent(value) { this._text = String(value ?? ''); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent || '').join(''); }
  set innerHTML(value) {
    this.textContent = '';
    if (!String(value).includes('bld-backdrop')) return;
    const backdrop = this.ownerDocument.createElement('div'); backdrop.className = 'bld-backdrop';
    const sheet = this.ownerDocument.createElement('div'); sheet.className = 'bld-sheet';
    const title = this.ownerDocument.createElement('p'); title.className = 'bld-title';
    const message = this.ownerDocument.createElement('div'); message.className = 'bld-msg';
    const inputWrap = this.ownerDocument.createElement('div'); inputWrap.className = 'bld-inwrap'; inputWrap.hidden = true;
    const input = this.ownerDocument.createElement('input'); input.className = 'bld-input'; input.value = '';
    const buttons = this.ownerDocument.createElement('div'); buttons.className = 'bld-btns';
    inputWrap.appendChild(input);
    [title, message, inputWrap, buttons].forEach((child) => sheet.appendChild(child));
    this.appendChild(backdrop); this.appendChild(sheet);
  }
  appendChild(child) {
    this.children.push(child); child.parentNode = this; child.isConnected = this.isConnected;
    return child;
  }
  setAttribute() {}
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener); this.listeners.set(type, listeners);
  }
  dispatchEvent(event) {
    event.target ||= this;
    event.preventDefault ||= function () { this.prevented = true; };
    (this.listeners.get(event.type) || []).forEach((listener) => listener(event));
  }
  focus() { this.ownerDocument.activeElement = this; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = [];
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    const enabledButton = selector === 'button:not([disabled])';
    const visit = (node) => {
      for (const child of node.children || []) {
        if ((className && String(child.className || '').split(/\s+/).includes(className)) ||
            (enabledButton && child.tagName === 'BUTTON' && !child.disabled)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
}

class FakeDocument {
  constructor() {
    this.listeners = new Map();
    this.body = new FakeElement('body', this); this.body.isConnected = true; this.body.style.overflow = '';
    this.activeElement = null;
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  createTextNode(text) { return { textContent: String(text), isConnected: true }; }
  querySelector(selector) { return this.body.querySelector(selector); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener); this.listeners.set(type, listeners);
  }
  keydown(key, options = {}) {
    const event = {
      type: 'keydown', key, shiftKey: !!options.shiftKey,
      prevented: false, stopped: false,
      preventDefault() { this.prevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
    };
    for (const listener of this.listeners.get('keydown') || []) {
      listener(event);
      if (event.stopped) break;
    }
    return event;
  }
}

const documentObject = new FakeDocument();
const trigger = documentObject.createElement('button'); trigger.isConnected = true; trigger.focus();
const windowObject = { console: { warn() {} } };
const source = await readFile(new URL('../ui-dialog.js', import.meta.url), 'utf8');
vm.runInNewContext(source, {
  window: windowObject,
  document: documentObject,
  console: windowObject.console,
  setTimeout(callback) { callback(); return 1; },
  clearTimeout() {},
});

const dialog = () => documentObject.querySelector('.bld-modal');
const message = () => dialog().querySelector('.bld-msg').textContent;
const buttons = () => dialog().querySelectorAll('button:not([disabled])');
const click = (button) => button.dispatchEvent({ type: 'click', preventDefault() {} });

windowObject.alert('permission denied for table orders');
assert.equal(message(), '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'mapper 미설치 시 원문이 노출됐습니다.');
click(buttons()[0]);

windowObject.BELLORE_CUSTOMER_FEEDBACK = {
  message(value) {
    if (value === 'mapper throws') throw new Error('mapper failure');
    return String(value);
  },
};
windowObject.alert('mapper throws');
assert.equal(message(), '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'mapper 오류 시 원문이 노출됐습니다.');
click(buttons()[0]);

let firstAction = 0;
let lastAction = 0;
windowObject.belloreModal('고객 안내', [
  { label: '비회원으로 신청', cls: 'secondary', cb() { firstAction += 1; } },
  { label: '회원가입하고 신청', cb() { lastAction += 1; } },
]);
buttons()[0].focus();
documentObject.keydown('Enter');
assert.deepEqual([firstAction, lastAction], [0, 0], 'Enter가 포커스와 무관하게 마지막 행동을 실행했습니다.');
click(buttons()[0]);
assert.deepEqual([firstAction, lastAction], [1, 0]);

const prompt = windowObject.bellPrompt('취소 사유를 입력해 주세요.', '한글');
const promptInput = dialog().querySelector('.bld-input');
promptInput.dispatchEvent({ type: 'keydown', key: 'Enter', isComposing: true, keyCode: 229 });
assert.equal(dialog().hidden, false, '한글 조합 확정 Enter가 입력 팝업을 제출하면 안 됩니다.');
click(buttons()[1]);
assert.equal(await prompt, '한글');

const completed = [];
windowObject.belloreAlert('첫 번째 안내', () => completed.push('first'));
windowObject.belloreAlert('두 번째 안내', () => completed.push('second'));
assert.equal(message(), '첫 번째 안내');
click(buttons()[0]);
assert.equal(message(), '두 번째 안내');
assert.equal(documentObject.body.style.overflow, 'hidden');
click(buttons()[0]);
assert.deepEqual(completed, ['first', 'second']);
assert.equal(documentObject.body.style.overflow, '');
assert.equal(documentObject.activeElement, trigger, '팝업을 닫은 뒤 원래 포커스를 복원해야 합니다.');

let legacyCancel = 0;
windowObject.belloreConfirm('계속할까요?', () => {}, () => { legacyCancel += 1; });
documentObject.keydown('Escape');
assert.equal(legacyCancel, 0, 'legacy belloreConfirm의 ESC가 취소 콜백을 실행하면 안 됩니다.');

const promise = windowObject.bellConfirm('삭제할까요?');
documentObject.keydown('Escape');
assert.equal(await promise, false, 'Promise confirm은 ESC에서 false로 종료돼야 합니다.');

console.log('dialog runtime fail-closed, keyboard, queue, and compatibility: ok');
