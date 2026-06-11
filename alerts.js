/* ============================================================
   벨로르(BELLORE) · 소식받기 / 기다리는 시계
   - 찾는 모델이 아직 입고되지 않았을 때(검색·필터 0건) '소식받기'로 신청
   - localStorage 기반(로그인 불필요, 기기별 저장)
   - 찜 페이지(#wishAlerts) · 마이페이지(#myAlerts)에 목록 노출
   ============================================================ */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var K = 'bellore_alerts';
  function load() { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch (e) { return []; } }
  function save(a) { try { localStorage.setItem(K, JSON.stringify(a)); } catch (e) {} }
  function idOf(o) { return String(((o.brand || '') + '|' + (o.model || '') + '|' + (o.q || '')).trim()); }
  function list() { return load(); }
  function has(id) { return load().some(function (x) { return idOf(x) === id; }); }

  function add(o) {
    o = o || {};
    var a = load(), id = idOf(o);
    if (!id || id === '||' || a.some(function (x) { return idOf(x) === id; })) return false;
    a.unshift({ brand: o.brand || '', model: o.model || '', q: o.q || '', ts: Date.now() });
    save(a); render(); return true;
  }
  function remove(id) {
    save(load().filter(function (x) { return idOf(x) !== id; }));
    render();
  }
  function label(it) {
    var t = [it.brand, it.model].filter(Boolean).join(' ').trim();
    return t || it.q || '관심 시계';
  }

  var BELL = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';

  function rowHTML(it) {
    var id = idOf(it);
    return '<div class="alert-row">' +
        '<span class="alert-ic">' + BELL + '</span>' +
        '<div class="alert-main">' +
          '<p class="alert-name">' + esc(label(it)) + '</p>' +
          '<p class="alert-sub">입고되면 가장 먼저 소식 보내드릴게요</p>' +
        '</div>' +
        '<button type="button" class="alert-remove" data-aid="' + esc(id) + '" aria-label="삭제">×</button>' +
      '</div>';
  }
  function render() {
    var items = load();
    ['#wishAlerts', '#myAlerts'].forEach(function (sel) {
      var box = $(sel);
      if (!box) return;
      box.innerHTML = items.length
        ? items.map(rowHTML).join('')
        : '<p class="alert-empty">소식받기를 신청한 시계가 없습니다.<br>찾는 모델이 없을 때 ‘소식받기’를 눌러보세요.</p>';
    });
    var c1 = $('#wishAlertCount'); if (c1) c1.textContent = items.length;
    var c2 = $('#myAlertCount'); if (c2) c2.textContent = items.length;
  }

  /* ---------- 클릭: 소식받기 신청 / 삭제 ---------- */
  document.addEventListener('click', function (e) {
    var addBtn = e.target.closest('.js-alert-add');
    if (addBtn) {
      e.preventDefault();
      var ok = add({ brand: addBtn.dataset.brand || '', model: addBtn.dataset.model || '', q: addBtn.dataset.q || '' });
      addBtn.classList.add('done'); addBtn.disabled = true;
      addBtn.innerHTML = ok ? '✓ 소식받기 신청 완료' : '이미 신청한 시계예요';
      toast(ok ? '소식받기를 신청했어요. 입고되면 알려드릴게요' : '이미 신청한 시계예요');
      return;
    }
    var rm = e.target.closest('.alert-remove');
    if (rm) { e.preventDefault(); remove(rm.dataset.aid); }
  });

  /* 찜·마이페이지 진입 시 목록 갱신 */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-nav="wishlist"]') || e.target.closest('[data-nav="mypage"]') ||
        e.target.closest('#myPageBtn') || e.target.closest('#headerProfile')) {
      setTimeout(render, 80);
    }
  }, true);

  /* ---------- 토스트 ---------- */
  var tEl = null, tT = null;
  function toast(m) {
    if (!tEl) { tEl = document.createElement('div'); tEl.className = 'wish-toast'; document.body.appendChild(tEl); }
    tEl.textContent = m; tEl.classList.add('show');
    clearTimeout(tT); tT = setTimeout(function () { tEl.classList.remove('show'); }, 1800);
  }

  window.BELLOREAlerts = { add: add, remove: remove, list: list, has: has, render: render, idOf: idOf };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
