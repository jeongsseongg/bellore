/* ============================================================
   벨로르(BELLORE) · 공통 다이얼로그 (ui-dialog.js)
   - 네이티브 alert/confirm/prompt(옛날 웹 팝업) 를 벨로르 스타일로 대체
   - window.alert 는 전역 교체(비차단). confirm/prompt 는 동기라 대체 불가 →
     bellConfirm(msg)→Promise<bool>, bellPrompt(msg, def)→Promise<string|null> 제공.
   - 스크롤 안전: 열 때 body overflow 저장 → 닫을 때 복원(중첩 모달에서도 안전)
   ============================================================ */
(function () {
  'use strict';
  var root, titleEl, msgEl, inputWrap, inputEl, buttonsEl, prevOverflow, previousFocus, current;
  var queue = [];

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'bld-modal';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML =
      '<div class="bld-backdrop"></div>' +
      '<div class="bld-sheet" role="document">' +
        '<p class="bld-title"></p>' +
        '<div class="bld-msg"></div>' +
        '<div class="bld-inwrap" hidden><input class="bld-input" type="text"></div>' +
        '<div class="bld-btns">' +
          '<button type="button" class="bld-cancel"></button>' +
          '<button type="button" class="bld-ok"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    titleEl = root.querySelector('.bld-title');
    msgEl = root.querySelector('.bld-msg');
    inputWrap = root.querySelector('.bld-inwrap');
    inputEl = root.querySelector('.bld-input');
    buttonsEl = root.querySelector('.bld-btns');

    root.querySelector('.bld-backdrop').addEventListener('click', function () { finish(-1); });
    inputEl.addEventListener('keydown', function (e) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); finish(current.actions.length - 1); }
    });
    document.addEventListener('keydown', function (e) {
      if (root.hidden || !current) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish(-1);
      } else if (e.key === 'Tab') {
        trapFocus(e);
      }
    }, true);
  }

  // 줄바꿈(\n) 보존하며 텍스트 삽입(XSS 안전)
  function setText(el, text) {
    el.textContent = '';
    String(text == null ? '' : text).split('\n').forEach(function (line, i) {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(line));
    });
  }

  function customerMessage(message, context) {
    try {
      var feedback = window.BELLORE_CUSTOMER_FEEDBACK;
      var mapped = feedback && feedback.message ? feedback.message(message, context) : null;
      if (mapped != null && String(mapped).trim()) return String(mapped);
    } catch (err) {
      if (window.console && typeof window.console.warn === 'function') {
        window.console.warn('[Bellore dialog] customer message mapper failed');
      }
    }
    return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  function customerTitle(title, type, context) {
    var fallback = type === 'confirm' || type === 'prompt' ? '확인' : '안내';
    if (!title) return fallback;
    var mapped = customerMessage(title, context);
    return mapped === String(title) ? mapped : fallback;
  }

  function focusableElements() {
    var items = [];
    if (!inputWrap.hidden && !inputEl.disabled) items.push(inputEl);
    Array.prototype.forEach.call(buttonsEl.querySelectorAll('button:not([disabled])'), function (button) {
      items.push(button);
    });
    return items;
  }

  function trapFocus(event) {
    var items = focusableElements();
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  function standardActions(opts) {
    if (opts.type === 'alert') {
      return [{ label: opts.okText || '확인', value: true, tone: 'primary' }];
    }
    return [
      { label: opts.cancelText || '취소', value: false, tone: 'secondary' },
      { label: opts.okText || '확인', value: true, tone: 'primary' }
    ];
  }

  function customActions(buttons) {
    var source = Array.isArray(buttons) && buttons.length
      ? buttons
      : [{ label: '확인' }];
    return source.map(function (button, index) {
      var legacyClass = String(button && button.cls || '');
      return {
        label: button && button.label || '확인',
        cb: button && button.cb,
        value: index,
        tone: /cancel|secondary/i.test(legacyClass) || (source.length > 1 && index === 0)
          ? 'secondary'
          : 'primary'
      };
    });
  }

  function renderActions(actions) {
    buttonsEl.textContent = '';
    actions.forEach(function (action, index) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = action.tone === 'secondary' ? 'bld-cancel' : 'bld-ok';
      button.textContent = action.label;
      button.addEventListener('click', function () { finish(index); });
      buttonsEl.appendChild(button);
    });
  }

  function normalize(opts) {
    opts = opts || {};
    opts.type = opts.type || 'alert';
    opts.actions = opts.type === 'custom' ? customActions(opts.buttons) : standardActions(opts);
    return opts;
  }

  function show(opts) {
    current = opts;
    titleEl.textContent = customerTitle(opts.title, opts.type, opts.context || opts.type);
    setText(msgEl, customerMessage(opts.message, opts.context || opts.type));
    if (opts.type === 'prompt') { inputWrap.hidden = false; inputEl.value = opts.defaultValue || ''; }
    else { inputWrap.hidden = true; }
    renderActions(opts.actions);
    root.hidden = false;
    setTimeout(function () {
      try {
        var focusTarget = opts.type === 'prompt' ? inputEl : buttonsEl.lastElementChild;
        if (focusTarget) focusTarget.focus();
      } catch (e) {}
    }, 30);
  }

  function open(opts) {
    build();
    opts = normalize(opts);
    if (current) { queue.push(opts); return; }
    previousFocus = document.activeElement;
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    show(opts);
  }

  function closeSession() {
    root.hidden = true;
    document.body.style.overflow = prevOverflow || '';
    if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
      try { previousFocus.focus(); } catch (e) {}
    }
    previousFocus = null;
  }

  function finish(actionIndex) {
    if (!current) return;
    var c = current; current = null;
    var val = inputEl ? inputEl.value : '';
    var action = actionIndex >= 0 ? c.actions[actionIndex] : null;
    root.hidden = true;
    if (queue.length) show(queue.shift());
    else closeSession();
    if (c.type === 'custom') {
      if (action && typeof action.cb === 'function') setTimeout(action.cb, 60);
      return;
    }
    if (!c.cb) return;
    if (!action && !c.resolveOnDismiss) return;
    if (c.type === 'prompt') c.cb(action && action.value ? val : null);
    else if (c.type === 'confirm') c.cb(!!(action && action.value));
    else c.cb();
  }

  // 네이티브 alert 전역 대체(비차단). 기존 모든 alert(...) 호출이 자동 적용됨.
  window.alert = function (msg) { open({ type: 'alert', message: msg }); };

  // 레거시 호출 이름은 유지하되, 화면은 위 bld-modal 하나에서만 그립니다.
  window.belloreAlert = function (msg, cb) {
    open({ type: 'alert', message: msg, cb: typeof cb === 'function' ? function () { setTimeout(cb, 60); } : null });
  };
  window.belloreConfirm = function (msg, onOk, onCancel) {
    open({
      type: 'confirm',
      message: msg,
      cb: function (ok) {
        var callback = ok ? onOk : onCancel;
        if (typeof callback === 'function') setTimeout(callback, 60);
      }
    });
  };
  window.belloreModal = function (msg, buttons) {
    open({ type: 'custom', message: msg, buttons: buttons });
  };

  window.bellConfirm = function (msg, opts) {
    opts = opts || {};
    return new Promise(function (res) {
      open({ type: 'confirm', message: msg, title: opts.title, okText: opts.okText, cancelText: opts.cancelText, cb: res, resolveOnDismiss: true });
    });
  };
  window.bellPrompt = function (msg, def, opts) {
    opts = opts || {};
    return new Promise(function (res) {
      open({ type: 'prompt', message: msg, defaultValue: def, title: opts.title, okText: opts.okText, cancelText: opts.cancelText, cb: res, resolveOnDismiss: true });
    });
  };
  window.bellToast = function (msg) {
    var t = document.querySelector('.bld-toast');
    if (!t) { t = document.createElement('div'); t.className = 'bld-toast'; document.body.appendChild(t); }
    t.textContent = customerMessage(msg, 'general'); t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 2000);
  };
  window.belloreCustomerMessage = customerMessage;
})();
