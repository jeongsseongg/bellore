/* ============================================================
   벨로르(BELLORE) · 공통 다이얼로그 (ui-dialog.js)
   - 네이티브 alert/confirm/prompt(옛날 웹 팝업) 를 벨로르 스타일로 대체
   - window.alert 는 전역 교체(비차단). confirm/prompt 는 동기라 대체 불가 →
     bellConfirm(msg)→Promise<bool>, bellPrompt(msg, def)→Promise<string|null> 제공.
   - 스크롤 안전: 열 때 body overflow 저장 → 닫을 때 복원(중첩 모달에서도 안전)
   ============================================================ */
(function () {
  'use strict';
  var root, titleEl, msgEl, inputWrap, inputEl, okBtn, cancelBtn, prevOverflow, current;

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
    okBtn = root.querySelector('.bld-ok');
    cancelBtn = root.querySelector('.bld-cancel');

    root.querySelector('.bld-backdrop').addEventListener('click', function () {
      finish(current && current.type === 'alert');
    });
    okBtn.addEventListener('click', function () { finish(true); });
    cancelBtn.addEventListener('click', function () { finish(false); });
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    });
    document.addEventListener('keydown', function (e) {
      if (root.hidden || !current) return;
      if (e.key === 'Escape') finish(current.type === 'alert');
      else if (e.key === 'Enter' && current.type !== 'prompt') finish(true);
    });
  }

  // 줄바꿈(\n) 보존하며 텍스트 삽입(XSS 안전)
  function setText(el, text) {
    el.textContent = '';
    String(text == null ? '' : text).split('\n').forEach(function (line, i) {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(line));
    });
  }

  function open(opts) {
    build();
    current = opts;
    titleEl.textContent = opts.title || (opts.type === 'alert' ? '알림' : '확인');
    setText(msgEl, opts.message);
    if (opts.type === 'prompt') { inputWrap.hidden = false; inputEl.value = opts.defaultValue || ''; }
    else { inputWrap.hidden = true; }
    cancelBtn.hidden = (opts.type === 'alert');
    okBtn.textContent = opts.okText || '확인';
    cancelBtn.textContent = opts.cancelText || '취소';
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.hidden = false;
    setTimeout(function () { try { (opts.type === 'prompt' ? inputEl : okBtn).focus(); } catch (e) {} }, 30);
  }

  function finish(ok) {
    if (!current) return;
    var c = current; current = null;
    var val = inputEl ? inputEl.value : '';
    root.hidden = true;
    document.body.style.overflow = prevOverflow || '';
    if (!c.cb) return;
    if (c.type === 'prompt') c.cb(ok ? val : null);
    else if (c.type === 'confirm') c.cb(!!ok);
    else c.cb();
  }

  // 네이티브 alert 전역 대체(비차단). 기존 모든 alert(...) 호출이 자동 적용됨.
  window.alert = function (msg) { open({ type: 'alert', message: msg }); };

  window.bellConfirm = function (msg, opts) {
    opts = opts || {};
    return new Promise(function (res) {
      open({ type: 'confirm', message: msg, title: opts.title, okText: opts.okText, cancelText: opts.cancelText, cb: res });
    });
  };
  window.bellPrompt = function (msg, def, opts) {
    opts = opts || {};
    return new Promise(function (res) {
      open({ type: 'prompt', message: msg, defaultValue: def, title: opts.title, okText: opts.okText, cancelText: opts.cancelText, cb: res });
    });
  };
  window.bellToast = function (msg) {
    var t = document.querySelector('.bld-toast');
    if (!t) { t = document.createElement('div'); t.className = 'bld-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, 2000);
  };
})();
