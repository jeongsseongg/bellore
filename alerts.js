/* ============================================================
   벨로르(BELLORE) · 소식받기 / 기다리는 시계
   - 찾는 모델이 아직 입고되지 않았을 때(검색·필터 0건) '소식받기'로 신청
   - 로그인 시: 계정에 저장(watch_alerts) → 기기 간 동기화
   - 비로그인 시: localStorage(기기별) 폴백 → 로그인하면 자동으로 계정에 합쳐짐
   - SQL(watch_alerts) 미실행 등 DB 오류 시에도 localStorage 로 자동 폴백(끊김 없음)
   ============================================================ */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var K = 'bellore_alerts';
  function lload() { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch (e) { return []; } }
  function lsave(a) { try { localStorage.setItem(K, JSON.stringify(a)); } catch (e) {} }
  function idOf(o) { return String(((o.brand || '') + '|' + (o.model || '') + '|' + (o.q || '')).trim()); }

  var cache = null;   // 로그인+DB 모드일 때의 메모리 캐시(렌더 소스)
  var useDB = false;  // true = 계정(DB) 모드

  function B() { return window.NWBackend; }
  function loggedIn() { try { return !!(B() && B().currentUser && B().currentUser()); } catch (e) { return false; } }
  function dbReady() { return !!(loggedIn() && B().listAlerts); }

  // 현재 목록(동기) — DB 모드면 캐시, 아니면 localStorage
  function list() { return (useDB && cache) ? cache : lload(); }
  function has(id) { return list().some(function (x) { return idOf(x) === id; }); }

  function label(it) {
    var t = [it.brand, it.model].filter(Boolean).join(' ').trim();
    return t || it.q || '관심 시계';
  }

  var BELL = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';

  function brandIc(it) {
    var b = window.BELLORE_BRAND_BY_NAME && window.BELLORE_BRAND_BY_NAME(it.brand);
    var logo = (b && window.BELLORE_BRAND_LOGO) ? window.BELLORE_BRAND_LOGO(b.slug) : '';
    if (logo) {
      return '<span class="alert-ic alert-ic-brand">' +
        '<img src="' + esc(logo) + '" alt="" loading="lazy" onerror="this.remove();this.parentNode.classList.add(\'fallback\')">' +
        BELL + '</span>';
    }
    return '<span class="alert-ic">' + BELL + '</span>';
  }
  function rowHTML(it) {
    var id = idOf(it);
    return '<div class="alert-row">' +
        brandIc(it) +
        '<div class="alert-main">' +
          '<p class="alert-name">' + esc(label(it)) + '</p>' +
          '<p class="alert-sub">입고되면 가장 먼저 소식 보내드릴게요</p>' +
        '</div>' +
        '<button type="button" class="alert-remove" data-aid="' + esc(id) + '" aria-label="삭제">×</button>' +
      '</div>';
  }
  function render() {
    var items = list();
    ['#wishAlerts', '#myAlerts'].forEach(function (sel) {
      var box = $(sel);
      if (!box) return;
      box.innerHTML = items.length
        ? items.map(rowHTML).join('')
        : '<p class="alert-empty">소식받기를 신청한 시계가 없습니다.<br>찾는 모델이 없을 때 ‘소식받기’를 눌러보세요.</p>';
    });
    var c1 = $('#wishAlertCount'); if (c1) c1.textContent = items.length;
    var c2 = $('#myAlertCount'); if (c2) c2.textContent = items.length;
    var c3 = $('#pocketAlerts'); if (c3) { c3.textContent = items.length; c3.hidden = items.length === 0; }
  }

  // DB → 캐시 동기화. 실패하면 localStorage 폴백.
  function refresh() {
    if (dbReady()) {
      return B().listAlerts().then(function (rows) {
        useDB = true; cache = rows || []; render(); return cache;
      }).catch(function () {
        useDB = false; cache = null; render();
      });
    }
    useDB = false; cache = null; render();
    return Promise.resolve(list());
  }

  // 로그인 시: 기기에 쌓인 localStorage 목록을 계정으로 1회 병합 후 정리
  function mergeLocalToDB() {
    var local = lload();
    if (!(dbReady() && B().addAlert)) return refresh();
    if (!local.length) return refresh();
    return Promise.all(local.map(function (it) { return B().addAlert(it).catch(function () {}); }))
      .then(function () { lsave([]); return refresh(); })
      .catch(function () { return refresh(); });
  }

  function add(o) {
    o = o || {};
    var id = idOf(o);
    if (!id || id === '||') return false;
    if (has(id)) return false;
    var item = { brand: o.brand || '', model: o.model || '', q: o.q || '', ts: Date.now() };
    if (useDB && dbReady() && B().addAlert) {
      cache = [item].concat(cache || []); render();
      B().addAlert(item).catch(function () { refresh(); });
    } else {
      var a = lload();
      if (a.some(function (x) { return idOf(x) === id; })) return false;
      a.unshift(item); lsave(a); render();
    }
    return true;
  }
  function remove(id) {
    if (useDB && dbReady() && B().removeAlert) {
      cache = (cache || []).filter(function (x) { return idOf(x) !== id; }); render();
      B().removeAlert(id).catch(function () { refresh(); });
    } else {
      lsave(lload().filter(function (x) { return idOf(x) !== id; })); render();
    }
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

  /* 로그인/로그아웃 시 계정 연동 */
  function bindAuth() {
    if (B() && B().onAuthChange) {
      B().onAuthChange(function (user) {
        if (user) mergeLocalToDB();
        else { useDB = false; cache = null; render(); }
      });
      return true;
    }
    return false;
  }

  /* ---------- 토스트 ---------- */
  var tEl = null, tT = null;
  function toast(m) {
    if (!tEl) { tEl = document.createElement('div'); tEl.className = 'wish-toast'; document.body.appendChild(tEl); }
    tEl.textContent = m; tEl.classList.add('show');
    clearTimeout(tT); tT = setTimeout(function () { tEl.classList.remove('show'); }, 1800);
  }

  window.BELLOREAlerts = { add: add, remove: remove, list: list, has: has, render: render, idOf: idOf, refresh: refresh };

  function init() {
    render();
    // NWBackend 가 늦게 로드될 수 있어 잠깐 대기 후 바인딩
    if (!bindAuth()) {
      var tries = 0, t = setInterval(function () {
        if (bindAuth() || ++tries > 20) clearInterval(t);
      }, 150);
    }
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
