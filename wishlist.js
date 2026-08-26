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
  var B = window.NWBackend;
  var state = { wish: [], cart: [] }, selectedCart = {}, loggedIn = false; // 메모리 캐시

  function lsLoad(k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } }
  function lsSave(k, a) { try { localStorage.setItem(k, JSON.stringify(a)); } catch (e) {} }
  function usingDB() { return !!(B && B.configured && B.currentUser && B.currentUser() && B.listPicks); }
  function keyOf(kind) { return kind === 'cart' ? CK : WK; }
  function arrOf(kind) { return kind === 'cart' ? state.cart : state.wish; }

  function getWish() { return state.wish; }
  function getCart() { return state.cart; }
  function idOf(it) { return String(it.id || (it.brand + '|' + it.model)); }
  function indexOf(arr, id) { for (var i = 0; i < arr.length; i++) { if (idOf(arr[i]) === id) return i; } return -1; }
  function findById(arr, id) { var i = indexOf(arr, id); return i >= 0 ? arr[i] : null; }
  function has(arr, id) { return indexOf(arr, id) >= 0; }
  function availability(it) { var ui = window.BELLORE_LISTING_UI; return ui ? ui.state(it && it.status) : { status: (it && it.status) || 'on_sale', label: '', message: '', purchasable: true, visible: false }; }
  function isPurchasable(it) { return availability(it).purchasable; }
  function listingBadge(it) { var ui = window.BELLORE_LISTING_UI; return ui ? ui.cardMarkup(it || {}) : ''; }
  function hydrateCollections(collections) { var ui = window.BELLORE_LISTING_UI; return ui ? ui.hydrateCollections(B, collections, { preferSalePrice: true }) : Promise.resolve(collections); }

  // 계정/게스트 상태에 맞춰 찜·장바구니 로드
  function loadState() {
    function accept(collections) {
      return hydrateCollections(collections).catch(function () { return collections; }).then(function (fresh) {
        state.wish = fresh[0] || []; state.cart = fresh[1] || []; refreshAll();
        var ui = window.BELLORE_LISTING_UI; if (ui) return ui.refreshViewedStatuses(B).then(renderPage, function () {});
      });
    }
    var source = usingDB() ? Promise.all([B.listPicks('wish'), B.listPicks('cart')]) : Promise.resolve([lsLoad(WK), lsLoad(CK)]);
    source.catch(function () { return [lsLoad(WK), lsLoad(CK)]; }).then(accept);
  }
  // 게스트로 담아둔 것 → 로그인 시 그 계정으로 병합
  function mergeGuestToDB() {
    if (!usingDB()) return Promise.resolve();
    var gw = lsLoad(WK), gc = lsLoad(CK);
    if (!gw.length && !gc.length) return Promise.resolve();
    var ps = [];
    gw.forEach(function (it) { ps.push(B.addPick('wish', it).catch(function () {})); });
    gc.forEach(function (it) { ps.push(B.addPick('cart', it).catch(function () {})); });
    return Promise.all(ps).then(function () {
      try { localStorage.removeItem(WK); localStorage.removeItem(CK); } catch (e) {}
    });
  }
  // 변경 영속화 (로그인=DB, 게스트=localStorage). 낙관적 업데이트.
  function persist(kind, action, payload) {
    if (usingDB()) (action === 'add' ? B.addPick(kind, payload) : B.removePick(kind, payload)).catch(function () {});
    else lsSave(keyOf(kind), arrOf(kind));
  }

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
      id: card.dataset.pid || (b + '|' + m), product_no: card.dataset.no || '',
      brand: b, model: m,
      price: parseInt(card.dataset.price, 10) || priceFromCard(card),
      img: img ? img.getAttribute('src') : '', status: card.dataset.status || 'on_sale'
    };
  }

  function toggleWish(it) {
    var a = state.wish; var i = indexOf(a, idOf(it));
    if (i >= 0) { a.splice(i, 1); persist('wish', 'remove', idOf(it)); }
    else { a.unshift(it); persist('wish', 'add', it); }
    refreshAll(); return i < 0;
  }
  function addCart(it) {
    var a = state.cart;
    if (indexOf(a, idOf(it)) < 0) { a.unshift(it); persist('cart', 'add', it); }
    refreshAll();
  }
  function removeFromStore(kind, id) {
    var a = arrOf(kind); var i = indexOf(a, id);
    if (i >= 0) { a.splice(i, 1); persist(kind, 'remove', id); }
    refreshAll();
  }
  function viewedItems() {
    var list = (window.BELLORE_getViewed && window.BELLORE_getViewed()) || [];
    var cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return list.filter(function (it) { return !it.ts || Number(it.ts) >= cutoff; });
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
        var homeImg = card.closest('#homeOnSale') && card.querySelector('.hcard-img');
        (homeImg || card).appendChild(box);
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

  // 찜페이지의 바로 구매 → 결제 진입점으로 연결
  document.addEventListener('click', function (e) {
    var buy = e.target.closest('.wish-buy');
    if (!buy) return;
    e.preventDefault(); e.stopPropagation();
    var it = findById(getWish(), buy.getAttribute('data-buy')); if (it && !isPurchasable(it)) { alert(availability(it).message); return; }
    if (it && window.BELLORE_openCheckout) {
      window.BELLORE_openCheckout({ listingId: it.id, brand: it.brand, model: it.model, price: it.price, image: it.img, status: it.status });
    }
  });

  // 찜페이지의 담기/삭제
  document.addEventListener('click', function (e) {
    var rm = e.target.closest('.wish-remove'), ac = e.target.closest('.wish-addcart');
    if (rm) { e.preventDefault(); bellConfirm('이 항목을 삭제할까요?').then(function (ok) { if (!ok) return; removeFromStore(rm.dataset.kind === 'cart' ? 'cart' : 'wish', rm.dataset.id); }); return; }
    if (ac) {
      e.preventDefault();
      var it = findById(getWish(), ac.dataset.id);
      if (it) { addCart(it); toast('장바구니에 담았어요'); }
    }
  });

  // 장바구니 선택·일괄 삭제·주문 / 최근 본에서 찜
  document.addEventListener('click', function (e) {
    var check = e.target.closest('[data-cart-check]');
    if (check) {
      var cid = check.getAttribute('data-cart-check');
      selectedCart[cid] = !selectedCart[cid];
      renderPage();
      return;
    }
    if (e.target.closest('#cartSelectAll')) {
      var cart = getCart().filter(isPurchasable), shouldSelect = selectedItems().length !== cart.length;
      cart.forEach(function (it) { selectedCart[idOf(it)] = shouldSelect; });
      renderPage();
      return;
    }
    if (e.target.closest('#cartRemoveSelected')) {
      var picked = selectedItems();
      if (!picked.length) { toast('삭제할 상품을 선택해 주세요'); return; }
      bellConfirm('선택한 ' + picked.length + '개 상품을 삭제할까요?').then(function (ok) {
        if (!ok) return;
        picked.forEach(function (it) {
          var id = idOf(it), idx = indexOf(state.cart, id);
          if (idx >= 0) state.cart.splice(idx, 1);
          persist('cart', 'remove', id);
          delete selectedCart[id];
        });
        refreshAll();
      });
      return;
    }
    var rw = e.target.closest('[data-recent-wish]');
    if (rw) {
      var rid = rw.getAttribute('data-recent-wish');
      var rit = viewedItems().filter(function (it) { return idOf(it) === rid; })[0];
      if (rit) toast(toggleWish(rit) ? '찜에 담았어요' : '찜을 해제했어요');
      return;
    }
    var recWish = e.target.closest('[data-recommend-wish]');
    if (recWish) {
      var recId = recWish.getAttribute('data-recommend-wish');
      var recItem = recommendedItems().filter(function (it) { return idOf(it) === recId; })[0];
      if (recItem) toast(toggleWish(recItem) ? '찜에 담았어요' : '찜을 해제했어요');
      return;
    }
    if (e.target.closest('#recentClearAll')) {
      bellConfirm('최근 본 기록을 모두 삭제할까요?').then(function (ok) {
        if (!ok) return;
        try { localStorage.removeItem('bellore_recent_items'); } catch (err) {}
        renderPage();
        toast('최근 본 기록을 삭제했어요');
      });
      return;
    }
    var edit = e.target.closest('#wishEdit');
    if (edit) {
      var grid = $('#wishGrid');
      var editing = grid && grid.classList.toggle('editing');
      edit.classList.toggle('active', !!editing);
      edit.textContent = editing ? '완료' : '편집';
      return;
    }
    var order = e.target.closest('#cartOrderSelected');
    if (order) {
      var items = selectedItems();
      if (!items.length) { toast('주문할 상품을 선택해 주세요'); return; }
      if (items.length > 1) {
        var npay = $('#npay-cart-button-container');
        if (npay && !npay.hidden) {
          npay.scrollIntoView({ behavior: 'smooth', block: 'center' });
          toast('여러 상품은 네이버페이 장바구니 결제를 이용해 주세요');
        } else {
          toast('여러 상품 주문은 고객센터에서 도와드릴게요');
        }
        return;
      }
      var it = items[0]; if (!isPurchasable(it)) { toast(availability(it).message); return; }
      if (window.BELLORE_openCheckout) {
        window.BELLORE_openCheckout({ listingId: it.id, brand: it.brand, model: it.model, price: it.price, image: it.img, status: it.status });
      }
      return;
    }
    var cartThumb = e.target.closest('.wish-cart-thumb');
    if (cartThumb) {
      var cartPid = cartThumb.getAttribute('data-pid');
      if (cartPid && window.BELLORE_openProductById) window.BELLORE_openProductById(cartPid);
      return;
    }
    var recentRow = e.target.closest('.wish-recent-row');
    if (recentRow && !e.target.closest('button')) {
      var pid = recentRow.getAttribute('data-pid');
      if (pid && window.BELLORE_openProductById) window.BELLORE_openProductById(pid);
      return;
    }
    var recommendCard = e.target.closest('.wish-recommend-card');
    if (recommendCard && !e.target.closest('button')) {
      var recommendPid = recommendCard.getAttribute('data-pid');
      if (recommendPid && window.BELLORE_openProductById) window.BELLORE_openProductById(recommendPid);
    }
  });

  // 상세 페이지 찜/장바구니
  document.addEventListener('click', function (e) {
    var w = e.target.closest('#pmWish, #pmWishTop'), c = e.target.closest('#pmCart');
    if (!w && !c) return;
    var p = window.BELLORE_currentProduct; if (!p) return;
    var it = { id: p.listingId || (p.brand + '|' + p.model), product_no: p.productNo || '', brand: p.brand, model: p.model, price: p.price, img: p.image, status: p.status || 'on_sale' };
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
    renderPage();
  });
  function showView(v) {
    $$('.wish-tab').forEach(function (x) { x.classList.toggle('active', x.dataset.wishtab === v); });
    var pw = $('#wishPanelWish'), pc = $('#wishPanelCart'), pr = $('#wishPanelRecent');
    if (pw) pw.hidden = (v !== 'wish');
    if (pc) pc.hidden = (v !== 'cart');
    if (pr) pr.hidden = (v !== 'recent');
  }
  function curView() {
    var pc = $('#wishPanelCart'), pr = $('#wishPanelRecent');
    if (pc && !pc.hidden) return 'cart';
    if (pr && !pr.hidden) return 'recent';
    return 'wish';
  }

  // 하단 보관함 탭은 항상 찜으로 진입한다. 장바구니·최근 본은 각 탭에서 명시적으로 선택한다.
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-nav="wishlist"]'); if (!t) return;
    var page = $('#wishlist');
    var wasActive = !!(page && page.classList.contains('active'));
    var fromMyPage = (t.id === 'myCartLink');
    if (fromMyPage) { var mp = $('#myPageModal'); if (mp) { mp.hidden = true; document.body.style.overflow = ''; } }
    setTimeout(function () {
      showView(fromMyPage ? 'cart' : 'wish');
      renderPage();
    }, 0);
  }, true);

  /* ---------- 렌더 ---------- */
  function cardHTML(it, kind) { var saleState = availability(it);
    return '<article class="hcard wish-card" data-pid="' + esc(idOf(it)) + '" data-brand="' + esc(it.brand) + '" data-model="' + esc(it.model) + '" data-price="' + (it.price || 0) + '" data-status="' + esc(saleState.status) + '">' +
      '<div class="hcard-img"><img src="' + esc(it.img || 'assets/images.jpg') + '" alt="">' + listingBadge(it) +
      '<button type="button" class="wish-remove wish-heart-on" data-kind="' + kind + '" data-id="' + esc(idOf(it)) + '" aria-label="찜 해제"><svg viewBox="0 0 24 24"><path d="M12 20.3s-7.5-4.6-7.5-9.7A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 3c0 5.1-7.5 9.7-7.5 9.7Z"/></svg></button></div>' +
      '<p class="hcard-brand">' + esc(it.brand) + '</p>' +
      '<p class="hcard-model">' + esc(it.model) + '</p>' +
      '<p class="wish-price-label">즉시 구매가</p>' +
      '<p class="hcard-price">' + (it.price ? fmt(it.price) + '<em>원</em>' : '가격 문의') + '</p>' +
      '<div class="wish-card-acts">' +
        '<button type="button" class="wish-buy" data-buy="' + esc(idOf(it)) + '"' + (saleState.purchasable ? '' : ' disabled aria-disabled="true"') + '>' + (saleState.purchasable ? '구매하기' : esc(saleState.label || '구매불가')) + '</button>' +
        '<button type="button" class="wish-addcart" data-id="' + esc(idOf(it)) + '">장바구니 담기</button>' +
      '</div>' +
      '</article>';
  }
  function cartRowHTML(it) {
    var id = idOf(it), on = !!selectedCart[id], saleState = availability(it);
    var isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    var metaId = (id.indexOf('|') >= 0 || isUuid) ? '' : id + ' · ';
    return '<article class="wish-cart-row" data-cart-id="' + esc(id) + '" data-status="' + esc(saleState.status) + '">' +
      '<button type="button" class="wish-check-btn' + (on ? ' on' : '') + '" data-cart-check="' + esc(id) + '" aria-label="상품 선택"' + (saleState.purchasable ? '' : ' disabled aria-disabled="true"') + '><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7"/></svg></button>' +
      '<button type="button" class="wish-cart-thumb" data-pid="' + esc(id) + '"><img src="' + esc(it.img || 'assets/images.jpg') + '" alt=""></button>' +
      '<span class="wish-cart-copy"><b>' + esc(it.brand) + '</b><strong>' + esc(it.model) + '</strong><em>' + (it.price ? fmt(it.price) + '원' : '가격 문의') + '</em><small>' + (saleState.purchasable ? esc(metaId) + '무료배송' : esc(saleState.label || '구매불가')) + '</small></span>' +
      '<button type="button" class="wish-remove wish-cart-remove" data-kind="cart" data-id="' + esc(id) + '" aria-label="삭제"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '</article>';
  }
  function recommendedItems() {
    var cart = getCart(), seen = {};
    return $$('.hcard:not(.wish-card)').map(itemFromCard).filter(function (it) {
      var id = idOf(it);
      if (!id || seen[id] || has(cart, id)) return false;
      seen[id] = true;
      return true;
    }).slice(0, 2);
  }
  function recommendHTML(it) {
    var id = idOf(it);
    return '<article class="wish-recommend-card" data-pid="' + esc(id) + '">' +
      '<div class="wish-recommend-image"><img src="' + esc(it.img || 'assets/images.jpg') + '" alt="">' +
      '<button type="button" class="wish-recent-heart' + (has(getWish(), id) ? ' on' : '') + '" data-recommend-wish="' + esc(id) + '" aria-label="찜"><svg viewBox="0 0 24 24"><path d="M12 20.3s-7.5-4.6-7.5-9.7A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 3c0 5.1-7.5 9.7-7.5 9.7Z"/></svg></button></div>' +
      '<b>' + esc(it.brand) + '</b><strong>' + esc(it.model) + '</strong><small>즉시 구매가</small>' +
      '<em>' + (it.price ? fmt(it.price) + '원' : '가격 문의') + '</em></article>';
  }
  function recentDay(ts) {
    var d = new Date(Number(ts) || Date.now()), now = new Date();
    var a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var diff = Math.round((a - b) / 86400000);
    if (diff === 0) return '오늘';
    if (diff === 1) return '어제';
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }
  function recentHTML(list) {
    var last = '';
    return list.map(function (it) {
      var day = recentDay(it.ts), head = day !== last ? '<h4 class="wish-recent-day">' + day + '</h4>' : '';
      last = day;
      return head + '<article class="wish-recent-row" data-pid="' + esc(idOf(it)) + '" data-brand="' + esc(it.brand) + '" data-model="' + esc(it.model) + '" data-status="' + esc(availability(it).status) + '">' +
        '<span class="wish-recent-thumb"><img src="' + esc(it.img || 'assets/images.jpg') + '" alt="">' + listingBadge(it) + '</span>' +
        '<span class="wish-recent-copy"><b>' + esc(it.brand) + '</b><strong>' + esc(it.model) + '</strong><em>' + (it.price ? fmt(it.price) + '원' : '가격 문의') + '</em></span>' +
        '<button type="button" class="wish-recent-heart' + (has(getWish(), idOf(it)) ? ' on' : '') + '" data-recent-wish="' + esc(idOf(it)) + '" aria-label="찜"><svg viewBox="0 0 24 24"><path d="M12 20.3s-7.5-4.6-7.5-9.7A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 3c0 5.1-7.5 9.7-7.5 9.7Z"/></svg></button>' +
        '</article>';
    }).join('');
  }
  function renderPage() {
    var wish = getWish(), cart = getCart(), recent = viewedItems();
    cart.forEach(function (it) { var id = idOf(it); if (!isPurchasable(it)) selectedCart[id] = false; else if (!(id in selectedCart)) selectedCart[id] = true; });
    Object.keys(selectedCart).forEach(function (id) { if (!findById(cart, id)) delete selectedCart[id]; });
    var wg = $('#wishGrid'), cg = $('#cartGrid'), rg = $('#recentList');
    if (wg) wg.innerHTML = wish.map(function (it) { return cardHTML(it, 'wish'); }).join('');
    if (cg) cg.innerHTML = cart.map(cartRowHTML).join('');
    if (rg) rg.innerHTML = recentHTML(recent);
    var recommendations = recommendedItems(), recommendGrid = $('#cartRecommendGrid');
    if (recommendGrid) recommendGrid.innerHTML = recommendations.map(recommendHTML).join('');
    var we = $('#wishEmpty'), ce = $('#cartEmpty'), re = $('#recentEmpty');
    if (we) we.hidden = wish.length > 0;
    if (ce) ce.hidden = cart.length > 0;
    if (re) re.hidden = recent.length > 0;
    if ($('#wishTools')) $('#wishTools').hidden = !wish.length;
    if ($('#recentTools')) $('#recentTools').hidden = !recent.length;
    if ($('#recentHint')) $('#recentHint').hidden = !recent.length;
    if ($('#recentToolCount')) $('#recentToolCount').textContent = recent.length;
    if ($('#cartRecommendations')) $('#cartRecommendations').hidden = !cart.length || !recommendations.length;
    if ($('#wishCount')) $('#wishCount').textContent = wish.length;
    if ($('#cartCount')) $('#cartCount').textContent = cart.length;
    if ($('#recentCount')) $('#recentCount').textContent = recent.length;
    renderCartSummary();
  }
  function selectedItems() { return getCart().filter(function (it) { return isPurchasable(it) && !!selectedCart[idOf(it)]; }); }
  function renderCartSummary() {
    var cart = getCart(), picked = selectedItems(), total = picked.reduce(function (sum, it) { return sum + Number(it.price || 0); }, 0);
    var tools = $('#cartTools'), summary = $('#cartSummary'), all = $('#cartSelectAll');
    if (tools) tools.hidden = !cart.length;
    if (summary) summary.hidden = !cart.length;
    if ($('#cartAllCount')) $('#cartAllCount').textContent = cart.length;
    if ($('#cartProductTotal')) $('#cartProductTotal').textContent = fmt(total) + '원';
    if ($('#cartSelectedTotal')) $('#cartSelectedTotal').textContent = fmt(total) + '원';
    var couponText = ($('#mpStatCoupon') && $('#mpStatCoupon').textContent) || '0장';
    if ($('#cartCouponCount')) $('#cartCouponCount').textContent = couponText;
    if (all) all.classList.toggle('on', !!cart.length && picked.length === cart.length);
    var order = $('#cartOrderSelected');
    if (order) { order.disabled = !picked.length; order.textContent = picked.length ? '선택 ' + picked.length + '점 주문하기' : '상품을 선택해 주세요'; }
  }
  function updateBadge() {
    var b = $('#tabWishBadge');
    if (b) { var n = getWish().length + getCart().length; b.textContent = n > 99 ? '99+' : n; b.hidden = (n === 0); }
    // 상단 헤더 장바구니 배지(장바구니 수량만)
    var cb = $('#cartBadgeTop');
    if (cb) { var c = getCart().length; cb.textContent = c > 99 ? '99+' : c; cb.hidden = (c === 0); }
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
    loadState();           // 게스트=localStorage / 로그인=DB
    decorateCards(); refreshAll();
    // 홈 상품이 비동기로 채워진 뒤 장바구니 추천 영역도 한 번 더 동기화한다.
    setTimeout(renderPage, 700);
    setTimeout(renderPage, 1800);
    // 로그인/로그아웃 시 해당 계정의 찜·장바구니로 전환 (게스트분은 로그인 시 병합)
    if (B && B.onAuthChange) {
      B.onAuthChange(function (user) {
        var now = !!user;
        if (now && !loggedIn) { mergeGuestToDB().then(loadState); }
        else { loadState(); }
        loggedIn = now;
      });
    }
    var deco = null;
    try {
      new MutationObserver(function () {
        clearTimeout(deco); deco = setTimeout(decorateCards, 200);
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {
      [800, 2500, 5000].forEach(function (t) { setTimeout(decorateCards, t); });
    }
  }
  // 외부(마이페이지 등)에서 장바구니/찜 데이터 읽기
  window.BELLOREWishlist = { getCart: getCart, getWish: getWish, refresh: refreshAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
