export class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.src = '';
    this.style = {};
    this.listeners = new Map();
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (this.id === 'coCouponSelect') this.value = '';
  }

  get innerHTML() { return this._innerHTML; }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    const event = {
      type,
      target: this,
      preventDefault() {},
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  focus() { this.focused = true; }
  closest() { return null; }
  querySelector(selector) { return selector === '.co-scroll' ? this.scrollElement : null; }
}

export class FakeDocument {
  constructor(elements) {
    this.readyState = 'loading';
    this.elements = elements;
    this.listeners = new Map();
    this.body = { style: {} };
  }

  querySelector(selector) {
    if (selector.startsWith('#')) return this.elements[selector.slice(1)] || null;
    return null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ type });
  }
}
