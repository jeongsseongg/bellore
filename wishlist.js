/* ============================================================
   벨로르(BELLORE) · 찜(Wishlist) / 장바구니(Cart)
   - localStorage 기반 (로그인 불필요, 기기별 저장)
   - 카드/상세의 찜·장바구니 버튼, 찜 페이지 렌더, 하단 탭 배지
   ============================================================ */
(function () {
  'use strict';
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function fmt(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var WK = 'bellore_wish', CK = 'bellore_cart';
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } }
  function save(k, a) { try { localStorage.setItem(k, JSON.stringify(a)); } catch (e) {} }
  function getWish() { return load(WK); }
  function getCart() { return load(CK); }
  function idOf(it) { return String(it.id || (it.brand + '|' + it.model)); }
  function indexOf(arr, id) { for (var i = 0; i < arr.length; i++) { if (idOf(arr[i]) === id) return i; } return -1; }
  function findById(arr, id) { var i = indexOf(arr, id); return i >= 0 ? arr[i] : null; }
  function has(arr, id) { return indexOf(arr, id) >= 0; }

  function priceFromCard(card) {
    var p = card.querySelector('.hcard-price');
    if (!p) return 0;
    return parseInt((p.textContent || '').replace(/[^0-9]/g, ''), 10) || 0;
  }
  function itemFromCard(card) {
    var img = card.querySelector('.hcard-img img');
    var brand = card.querySelector('.hcard-brand');
    var model = card.querySelector('.hcard-model');
    var b = brand ? brand.textContent : (card.dataset.brand || '');
    var m = model ? model.textContent : (card.dataset.model || '');
    return {
      id: card.dataset.pid || (b + '|' + m),
      brand: b, model: m,
      price: parseInt(card.dataset.price, 10) || priceFromCard(card),
      img: img ? img.getAttribute('src') : ''
    };
  }

  function toggleWish(it) {
    var a = getWish(); var i = indexOf(a, idOf(it));
    if (i >= 0) a.splice(i, 1); else a.unshift(it);
    save(WK, a); refreshAll();
    return i < 0;
  }
  function addCart(it) {
    var a = getCart();
    if (indexOf(a, idOf(it)) < 0) { a.unshift(it); save(CK, a); }
    refreshAll();
  }
  function removeFromStore(k, id) {
    var a = load(k); var i = indexOf(a, id);
    if (i >= 0) { a.splice(i, 1); save(k, a); }
    refreshAll();
  }

  /* ---------- 카드에 찜/장바구니 버튼 부착 ---------- */
  function decorateCards() {
    $$('.hcard').forEach(function (card) {
      if (card.classList.contains('wish-card')) return;
      if (!card.querySelector('.hcard-actions')) {
        var box = document.createElement('div');
        box.className = 'hcard-actions';
        box.innerHTML =
          '<button type="button" class="hcard-wish" aria-label="찜"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg></button>' +
          '<button type="button" class="hcard-cart" aria-label="장바구니"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg></button>';
        card.appendChild(box);
      }
      syncCardState(card);
    });
  }
  function syncCardState(card) {
    var w = card.querySelector('.hcard-wish');
    if (w) w.classList.toggle('on', has(getWish(), idOf(itemFromCard(card))));
  }

  /* ---------- 클릭 핸들러 ---------- */
  // 카드의 찜/장바구니
  document.addEventListener('click', function (e) {
    var wb = e.target.closest('.hcard-wish'), cb = e.target.closest('.hcard-cart');
    if (!wb && !cb) return;
    var card = e.target.closest('.hcard'); if (!card) return;
    e.preventDefault(); e.stopPropagation();
    var it = itemFromCard(card);
    if (wb) toast(toggleWish(it) ? '찜에 담았어요' : '찜을 해제했어요');
    else { addCart(it); toast('장바구니에 담았어요'); }
  });

  // 찜페이지의 담기/삭제
  document.addEventListener('click', function (e) {
    var rm = e.target.closest('.wish-remove'), ac = e.target.closest('.wish-addcart');
    if (rm) { e.preventDefault(); removeFromStore(rm.dataset.kind === 'cart' ? CK : WK, rm.dataset.id); return; }
    if (ac) {
      e.preventDefault();
      var it = findById(getWish(), ac.dataset.id);
      if (it) { addCart(it); toast('장바구니에 담았어요'); }
    }
  });

  // 상세 페이지 찜/장바구니
  document.addEventListener('click', function (e) {
    var w = e.target.closest('#pmWish, #pmWishTop'), c = e.target.closest('#pmCart');
    if (!w && !c) return;
    var p = window.BELLORE_currentProduct; if (!p) return;
    var it = { id: p.listingId || (p.brand + '|' + p.model), brand: p.brand, model: p.model, price: p.price, img: p.image };
    if (w) {
      var added = toggleWish(it);
      $$('#pmWish, #pmWishTop').forEach(function (b) { b.classList.toggle('on', added); });
      toast(added ? '찜에 담았어요' : '찜을 해제했어요');
    } else { addCart(it); toast('장바구니에 담았어요'); }
  });

  // 상품 상세 진입 시 찜 버튼 상태 동기화
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.hcard');
    if (!card || card.classList.contains('wish-card')) return;
    if (e.target.closest('.hcard-actions')) return;
    setTimeout(function () {
      var p = window.BELLORE_currentProduct; if (!p) return;
      var on = has(getWish(), String(p.listingId || (p.brand + '|' + p.model)));
      $$('#pmWish, #pmWishTop').forEach(function (b) { b.classList.toggle('on', on); });
    }, 60);
  });

  /* ---------- 찜 페이지 (찜목록 / 장바구니 전환) ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('.wish-tab'); if (!t) return;
    showView(t.dataset.wishtab);
  });
  function showView(v) {
    $$('.wish-tab').forEach(function (x) { x.classList.toggle('active', x.dataset.wishtab === v); });
    var pw = $('#wishPanelWish'), pc = $('#wishPanelCart');
    if (pw) pw.hidden = (v !== 'wish');
    if (pc) pc.hidden = (v !== 'cart');
  }
  function curView() { var pc = $('#wishPanelCart'); return (pc && !pc.hidden) ? 'cart' : 'wish'; }

  // 하단 '찜' 탭: 처음 들어오면 찜목록, 이미 찜페이지면 장바구니로 토글
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-nav="wishlist"]'); if (!t) return;
    var page = $('#wishlist');
    var wasActive = !!(page && page.classList.contains('active'));
    var fromMyPage = (t.id === 'myCartLink');
    if (fromMyPage) { var mp = $('#myPageModal'); if (mp) { mp.hidden = true; document.body.style.overflow = ''; } }
    setTimeout(function () {
      if (wasActive && !fromMyPage) showView(curView() === 'wish' ? 'cart' : 'wish');
      else showView(fromMyPage ? 'cart' : 'wish');
      renderPage();
    }, 0);
  }, true);

  /* ---------- 렌더 ---------- */
  function cardHTML(it, kind) {
    return '<article class="hcard wish-card" data-pid="' + esc(idOf(it)) + '" data-brand="' + esc(it.brand) + '" data-model="' + esc(it.model) + '" data-price="' + (it.price || 0) + '">' +
      '<div class="hcard-img"><img src="' + esc(it.img || 'assets/images.jpg') + '" alt=""></div>' +
      '<p class="hcard-brand">' + esc(it.brand) + '</p>' +
      '<p class="hcard-model">' + esc(it.model) + '</p>' +
      '<p class="hcard-price">' + (it.price ? fmt(it.price) + '<em>원</em>' : '가격 문의') + '</p>' +
      '<div class="wish-card-acts">' +
      (kind === 'wish' ? '<button type="button" class="wish-addcart" data-id="' + esc(idOf(it)) + '">장바구니 담기</button>' : '') +
      '<button type="button" class="wish-remove" data-kind="' + kind + '" data-id="' + esc(idOf(it)) + '">삭제</button>' +
      '</div></article>';
  }
  function renderPage() {
    var wish = getWish(), cart = getCart();
    var wg = $('#wishGrid'), cg = $('#cartGrid');
    if (wg) wg.innerHTML = wish.map(function (it) { return cardHTML(it, 'wish'); }).join('');
    if (cg) cg.innerHTML = cart.map(function (it) { return cardHTML(it, 'cart'); }).join('');
    var we = $('#wishEmpty'), ce = $('#cartEmpty');
    if (we) we.hidden = wish.length > 0;
    if (ce) ce.hidden = cart.length > 0;
    if ($('#wishCount')) $('#wishCount').textContent = wish.length;
    if ($('#cartCount')) $('#cartCount').textContent = cart.length;
  }
  function updateBadge() {
    var b = $('#tabWishBadge'); if (!b) return;
    var n = getWish().length + getCart().length;
    b.textContent = n > 99 ? '99+' : n; b.hidden = (n === 0);
  }
  function refreshAll() {
    updateBadge(); renderPage();
    $$('.hcard').forEach(function (c) { if (!c.classList.contains('wish-card')) syncCardState(c); });
  }

  /* ---------- 토스트 ---------- */
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'wish-toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  }

  /* ---------- 초기화 ---------- */
  function init() {
    decorateCards(); refreshAll();
    var deco = null;
    try {
      new MutationObserver(function () {
        clearTimeout(deco); deco = setTimeout(decorateCards, 200);
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      [800, 2500, 5000].forEach(function (t) { setTimeout(decorateCards, t); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
