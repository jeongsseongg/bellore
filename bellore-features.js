/* ============================================================
   벨로르(BELLORE) · 추가 기능 컨트롤러 (Supabase)
   ------------------------------------------------------------
   - 업체 입찰 화면 (승인업체)
   - 인사이트/커뮤니티 + 후기 : DB 기반 CRUD (관리자만 작성/수정/삭제)
   - 판매시계 등록/수정 : 사진 업로드 + 상태 선택 폼(모달)
   - 마이페이지 : 관리자=관리현황 / 고객=내 비교견적
   디자인 톤(로그인 모달/업로드 그리드 클래스)을 재사용합니다.
   ============================================================ */

/* ============================================================
   벨로르 스타일 팝업 — 네이티브 alert/confirm 대체(브라우저 느낌 제거)
   ============================================================ */
(function () {
  'use strict';
  var mask;
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function ensure() {
    if (mask) return mask;
    mask = document.createElement('div');
    mask.className = 'bl-modal-mask'; mask.hidden = true;
    mask.innerHTML =
      '<div class="bl-modal" role="dialog" aria-modal="true">' +
        '<div class="bl-modal-top">' +
          '<img class="bl-modal-logo" src="assets/logo-bellore.png" alt="BELLORE">' +
          '<p class="bl-modal-msg"></p>' +
        '</div>' +
        '<div class="bl-modal-acts"></div>' +
      '</div>';
    document.body.appendChild(mask);
    mask.addEventListener('click', function (e) { if (e.target === mask) hide(); });
    return mask;
  }
  function hide() { if (!mask) return; mask.classList.remove('show'); setTimeout(function () { if (mask) mask.hidden = true; }, 200); }
  function show(msg, buttons) {
    ensure();
    mask.querySelector('.bl-modal-msg').innerHTML = esc(msg).replace(/\n/g, '<br>');
    var acts = mask.querySelector('.bl-modal-acts'); acts.innerHTML = '';
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = b.cls || 'bl-ok'; btn.textContent = b.label;
      btn.addEventListener('click', function () { hide(); if (b.cb) setTimeout(b.cb, 60); });
      acts.appendChild(btn);
    });
    mask.hidden = false;
    requestAnimationFrame(function () { mask.classList.add('show'); });
  }
  window.belloreAlert = function (msg, cb) { show(msg, [{ label: '확인', cls: 'bl-ok', cb: cb }]); };
  window.belloreConfirm = function (msg, onOk, onCancel) {
    show(msg, [{ label: '취소', cls: 'bl-cancel', cb: onCancel }, { label: '확인', cls: 'bl-ok', cb: onOk }]);
  };
  // 커스텀 버튼 팝업 — buttons: [{label, cls, cb}]
  window.belloreModal = function (msg, buttons) { show(msg, buttons || [{ label: '확인', cls: 'bl-ok' }]); };
  // 네이티브 alert를 벨로르 팝업으로 교체(반환값 없는 알림은 안전)
  try { window.alert = function (m) { window.belloreAlert(m); }; } catch (e) {}
})();

(function () {
  'use strict';

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function fmt(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var FALLBACK_IMG = 'assets/og-image.png';
  function errMsg(err) {
    var m = (err && err.message) ? String(err.message) : String(err || '');
    if (/row-level security|permission denied|not_admin/i.test(m))
      return '관리자 권한이 없습니다. 이 계정이 admin으로 지정됐는지(아래 SQL) 확인하세요.';
    return m || '알 수 없는 오류';
  }
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  function openModal(m) { if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; } }
  function closeModal(m) { if (m) { m.hidden = true; document.body.style.overflow = ''; } }

  // 모달 셸 생성 (로그인 모달 스타일 재사용)
  function makeModal(id, eyebrow, title) {
    var m = document.createElement('div');
    m.className = 'login-modal'; m.id = id; m.hidden = true;
    m.innerHTML =
      '<div class="login-backdrop" data-x></div>' +
      '<div class="login-content">' +
      '<button class="login-close" data-x aria-label="닫기">×</button>' +
      '<div class="login-head"><p class="login-eyebrow">' + esc(eyebrow) + '</p><h2>' + esc(title) + '</h2></div>' +
      '<div class="modal-body"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target.closest('[data-x]')) closeModal(m); });
    return m;
  }

  // 간단 사진 선택기 (업로드 그리드 클래스 재사용). files=DataURL 배열 반환
  function photoPicker(container, max, initial) {
    max = max || 10;
    var files = (initial && initial.length) ? initial.slice(0, max) : [];
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = max > 1; input.hidden = true;
    container.appendChild(input);
    var grid = document.createElement('div'); grid.className = 'upload-grid';
    container.appendChild(grid);
    function draw() {
      grid.innerHTML = '';
      files.forEach(function (src, i) {
        var cell = document.createElement('div'); cell.className = 'upload-cell has-img';
        cell.innerHTML = '<img src="' + src + '" alt="" draggable="false">' +
          (i === 0 ? '<span class="cell-cover">대표</span>' : '') +
          '<button type="button" class="remove-btn" data-i="' + i + '">×</button>';
        grid.appendChild(cell);
      });
      if (files.length < max) {
        var add = document.createElement('label'); add.className = 'upload-cell upload-add';
        add.innerHTML = '<span class="plus">+</span><span class="upload-cell-text">사진 추가</span>';
        add.addEventListener('click', function () { input.click(); });
        grid.appendChild(add);
      }
    }
    grid.addEventListener('click', function (e) {
      var mv = e.target.closest('.ord-btn');
      if (mv) {
        e.preventDefault();
        var from = +mv.dataset.mv, to = from + (+mv.dataset.dir);
        if (to < 0 || to >= files.length) return;
        var t = files[from]; files[from] = files[to]; files[to] = t; draw();
        return;
      }
      var b = e.target.closest('.remove-btn'); if (!b) return;
      e.preventDefault(); files.splice(+b.dataset.i, 1); draw();
    });
    /* 드래그로 순서 변경(터치·마우스 공용) — 끌면 사진이 손가락/커서를 그대로 따라오고, 놓는 자리로 이동 */
    var dragFrom = -1, srcCell = null, ghost = null, gx = 0, gy = 0, sx = 0, sy = 0, dragging = false;
    function cellIndex(cell) { return Array.prototype.indexOf.call(grid.children, cell); }
    function clearTargets() { grid.querySelectorAll('.drop-target').forEach(function (c) { c.classList.remove('drop-target'); }); }
    var gpx = 0, gpy = 0, gRaf = 0;
    function paintGhost() { gRaf = 0; if (ghost) ghost.style.transform = 'translate3d(' + (gpx - gx) + 'px,' + (gpy - gy) + 'px,0) scale(1.06) rotate(2deg)'; }
    function moveGhost(x, y) { gpx = x; gpy = y; if (!gRaf) gRaf = requestAnimationFrame(paintGhost); }
    function endDrag() {
      clearTargets();
      if (gRaf) { cancelAnimationFrame(gRaf); gRaf = 0; }
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      if (srcCell) srcCell.classList.remove('reorder-src');
      dragFrom = -1; srcCell = null; dragging = false;
    }
    grid.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.remove-btn') || e.target.closest('.upload-add')) return;
      var cell = e.target.closest('.upload-cell.has-img'); if (!cell) return;
      dragFrom = cellIndex(cell); srcCell = cell; sx = e.clientX; sy = e.clientY; dragging = false;
    });
    window.addEventListener('pointermove', function (e) {
      if (dragFrom < 0) return;
      if (!dragging) {
        if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 6) return;
        dragging = true;
        var r = srcCell.getBoundingClientRect();
        gx = sx - r.left; gy = sy - r.top;
        ghost = srcCell.cloneNode(true);
        ghost.classList.add('reorder-ghost');
        ghost.style.left = '0px';
        ghost.style.top = '0px';
        ghost.style.width = r.width + 'px';
        ghost.style.height = r.height + 'px';
        document.body.appendChild(ghost);
        srcCell.classList.add('reorder-src');
      }
      e.preventDefault();
      moveGhost(e.clientX, e.clientY);
      var over = document.elementFromPoint(e.clientX, e.clientY);
      var oc = over && over.closest('.upload-cell.has-img');
      clearTargets();
      if (oc && oc !== srcCell) oc.classList.add('drop-target');
    });
    window.addEventListener('pointerup', function (e) {
      if (dragFrom < 0) return;
      if (dragging) {
        var over = document.elementFromPoint(e.clientX, e.clientY);
        var oc = over && over.closest('.upload-cell.has-img');
        if (oc && oc !== srcCell) {
          var to = cellIndex(oc);
          var item = files.splice(dragFrom, 1)[0];
          files.splice(to, 0, item); draw();
        }
      }
      endDrag();
    });
    input.addEventListener('change', function () {
      Array.prototype.forEach.call(input.files, function (f) {
        if (files.length >= max) return;
        var r = new FileReader(); r.onload = function (ev) { files.push(ev.target.result); draw(); };
        r.readAsDataURL(f);
      });
      input.value = '';
    });
    draw();
    return { get files() { return files; } };
  }

  ready(function () {
    var B = window.NWBackend;
    if (!B || !B.configured) return;

    var CATS = (window.BELLORE_CATEGORIES || {});
    var insightMap = CATS.insight || {};
    var catToKey = {};
    Object.keys(insightMap).forEach(function (k) { catToKey[insightMap[k]] = k; });
    var listingCats = CATS.listing || { brand: '벨로르판매', user: '고객판매' };

    var lastInfo = { isAdmin: false, isApprovedVendor: false };
    var postsCache = [], reviewsCache = [];

    /* ========== 시계 등록/수정 (전체 페이지 · 상세페이지 스타일) ========== */
    var lPicker = null, lEditId = null, lExisting = [];

    function statusOptions(cur) {
      return [['on_sale', '판매중'], ['sold', '판매완료'], ['hidden', '숨김']].map(function (s) {
        return '<option value="' + s[0] + '"' + (cur === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
      }).join('');
    }
    function tagOn(item, t) { return !!(item && item.tags && item.tags.indexOf(t) !== -1); }
    function compOn(item, t) { return !!(item && item.components && String(item.components).split(',').indexOf(t) !== -1); }
    function condOptions(cur) {
      return ['', '미착용 (신품급)', 'S급 (최상)', 'A급 (상)', 'B급 (중)'].map(function (c) {
        var label = c || '선택 안 함';
        return '<option value="' + esc(c) + '"' + (cur === c ? ' selected' : '') + '>' + label + '</option>';
      }).join('');
    }
    function packOptions(cur) {
      return ['', '풀세트', '보증서없음', '단품'].map(function (c) {
        return '<option value="' + esc(c) + '"' + (cur === c ? ' selected' : '') + '>' + (c || '선택 안 함') + '</option>';
      }).join('');
    }
    // 브랜드 선택 책자(32개) + 모델 추천 — brands.js와 연동
    function brandModels(name) {
      var b = window.BELLORE_BRAND_BY_NAME && window.BELLORE_BRAND_BY_NAME(name);
      return b ? b.models : [];
    }
    function fillModelList(name) {
      var dl = $('#lpModelList', listingPage); if (!dl) return;
      dl.innerHTML = brandModels(name).map(function (m) { return '<option value="' + esc(m) + '">'; }).join('');
    }
    function wireBrandPicker(cur) {
      var btn = $('#lpBrandBtn', listingPage), sheet = $('#lpBrandSheet', listingPage), hidden = $('#lpBrandInput', listingPage);
      if (!btn || !sheet) return;
      var brands = window.BELLORE_BRANDS || [];
      function optHTML(b) {
        return '<button type="button" class="lp-brand-opt' + (b.name === cur ? ' on' : '') + '" data-bn="' + esc(b.name) + '">' +
          '<img src="' + window.BELLORE_BRAND_LOGO(b.slug) + '" alt="" loading="lazy"><span>' + esc(b.name) + '</span></button>';
      }
      sheet.innerHTML =
        '<div class="lp-brand-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>' +
          '<input type="text" id="lpBrandQ" placeholder="브랜드 검색 (예: 롤렉스, rolex)" autocomplete="off"></div>' +
        '<div class="lp-brand-list">' + brands.map(optHTML).join('') + '</div>';
      var listEl = $('.lp-brand-list', sheet), qEl = $('#lpBrandQ', sheet);
      function filter() {
        var q = (qEl.value || '').trim().toLowerCase();
        var hit = brands.filter(function (b) {
          return !q || b.name.toLowerCase().indexOf(q) > -1 || (b.slug || '').toLowerCase().indexOf(q) > -1;
        });
        listEl.innerHTML = hit.length ? hit.map(optHTML).join('') : '<p class="lp-brand-none">검색 결과가 없습니다.</p>';
      }
      fillModelList(cur);
      btn.addEventListener('click', function () {
        sheet.hidden = !sheet.hidden;
        if (!sheet.hidden) { qEl.value = ''; filter(); setTimeout(function () { qEl.focus(); }, 30); }
      });
      qEl.addEventListener('input', filter);
      sheet.addEventListener('click', function (e) {
        var o = e.target.closest('[data-bn]'); if (!o) return;
        var name = o.dataset.bn;
        hidden.value = name; btn.textContent = name; btn.classList.add('on');
        cur = name;
        fillModelList(name); sheet.hidden = true;
      });
    }

    // 상세페이지(.product-page) 셸을 재사용한 전체화면 등록/수정 페이지
    var listingPage = document.createElement('div');
    listingPage.className = 'product-page lp-page';
    listingPage.id = 'listingPage';
    listingPage.hidden = true;
    listingPage.innerHTML =
      '<header class="pp-topbar">' +
        '<button class="pp-back" data-lpclose aria-label="뒤로"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<span class="pp-topbar-title" id="lpTitle">시계 등록</span>' +
        '<span class="pp-topbar-spacer"></span>' +
      '</header>' +
      '<div class="pp-scroll"><div class="lp-body"></div></div>' +
      '<div class="pp-bottom"><button type="submit" form="listingForm" class="pp-buy" id="lpSubmit">등록</button></div>';
    document.body.appendChild(listingPage);
    listingPage.addEventListener('click', function (e) { if (e.target.closest('[data-lpclose]')) closeListingPage(); });
    function closeListingPage() { listingPage.hidden = true; document.body.style.overflow = ''; }

    function openListing(item, presetCat) {
      lEditId = item ? item.id : null;
      lExisting = (item && item.photos) ? item.photos.slice() : [];
      $('#lpTitle', listingPage).textContent = item ? '시계 수정' : '시계 등록';
      $('#lpSubmit', listingPage).textContent = item ? '수정 저장' : '등록';
      $('.lp-body', listingPage).innerHTML =
        '<div class="lp-photohead">' +
          '<h3 class="lp-sec-title">대표 사진</h3>' +
          '<div id="listingPhotos"></div>' +
          '<p class="lp-hint">사진은 첫 번째가 대표 이미지로 노출됩니다. 끌어서 순서를 바꿀 수 있고, ×를 눌러 삭제할 수 있어요. (최대 10장)</p>' +
        '</div>' +
        '<form class="signup-form lp-form" id="listingForm">' +
          '<input type="hidden" name="category" value="' + esc((item && item.category) || presetCat || listingCats.brand) + '">' +
          '<label class="lp-brandpick"><span>브랜드 * (눌러서 선택)</span>' +
            '<button type="button" class="lp-brand-btn' + (item && item.brand ? ' on' : '') + '" id="lpBrandBtn">' + (item && item.brand ? esc(item.brand) : '브랜드 선택') + '</button>' +
            '<input type="hidden" name="brand" id="lpBrandInput" value="' + esc(item ? item.brand : '') + '">' +
            '<div class="lp-brand-sheet" id="lpBrandSheet" hidden></div>' +
          '</label>' +
          '<label><span>모델 / 레퍼런스 *</span><input name="model" id="lpModelInput" list="lpModelList" placeholder="브랜드 선택 시 대표 모델 추천" value="' + esc(item ? item.model : '') + '" required autocomplete="off"><datalist id="lpModelList"></datalist></label>' +
          '<label><span>판매가 (숫자, 비우면 가격문의)</span><input name="price" class="lp-money" type="text" inputmode="numeric" placeholder="예: 22,800,000" value="' + (item && item.price ? fmt(item.price) : '') + '"></label>' +
          '<label><span>할인 판매가 (선택) — 입력 시 정가에 취소선·할인율 표시</span><input name="sale_price" class="lp-money" type="text" inputmode="numeric" placeholder="예: 19,900,000" value="' + (item && item.sale_price ? fmt(item.sale_price) : '') + '"></label>' +
          '<label><span>판매 상태</span><select name="status">' + statusOptions(item ? item.status : 'on_sale') + '</select></label>' +
          '<label><span>컨디션</span><select name="condition">' + condOptions(item ? item.condition : '') + '</select></label>' +
          '<label><span>구성 등급</span><select name="pack">' + packOptions(item ? item.pack : '') + '</select></label>' +
          '<label><span>사이즈 (mm)</span><input name="size_mm" type="number" inputmode="numeric" placeholder="예: 41" value="' + (item && item.size_mm ? item.size_mm : '') + '"></label>' +
          '<label><span>구성품</span><input name="accessories" placeholder="예: 풀세트(보증서·박스·정품택)" value="' + esc(item ? item.accessories : '') + '"></label>' +
          '<label><span>스탬핑 (선택 — 비우면 카드에 “미표기”)</span><input name="stamping" placeholder="예: 2023년 스탬핑 / 스탬핑 있음" value="' + esc(item ? item.stamping : '') + '"></label>' +
          '<label><span>미리수 (선택 — 비우면 카드에 “미표기”)</span><input name="misu" placeholder="예: 미리수 / 정식수입(내수)" value="' + esc(item ? item.misu : '') + '"></label>' +
          '<label><span>판매 방식 (선택 — 비우면 “벨로르 직접 검수 판매”)</span><input name="sale_method" placeholder="예: 벨로르 직접 검수 판매 / 위탁 판매" value="' + esc(item ? item.sale_method : '') + '"></label>' +
          '<label><span>구매년도 (선택)</span><input name="purchase_year" inputmode="numeric" placeholder="예: 2019" value="' + esc(item ? item.purchase_year : '') + '"></label>' +
          '<label><span>특이사항 (선택 — 상세페이지 “제품 상태”에 표시)</span><input name="special_note" placeholder="예: 베젤 미세 스크래치 있음" value="' + esc(item ? item.special_note : '') + '"></label>' +
          '<label><span>상세 설명 (선택 — 상세페이지 “제품 상태”에 표시)</span><textarea name="detail_desc" rows="4" placeholder="제품 상태·구성·착용감 등 자세한 설명을 적어주세요.">' + esc(item ? item.detail_desc : '') + '</textarea></label>' +
          '<div class="lp-tags"><span class="lp-tags-label">구성품 (상세페이지 “구성품”에 체크 표시)</span>' +
            '<label class="lp-tag"><input type="checkbox" name="comp_box"' + (compOn(item, 'box') ? ' checked' : '') + '><span>박스</span></label>' +
            '<label class="lp-tag"><input type="checkbox" name="comp_case"' + (compOn(item, 'case') ? ' checked' : '') + '><span>케이스</span></label>' +
            '<label class="lp-tag"><input type="checkbox" name="comp_card"' + (compOn(item, 'card') ? ' checked' : '') + '><span>개런티카드</span></label>' +
            '<label class="lp-tag"><input type="checkbox" name="has_warranty"' + (item && item.has_warranty ? ' checked' : '') + '><span>보증서</span></label>' +
          '</div>' +
          '<div class="lp-tags"><span class="lp-tags-label">카테고리 노출 (상단 탭에 함께 표시)</span>' +
            '<label class="lp-tag"><input type="checkbox" name="tag_sale"' + ((tagOn(item, 'sale') && (!window.belloreSaleActive || window.belloreSaleActive(item))) ? ' checked' : '') + '><span>TIME SALE (할인 시작 · 72시간 후 자동 해제)</span></label>' +
            '<label class="lp-tag"><input type="checkbox" name="tag_new"' + (tagOn(item, 'new') ? ' checked' : '') + '><span>미사용신품</span></label>' +
            '<label class="lp-tag"><input type="checkbox" name="tag_today"' + (tagOn(item, 'today') ? ' checked' : '') + '><span>오늘의시계</span></label>' +
          '</div>' +
        '</form>';
      lPicker = photoPicker($('#listingPhotos', listingPage), 10, lExisting);
      wireBrandPicker(item ? item.brand : '');
      // 금액 입력: 천 단위 콤마 실시간 표시 (2000000 → 2,000,000)
      Array.prototype.forEach.call(listingPage.querySelectorAll('.lp-money'), function (inp) {
        inp.addEventListener('input', function () {
          var digits = inp.value.replace(/[^0-9]/g, '');
          inp.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
        });
      });
      $('#listingForm', listingPage).addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var brand = String(fd.get('brand') || '').trim();
        var model = String(fd.get('model') || '').trim();
        if (!brand || !model) { alert('브랜드와 모델을 입력하세요.'); return; }
        var price = parseInt(String(fd.get('price') || '').replace(/[^0-9]/g, ''), 10) || null;
        var salePrice = parseInt(String(fd.get('sale_price') || '').replace(/[^0-9]/g, ''), 10) || null;
        if (salePrice && price && salePrice >= price) { alert('할인 판매가는 판매가보다 낮아야 합니다.'); return; }
        var tags = [];
        if (fd.get('tag_sale')) tags.push('sale');
        if (fd.get('tag_new')) tags.push('new');
        if (fd.get('tag_today')) tags.push('today');
        var saleOn = tags.indexOf('sale') !== -1;
        var saleStart = saleOn ? ((item && item.tags && item.tags.indexOf('sale') !== -1 && item.sale_started_at) ? item.sale_started_at : new Date().toISOString()) : null;
        var payload = { brand: brand, model: model, price: price, sale_price: salePrice, category: fd.get('category'), status: fd.get('status'), tags: tags, condition: String(fd.get('condition') || ''), has_warranty: !!fd.get('has_warranty'), accessories: String(fd.get('accessories') || '').trim(), stamping: String(fd.get('stamping') || '').trim(), misu: String(fd.get('misu') || '').trim(), pack: String(fd.get('pack') || ''), size_mm: parseInt(fd.get('size_mm'), 10) || null, purchase_year: String(fd.get('purchase_year') || '').trim(), special_note: String(fd.get('special_note') || '').trim(), detail_desc: String(fd.get('detail_desc') || '').trim(), sale_method: String(fd.get('sale_method') || '').trim(), components: [fd.get('comp_box') ? 'box' : '', fd.get('comp_case') ? 'case' : '', fd.get('comp_card') ? 'card' : ''].filter(Boolean).join(','), sale_started_at: saleStart, photos: lPicker.files };
        var btn = $('#lpSubmit', listingPage); btn.disabled = true; btn.textContent = '저장 중…';
        // 사진 picker가 기존 URL+새 사진을 모두 보유 → existingPhotos는 비우고 picker 결과로 통째 교체(삭제 반영)
        var p = lEditId
          ? B.updateProduct(lEditId, Object.assign({ existingPhotos: [] }, payload))
          : B.addProduct(payload);
        p.then(function () { closeListingPage(); alert('저장되었습니다.'); })
          .catch(function (err) { alert('저장 실패: ' + errMsg(err)); })
          .then(function () { btn.disabled = false; btn.textContent = lEditId ? '수정 저장' : '등록'; });
      });
      listingPage.hidden = false;
      document.body.style.overflow = 'hidden';
      var sc = $('.pp-scroll', listingPage); if (sc) sc.scrollTop = 0;
    }

    // script.js 의 수정 버튼이 호출
    window.belloreEditListing = function (id) {
      B.getListing(id).then(function (item) { openListing(item); })
        .catch(function (err) { alert('불러오기 실패: ' + (err && err.message || err)); });
    };

    // (구) 흩어진 등록 버튼은 제거하고, 우측 상단 "+" 하나로 통합 (하단 adminFab)

    /* ========== 히어로 배너 ========== */
    // 방문자: 활성 배너를 캐러셀에 주입
    if (typeof B.subscribeBanners === 'function') {
      B.subscribeBanners(function (list) {
        try { localStorage.setItem('bellore_banners', JSON.stringify(list || [])); } catch (e) {}
        if (window.belloreSetBanners) window.belloreSetBanners(list);
      });
    }

    // 관리자: 배너 관리 모달
    var bannerModal = makeModal('bannerModal', 'BANNER', '배너 관리');
    var bnBody = $('.modal-body', bannerModal);
    var bnPicker = null, bnEditId = null, bnExistingImg = '';

    function bannerListView() {
      bnEditId = null;
      $('h2', bannerModal).textContent = '배너 관리';
      bnBody.innerHTML = '<div id="bannerList" class="admin-list"><p class="muted small">불러오는 중…</p></div>' +
        '<p class="muted small" style="margin:6px 0 10px">홈 상단에 최대 10개까지 슬라이드로 노출됩니다. 문구(제목·부제목)를 넣으면 메인 배너처럼 보입니다.</p>' +
        '<button type="button" class="login-btn login-default" id="bannerAddNew">＋ 새 배너 추가</button>';
      $('#bannerAddNew', bannerModal).addEventListener('click', function () { bannerEditView(null); });
      B.listAllBanners().then(function (rows) {
        var box = $('#bannerList', bannerModal);
        if (!rows.length) { box.innerHTML = '<p class="muted small">등록된 배너가 없습니다. 아래에서 추가하세요.</p>'; return; }
        box.innerHTML = rows.map(function (b) {
          return '<div class="admin-list-item banner-row">' +
            '<span class="banner-thumb"' + (b.image ? ' style="background-image:url(\'' + esc(b.image) + '\')"' : '') + '></span>' +
            '<span class="banner-meta"><b>' + (esc(b.title) || '(제목 없음)') + '</b>' +
            '<small>' + (b.active ? '노출중' : '숨김') + ' · 순서 ' + b.sort_order + '</small></span>' +
            '<span class="banner-acts"><button type="button" data-bnedit="' + esc(b.id) + '">수정</button>' +
            '<button type="button" data-bndel="' + esc(b.id) + '">삭제</button></span></div>';
        }).join('');
      }).catch(function (err) {
        $('#bannerList', bannerModal).innerHTML = '<p class="muted small">불러오기 실패: ' + esc(errMsg(err)) + '<br>(banners 테이블이 생성됐는지 확인하세요)</p>';
      });
    }

    function bannerEditView(item) {
      bnEditId = item ? item.id : null;
      bnExistingImg = item ? (item.image || '') : '';
      $('h2', bannerModal).textContent = item ? '배너 수정' : '새 배너 추가';
      bnBody.innerHTML =
        '<form class="signup-form" id="bannerForm">' +
        '<label><span>제목</span><input name="title" value="' + esc(item ? item.title : '') + '" placeholder="예: 여름 한정 특별전"></label>' +
        '<label><span>부제목</span><input name="subtitle" value="' + esc(item ? item.subtitle : '') + '" placeholder="예: 소장가치 100% 라인업"></label>' +
        '<label><span>클릭 시 이동(선택)</span><input name="link" value="' + esc(item ? item.link : '') + '" placeholder="예: #compare 또는 https://..."></label>' +
        '<label><span>노출 순서(숫자, 작을수록 먼저)</span><input name="sort_order" type="number" value="' + (item ? item.sort_order : 0) + '"></label>' +
        '<label class="banner-active-row"><input type="checkbox" name="active"' + (!item || item.active ? ' checked' : '') + '> <span>홈에 노출</span></label>' +
        '<label><span>배너 이미지 ' + (item ? '(바꿀 때만 새로 선택)' : '*') + '</span></label><div id="bannerPhoto"></div>' +
        (bnExistingImg ? '<p class="muted small">기존 이미지 유지 · 새로 선택하면 교체됩니다.</p>' : '') +
        '<button type="submit" class="login-btn login-default">' + (item ? '수정 저장' : '등록') + '</button>' +
        '<button type="button" class="login-btn" id="bannerBack" style="background:#eee;color:#444;margin-top:8px">목록으로</button>' +
        '</form>';
      bnPicker = photoPicker($('#bannerPhoto', bannerModal), 1);
      $('#bannerBack', bannerModal).addEventListener('click', bannerListView);
      $('#bannerForm', bannerModal).addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var payload = {
          title: String(fd.get('title') || '').trim(),
          subtitle: String(fd.get('subtitle') || '').trim(),
          link: String(fd.get('link') || '').trim(),
          sort_order: parseInt(fd.get('sort_order'), 10) || 0,
          active: !!fd.get('active'),
          photos: bnPicker.files
        };
        if (!bnEditId && !bnPicker.files.length) { alert('배너 이미지를 선택하세요.'); return; }
        var btn = $('button[type="submit"]', e.target); btn.disabled = true; btn.textContent = '저장 중…';
        var p = bnEditId
          ? B.updateBanner(bnEditId, Object.assign({ image: bnExistingImg }, payload))
          : B.addBanner(payload);
        p.then(function () { alert('저장되었습니다.'); bannerListView(); })
          .catch(function (err) { alert('저장 실패: ' + errMsg(err)); btn.disabled = false; btn.textContent = bnEditId ? '수정 저장' : '등록'; });
      });
    }

    bannerModal.addEventListener('click', function (e) {
      var ed = e.target.closest('[data-bnedit]');
      var dl = e.target.closest('[data-bndel]');
      if (ed) {
        B.listAllBanners().then(function (rows) {
          var it = rows.filter(function (x) { return String(x.id) === ed.dataset.bnedit; })[0];
          if (it) bannerEditView(it);
        });
      } else if (dl) {
        if (!confirm('이 배너를 삭제할까요?')) return;
        B.deleteBanner(dl.dataset.bndel).then(bannerListView)
          .catch(function (err) { alert('삭제 실패: ' + errMsg(err)); });
      }
    });

    var heroManageBtn = $('#heroManageBtn');
    if (heroManageBtn) {
      heroManageBtn.addEventListener('click', function () { bannerListView(); openModal(bannerModal); });
    }

    /* ========== 인사이트/후기 작성·수정 모달 ========== */
    var postModalEl = makeModal('insightEditModal', 'EDITOR', '글 작성');
    var pBody = $('.modal-body', postModalEl);
    var pPicker = null, pEdit = null;

    function openEditor(kind, item) {
      // kind: 'post' | 'review'
      pEdit = item ? { kind: kind, id: item.id } : null;
      $('h2', postModalEl).textContent = (item ? '수정' : '작성') + ' · ' + (kind === 'review' ? '매입 후기' : '인사이트 글');
      var html = '<form class="signup-form" id="insightForm">';
      if (kind === 'post') {
        html += '<label><span>카테고리</span><select name="category">' +
          Object.keys(insightMap).map(function (k) {
            var v = insightMap[k];
            return '<option' + (item && item.category === v ? ' selected' : '') + '>' + esc(v) + '</option>';
          }).join('') + '</select></label>';
      } else {
        html += '<label><span>작성자명</span><input name="author" value="' + esc(item ? item.author_name : '') + '" placeholder="예: 김OO"></label>' +
          '<label><span>별점</span><select name="rating">' +
          [5, 4, 3, 2, 1].map(function (n) { return '<option value="' + n + '"' + (item && item.rating === n ? ' selected' : '') + '>' + n + '점</option>'; }).join('') +
          '</select></label>';
      }
      var existImgs = item ? ((item.image_urls && item.image_urls.length) ? item.image_urls : (item.image_url ? [item.image_url] : [])) : [];
      html += '<label><span>제목 *</span><input name="title" value="' + esc(item ? item.title : '') + '" required></label>' +
        '<label><span>내용</span><textarea name="body" rows="6">' + esc(item ? (item.body || '') : '') + '</textarea></label>' +
        '<label><span>사진 (선택 · 최대 5장)</span></label><div id="insightPhotos"></div>' +
        (existImgs.length ? '<p class="muted small">기존 사진 ' + existImgs.length + '장 유지 · 새 사진은 뒤에 추가됩니다.</p>' : '') +
        '<button type="submit" class="login-btn login-default">' + (item ? '수정 저장' : '등록') + '</button></form>';
      pBody.innerHTML = html;
      pPicker = photoPicker($('#insightPhotos', postModalEl), 5);
      openModal(postModalEl);
      $('#insightForm', postModalEl).addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var title = String(fd.get('title') || '').trim();
        if (!title) { alert('제목을 입력하세요.'); return; }
        var body = String(fd.get('body') || '').trim();
        var btn = $('button[type="submit"]', e.target); btn.disabled = true; btn.textContent = '저장 중…';
        var p;
        if (kind === 'post') {
          var data = { title: title, body: body, category: fd.get('category'), photos: pPicker.files };
          if (item) data.existingPhotos = existImgs;
          p = item ? B.updatePost(item.id, data) : B.addPost(data);
        } else {
          var rd = { title: title, body: body, author_name: fd.get('author') || '익명', rating: parseInt(fd.get('rating'), 10) || 5, photos: pPicker.files };
          if (item) rd.existingPhotos = (item.image_urls || []);
          p = item ? B.updateReview(item.id, rd) : B.addReview(rd);
        }
        p.then(function () { closeModal(postModalEl); alert('저장되었습니다.'); })
          .catch(function (err) { alert('저장 실패: ' + errMsg(err)); })
          .then(function () { btn.disabled = false; });
      });
    }

    /* ========== 인사이트 렌더 (DB 기반) ========== */
    var insightList = $('#insightList');
    var dynHolder = null;
    function ensureHolder() {
      if (!insightList) return null;
      if (!dynHolder || !dynHolder.isConnected) {
        dynHolder = document.createElement('div');
        dynHolder.id = 'belloreInsightDynamic';
        dynHolder.style.display = 'contents';
        insightList.insertBefore(dynHolder, insightList.firstChild);
      }
      return dynHolder;
    }
    function ymd(iso) { try { return new Date(iso).toLocaleDateString('ko-KR'); } catch (e) { return ''; } }
    function starStr(r) { r = Math.max(0, Math.min(5, r || 0)); return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r); }

    function buildRow(opt) {
      var art = document.createElement('article');
      art.className = 'insight-row';
      art.setAttribute('data-cat', opt.key);
      art.dataset.body = opt.body || '';
      var pencil = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
      var trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>';
      var actions = lastInfo.isAdmin
        ? '<div class="row-actions">' +
          '<button type="button" class="row-act" data-edit="' + opt.editKey + '" aria-label="수정" title="수정">' + pencil + '</button>' +
          '<button type="button" class="row-act" data-del="' + opt.delKey + '" aria-label="삭제" title="삭제">' + trash + '</button></div>'
        : '';
      art.innerHTML =
        '<div class="insight-row-img"><img src="' + esc(opt.img || FALLBACK_IMG) + '" alt="" loading="lazy"></div>' +
        '<div class="insight-row-body">' +
        '<span class="tag-mini">' + esc(opt.label) + '</span>' +
        '<h3>' + esc(opt.title) + '</h3>' +
        '<p>' + esc((opt.body || '').split('\n')[0]) + '</p>' +
        '<div class="insight-meta">' + opt.meta + '</div>' +
        actions + '</div>';
      return art;
    }

    function renderInsight() {
      var holder = ensureHolder();
      if (!holder) return;
      holder.innerHTML = '';
      postsCache.forEach(function (p) {
        holder.appendChild(buildRow({
          key: catToKey[p.category] || 'guide', label: p.category || '커뮤니티',
          title: p.title, body: p.body || '', img: (p.image_urls && p.image_urls[0]) || p.image_url,
          meta: '<span>' + ymd(p.created_at) + '</span>',
          editKey: 'post:' + p.id, delKey: 'post:' + p.id
        }));
      });
      reviewsCache.forEach(function (r) {
        holder.appendChild(buildRow({
          key: 'review', label: '매입 후기', title: r.title, body: r.body || '',
          img: (r.image_urls && r.image_urls[0]) || '',
          meta: '<span>' + starStr(r.rating) + '</span><span>·</span><span>' + ymd(r.created_at) + (r.author_name ? ' · ' + esc(r.author_name) : '') + '</span>',
          editKey: 'review:' + r.id, delKey: 'review:' + r.id
        }));
      });
      // DB 콘텐츠가 있으면 정적 샘플 글을 제거해 중복/혼선 방지
      var hasDb = (postsCache.length + reviewsCache.length) > 0;
      if (hasDb) $$('.insight-static').forEach(function (n) { n.remove(); });
      // 현재 활성 탭 필터 재적용
      var active = $('.insight-tab.active');
      if (active && active.dataset.cat && active.dataset.cat !== 'all' && active.dataset.cat !== 'partner') {
        var cat = active.dataset.cat;
        $$('.insight-row[data-cat]').forEach(function (row) {
          row.style.display = (row.dataset.cat === cat) ? '' : 'none';
        });
      }
    }

    /* ========== 관리자 인라인 추가 버튼 (판매시계 / 커뮤니티 칸에 녹임) ========== */
    // 플로팅 "+" 대신 각 섹션 탭 아래에 현재 탭에 맞춰 작성 페이지를 여는 버튼을 둔다.
    var colAddBtn = null, postAddBtn = null;

    function makeAddBtn(label) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'admin-add-inline'; b.hidden = true;
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg><span>' + label + '</span>';
      return b;
    }

    // 판매시계 등록 — 마이페이지(관리자 전용) 버튼에서 작성 폼 열기
    colAddBtn = document.getElementById('adminAddListingBtn');
    if (colAddBtn) {
      colAddBtn.addEventListener('click', function () {
        openListing(null, listingCats.brand);
      });
    }

    // 커뮤니티 — 카테고리 탭 아래. '매입 후기' 탭이면 후기, 그 외엔 글 작성
    var insTabs = document.querySelector('#insight .insight-tabs-bar');
    if (insTabs) {
      postAddBtn = makeAddBtn('글 작성');
      insTabs.parentNode.insertBefore(postAddBtn, insTabs.nextSibling);
      postAddBtn.addEventListener('click', function () {
        var at = document.querySelector('#insight .insight-tab.active');
        openEditor(at && at.dataset.cat === 'review' ? 'review' : 'post', null);
      });
    }

    // 수정/삭제 (관리자) — 인사이트 행
    document.addEventListener('click', function (e) {
      var ed = e.target.closest('[data-edit]');
      var dl = e.target.closest('[data-del]');
      if (ed && /^(post|review):/.test(ed.dataset.edit)) {
        e.preventDefault(); e.stopImmediatePropagation();
        var pe = ed.dataset.edit.split(':'); var kind = pe[0], id = pe[1];
        var item = (kind === 'post' ? postsCache : reviewsCache).filter(function (x) { return String(x.id) === id; })[0];
        if (item) openEditor(kind, item);
      } else if (dl && /^(post|review):/.test(dl.dataset.del)) {
        e.preventDefault(); e.stopImmediatePropagation();
        var pd = dl.dataset.del.split(':'); var k2 = pd[0], id2 = pd[1];
        if (!confirm('삭제하시겠어요?')) return;
        (k2 === 'post' ? B.deletePost(id2) : B.deleteReview(id2))
          .catch(function (err) { alert('삭제 실패: ' + (err && err.message || err)); });
      }
    });

    /* ========== 업체 입찰 화면 ========== */
    var vendorSection = $('#vendorQuotesSection');
    var vendorBox = $('#vendorQuotes');
    var unsubOpen = null;
    function renderVendorQuotes(rows) {
      if (!vendorBox) return;
      var me = B.currentUser();
      if (!rows.length) { vendorBox.innerHTML = '<div class="empty-items"><p>현재 입찰 가능한 비교견적이 없습니다.</p></div>'; return; }
      vendorBox.innerHTML = rows.map(function (q) {
        var mine = null;
        (q.bids || []).forEach(function (b) { if (me && b.vendor_id === me.uid) mine = b; });
        var img = (q.photos && q.photos[0]) ? q.photos[0] : FALLBACK_IMG;
        var ui = mine
          ? '<p class="my-item-bid">내 입찰가 ' + fmt(mine.amount) + '원' + (mine.message ? ' · ' + esc(mine.message) : '') + '</p>'
          : '<div class="vendor-bid-form">' +
            '<input type="number" class="vbid-amount" placeholder="입찰 금액(원)" data-q="' + esc(q.id) + '">' +
            '<input type="text" class="vbid-msg" placeholder="메시지(선택)" data-q="' + esc(q.id) + '">' +
            '<button type="button" class="admin-bid-btn vbid-go" data-q="' + esc(q.id) + '">입찰하기</button></div>';
        return '<div class="admin-pending-item"><div class="admin-pending-img"><img src="' + esc(img) + '" alt=""></div>' +
          '<div class="admin-pending-info"><strong>' + esc(q.brand || '') + '</strong><p>' + esc(q.model || '') + '</p>' +
          '<small>입찰 ' + (q.bids ? q.bids.length : 0) + '건' + (q.bidAmount ? ' · 최고 ' + fmt(q.bidAmount) + '원' : '') + '</small>' + ui + '</div></div>';
      }).join('');
    }
    function updateVendorView(info) {
      var show = !!(info && info.isApprovedVendor);
      if (vendorSection) vendorSection.hidden = !show;
      if (show && !unsubOpen) unsubOpen = B.subscribeOpenQuotes(renderVendorQuotes);
      else if (!show && unsubOpen) { unsubOpen(); unsubOpen = null; }
    }
    if (vendorBox) {
      vendorBox.addEventListener('click', function (e) {
        var go = e.target.closest('.vbid-go'); if (!go) return;
        var id = go.dataset.q;
        var amtEl = $('.vbid-amount[data-q="' + id + '"]', vendorBox);
        var msgEl = $('.vbid-msg[data-q="' + id + '"]', vendorBox);
        var amount = parseInt(String(amtEl ? amtEl.value : '').replace(/[^0-9]/g, ''), 10) || 0;
        if (!amount) { alert('입찰 금액을 입력하세요.'); return; }
        go.disabled = true;
        B.placeBid({ id: id }, amount, msgEl ? msgEl.value.trim() : '')
          .then(function () { alert(fmt(amount) + '원으로 입찰했습니다.'); })
          .catch(function (err) { alert('입찰 실패: ' + (err && err.message || err)); })
          .then(function () { go.disabled = false; });
      });
    }

    /* ========== 마이페이지: 관리자 현황 / 고객 비교견적 ========== */
    var myItemsSection = $('#myItemsSection');
    function renderAdminSummary() {
      var box = $('#adminSummary'); if (!box) return;
      B.adminSummary().then(function (s) {
        box.innerHTML =
          '<div class="summary-grid">' +
          '<div class="summary-cell"><b>' + s.pending + '</b><span>승인 대기 견적</span></div>' +
          '<div class="summary-cell"><b>' + s.open + '</b><span>입찰 진행중</span></div>' +
          '<div class="summary-cell"><b>' + s.listings + '</b><span>판매 시계</span></div>' +
          '<div class="summary-cell"><b>' + s.posts + '</b><span>인사이트 글</span></div>' +
          '<div class="summary-cell"><b>' + s.reviews + '</b><span>후기</span></div>' +
          '<div class="summary-cell"><b>' + s.vendorsPending + '</b><span>승인 대기 업체</span></div>' +
          '</div>' +
          '<p class="muted small">비교견적 페이지에서 승인 대기 견적을, 인사이트에서 글/후기를 관리하세요.</p>';
      });
    }
    function roleLabel(info) {
      if (!info) return '';
      if (info.isAdmin) return '관리자';
      if (info.role === 'vendor') return '업체회원 · ' + (info.approved ? '승인됨' : '승인 대기');
      return '일반회원';
    }
    function applyMyPageRole(info) {
      var admin = !!(info && info.isAdmin);
      if (myItemsSection) myItemsSection.hidden = admin;       // 관리자는 '내 비교견적' 숨김
      // 마이포켓: 모든 로그인 사용자(관리자 포함)에게 표시
      var roleEl = $('#myPageRole');
      var user = B.currentUser();
      if (roleEl) {
        if (user) { roleEl.hidden = false; roleEl.textContent = '계정 유형: ' + roleLabel(info); }
        else { roleEl.hidden = true; }
      }
      if (admin) { renderAdminSummary(); renderAccounts(); }
    }

    // 관리자: 회원 계정 목록 (이메일/역할/가입일 + 비밀번호 재설정)
    var accountsBound = false;
    function renderAccounts() {
      var box = $('#adminAccounts'); if (!box) return;
      if (!accountsBound) {
        accountsBound = true;
        B.subscribeAccounts(function (rows) {
          if (!rows.length) { box.innerHTML = '<div class="admin-list-item"><span>회원이 없습니다.</span></div>'; return; }
          box.innerHTML = rows.map(function (p) {
            var name = esc(p.company_name || p.display_name || '(이름 없음)');
            var role = p.role === 'admin' ? '관리자' : (p.role === 'vendor' ? ('업체' + (p.approved ? '·승인' : '·대기')) : '일반');
            var email = p.email ? esc(p.email) : '(이메일 표시하려면 account_admin.sql 실행)';
            var reset = p.email ? '<button type="button" data-resetpw="' + esc(p.email) + '">재설정 메일</button>' : '';
            return '<div class="admin-list-item"><span><b>' + name + '</b> · ' + role + '<br><small>' + email + '</small></span>' + reset + '</div>';
          }).join('');
        });
      }
    }
    // 비밀번호 재설정 메일 (관리자 목록 / 로그인 화면 공용)
    document.addEventListener('click', function (e) {
      var rb = e.target.closest('[data-resetpw]');
      if (!rb) return;
      var email = rb.dataset.resetpw;
      if (!confirm(email + ' 주소로 비밀번호 재설정 메일을 보낼까요?')) return;
      B.resetPassword(email)
        .then(function () { alert('재설정 메일을 보냈습니다. 받은편지함을 확인하도록 안내하세요.'); })
        .catch(function (err) { alert('발송 실패: ' + (err && err.message || err)); });
    });
    // 로그인 화면: 아이디/비밀번호 찾기
    var findPw = $('#findPw');
    if (findPw) findPw.addEventListener('click', function () {
      alert('아이디는 가입 시 사용한 이메일 주소입니다.\n비밀번호는 재설정 메일로 변경할 수 있어요.');
      var email = prompt('가입한 이메일을 입력하면 비밀번호 재설정 메일을 보내드립니다.');
      if (!email || email.indexOf('@') === -1) return;
      B.resetPassword(email)
        .then(function () { alert('재설정 메일을 보냈습니다. 받은편지함을 확인해주세요.'); })
        .catch(function (err) { alert('발송 실패: ' + (err && err.message || err)); });
    });
    // 마이페이지 모달이 열릴 때 현황 새로고침
    var myModal = $('#myPageModal');
    if (myModal) {
      new MutationObserver(function () {
        if (!myModal.hidden && lastInfo.isAdmin) renderAdminSummary();
      }).observe(myModal, { attributes: true, attributeFilter: ['hidden'] });
    }

    /* ===== 사이트 콘텐츠 인앱 편집 (관리자: 매입 랜딩 · 벨로르 소개) ===== */
    var cmsCache = {};
    var cmsModal = null;
    function cmsAfterPaint(key) {
      if (key === 'about_intro') {
        var sec = $('#aboutIntroSection');
        if (sec) sec.hidden = !(cmsCache[key] || lastInfo.isAdmin);
      }
    }
    function cmsRenderBlock(el) {
      var key = el.getAttribute('data-cms');
      var data = cmsCache[key] || null;
      var fbTitle = el.getAttribute('data-cms-fallback-title') || '';
      var fbBody = el.getAttribute('data-cms-fallback-body') || '';
      var fbMode = el.getAttribute('data-cms-fallback-mode'); // 'images' → 이미지 있을 때만 폴백 숨김
      var images = (data && data.images) || [];
      var hasData = !!(data && (data.title || data.subtitle || data.body || images.length));
      // 폴백(준비중) 노출 기준: images 모드면 '이미지 없을 때만', 아니면 '데이터 전혀 없을 때'
      var showFallback = (fbMode === 'images') ? (images.length === 0) : !hasData;
      var html = '';
      if (showFallback) {
        if (fbTitle) html += '<h2 class="section-title center">' + esc(fbTitle) + '</h2>';
        if (fbBody) html += '<p class="lead center">' + esc(fbBody) + '</p>';
      } else {
        if (data.subtitle) html += '<p class="eyebrow center">' + esc(data.subtitle) + '</p>';
        if (data.title) html += '<h2 class="section-title center">' + esc(data.title) + '</h2>';
        if (data.body) html += '<div class="cms-body">' + data.body.split(/\n{2,}/).map(function (p) {
          return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>';
        }).join('') + '</div>';
        if (images.length) html += '<div class="cms-imgs">' + images.map(function (u) {
          return '<img src="' + esc(u) + '" alt="" loading="lazy">';
        }).join('') + '</div>';
      }
      if (lastInfo.isAdmin) {
        html += '<div class="cms-admin"><button type="button" class="cms-edit-btn" data-cms-edit="' + esc(key) + '">' +
          (hasData ? '✎ 내용 수정' : '＋ 내용 추가') + '</button></div>';
      }
      el.innerHTML = html;
      cmsAfterPaint(key);
    }
    function renderCmsBlocks() {
      var blocks = document.querySelectorAll('[data-cms]');
      Array.prototype.forEach.call(blocks, function (el) {
        var key = el.getAttribute('data-cms');
        if (cmsCache[key] !== undefined) { cmsRenderBlock(el); return; }
        B.getSiteContent(key)
          .then(function (d) { cmsCache[key] = d; cmsRenderBlock(el); })
          .catch(function () { cmsCache[key] = null; cmsRenderBlock(el); });
      });
    }
    function openCmsEditor(key) {
      var el = $('[data-cms="' + key + '"]');
      var label = (el && el.getAttribute('data-cms-label')) || '콘텐츠';
      var d = cmsCache[key] || {};
      if (!cmsModal) cmsModal = makeModal('cmsEditorModal', 'CONTENT', '콘텐츠 편집');
      cmsModal.querySelector('.login-head h2').textContent = label + ' 편집';
      var box = cmsModal.querySelector('.modal-body');
      var imgs = ((d.images || []).slice());
      box.innerHTML =
        '<form class="cms-form" id="cmsForm">' +
          '<label class="cms-field"><span>제목</span><input name="title" value="' + esc(d.title || '') + '" placeholder="예: 벨로르 매입 절차 안내"></label>' +
          '<label class="cms-field"><span>소제목 (선택)</span><input name="subtitle" value="' + esc(d.subtitle || '') + '" placeholder="예: HOW IT WORKS"></label>' +
          '<label class="cms-field"><span>본문 (빈 줄로 문단 구분)</span><textarea name="body" rows="9" placeholder="내용을 입력하세요">' + esc(d.body || '') + '</textarea></label>' +
          '<div class="cms-field"><span>이미지</span><div class="cms-img-list" id="cmsImgList"></div>' +
            '<label class="cms-img-add">＋ 이미지 추가<input type="file" accept="image/*" multiple hidden id="cmsImgInput"></label></div>' +
          '<button type="submit" class="cms-save">저장</button>' +
        '</form>';
      function renderImgs() {
        var list = box.querySelector('#cmsImgList');
        list.innerHTML = imgs.map(function (u, i) {
          return '<span class="cms-img-thumb"><img src="' + esc(u) + '" alt=""><button type="button" data-rm="' + i + '" aria-label="삭제">×</button></span>';
        }).join('');
      }
      renderImgs();
      box.querySelector('#cmsImgInput').addEventListener('change', function (e) {
        var files = Array.prototype.slice.call(e.target.files || []);
        if (!files.length) return;
        var done = 0;
        files.forEach(function (f) {
          var r = new FileReader();
          r.onload = function () { imgs.push(r.result); done++; if (done === files.length) renderImgs(); };
          r.readAsDataURL(f);
        });
        e.target.value = '';
      });
      box.querySelector('#cmsImgList').addEventListener('click', function (e) {
        var b = e.target.closest('[data-rm]');
        if (b) { imgs.splice(parseInt(b.getAttribute('data-rm'), 10), 1); renderImgs(); }
      });
      box.querySelector('#cmsForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var btn = e.target.querySelector('.cms-save');
        btn.disabled = true; btn.textContent = '저장 중…';
        B.saveSiteContent(key, { title: fd.get('title'), subtitle: fd.get('subtitle'), body: fd.get('body'), images: imgs })
          .then(function (row) {
            cmsCache[key] = row;
            var el2 = $('[data-cms="' + key + '"]'); if (el2) cmsRenderBlock(el2);
            closeModal(cmsModal);
            belloreAlert('저장되었습니다.');
          })
          .catch(function (err) {
            btn.disabled = false; btn.textContent = '저장';
            belloreAlert('저장 실패: ' + (err && err.message || err));
          });
      });
      openModal(cmsModal);
    }
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cms-edit]');
      if (b) { e.preventDefault(); openCmsEditor(b.getAttribute('data-cms-edit')); }
    });

    /* ===== 휴대폰 인증 (SMS OTP) ===== */
    var phoneModal = null;
    function notConfiguredMsg(err) {
      var m = (err && err.message) || String(err || '');
      if (/NOT_CONFIGURED|provider|disabled|not enabled|SMS|phone_provider/i.test(m)) {
        return '문자 인증이 아직 활성화되지 않았습니다.\n(관리자: Supabase에서 전화 인증 + SMS 제공자 설정 필요)';
      }
      return m;
    }
    window.belloreVerifyPhone = function (opts) {
      opts = opts || {};
      if (!phoneModal) phoneModal = makeModal('phoneVerifyModal', 'VERIFY', '휴대폰 인증');
      var box = phoneModal.querySelector('.modal-body');
      var prefill = opts.phone || (lastInfo && lastInfo.phone) || '';
      box.innerHTML =
        '<p class="vf-desc">본인 확인을 위해 휴대폰 인증이 필요합니다.</p>' +
        '<div class="vf-field"><span>휴대폰 번호</span>' +
          '<div class="vf-row"><input type="tel" id="vfPhone" placeholder="010-0000-0000" value="' + esc(prefill) + '">' +
          '<button type="button" class="vf-send" id="vfSend">인증번호 받기</button></div></div>' +
        '<div class="vf-field" id="vfCodeWrap" hidden><span>인증번호</span>' +
          '<div class="vf-row"><input type="tel" id="vfCode" inputmode="numeric" placeholder="6자리 숫자">' +
          '<button type="button" class="vf-confirm" id="vfConfirm">확인</button></div></div>' +
        '<p class="vf-msg" id="vfMsg"></p>';
      var msg = box.querySelector('#vfMsg');
      function setMsg(t, ok) { msg.textContent = t || ''; msg.className = 'vf-msg' + (ok ? ' ok' : t ? ' err' : ''); }
      box.querySelector('#vfSend').addEventListener('click', function () {
        var ph = box.querySelector('#vfPhone').value.trim();
        if (!ph) { setMsg('휴대폰 번호를 입력하세요.'); return; }
        var btn = this; btn.disabled = true; btn.textContent = '발송 중…';
        B.sendPhoneOtp(ph)
          .then(function () { box.querySelector('#vfCodeWrap').hidden = false; setMsg('인증번호를 발송했습니다. 문자를 확인하세요.', true); btn.disabled = false; btn.textContent = '재발송'; })
          .catch(function (err) { btn.disabled = false; btn.textContent = '인증번호 받기'; setMsg(notConfiguredMsg(err)); });
      });
      box.querySelector('#vfConfirm').addEventListener('click', function () {
        var ph = box.querySelector('#vfPhone').value.trim();
        var code = box.querySelector('#vfCode').value.trim();
        if (!code) { setMsg('인증번호를 입력하세요.'); return; }
        var btn = this; btn.disabled = true; btn.textContent = '확인 중…';
        B.verifyPhoneOtp(ph, code)
          .then(function () {
            setMsg('인증이 완료되었습니다.', true);
            setTimeout(function () { closeModal(phoneModal); if (opts.onDone) opts.onDone(); }, 700);
          })
          .catch(function (err) { btn.disabled = false; btn.textContent = '확인'; setMsg(notConfiguredMsg(err) || '인증번호가 올바르지 않습니다.'); });
      });
      openModal(phoneModal);
    };

    /* ===== 업체 계좌 인증 ===== */
    var acctModal = null;
    window.belloreVendorAccount = function (opts) {
      opts = opts || {};
      if (!acctModal) acctModal = makeModal('vendorAccountModal', 'VERIFY', '업체 계좌 인증');
      var box = acctModal.querySelector('.modal-body');
      var bankbook = null;
      box.innerHTML =
        '<p class="vf-desc">정산을 위한 사업자 계좌 인증입니다. 통장 사본을 올리면 관리자 확인 후 승인됩니다.</p>' +
        '<form id="acctForm" class="cms-form">' +
          '<label class="cms-field"><span>예금주</span><input name="holder" required placeholder="예금주명"></label>' +
          '<label class="cms-field"><span>은행</span><input name="bank" required placeholder="예: 국민은행"></label>' +
          '<label class="cms-field"><span>계좌번호</span><input name="account" required inputmode="numeric" placeholder="- 없이 숫자만"></label>' +
          '<div class="cms-field"><span>통장 사본</span><div class="cms-img-list" id="acctImg"></div>' +
            '<label class="cms-img-add">＋ 통장사본 업로드<input type="file" accept="image/*" hidden id="acctImgInput"></label></div>' +
          '<p class="vf-msg" id="acctMsg"></p>' +
          '<button type="submit" class="cms-save">인증 제출</button>' +
        '</form>';
      function renderBB() {
        var l = box.querySelector('#acctImg');
        l.innerHTML = bankbook ? '<span class="cms-img-thumb"><img src="' + esc(bankbook) + '" alt=""><button type="button" id="acctRm" aria-label="삭제">×</button></span>' : '';
      }
      box.querySelector('#acctImgInput').addEventListener('change', function (e) {
        var f = (e.target.files || [])[0]; if (!f) return;
        var r = new FileReader(); r.onload = function () { bankbook = r.result; renderBB(); }; r.readAsDataURL(f);
      });
      box.querySelector('#acctImg').addEventListener('click', function (e) { if (e.target.closest('#acctRm')) { bankbook = null; renderBB(); } });
      box.querySelector('#acctForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var am = box.querySelector('#acctMsg');
        var btn = e.target.querySelector('.cms-save'); btn.disabled = true; btn.textContent = '제출 중…';
        B.submitVendorAccount({ holder: fd.get('holder'), bank: fd.get('bank'), account: fd.get('account'), bankbook: bankbook })
          .then(function () { closeModal(acctModal); belloreAlert('계좌 인증을 제출했습니다.\n관리자 승인 후 입찰 기능을 이용할 수 있습니다.'); if (opts.onDone) opts.onDone(); })
          .catch(function (err) { btn.disabled = false; btn.textContent = '인증 제출'; am.textContent = '제출 실패: ' + ((err && err.message) || err); am.className = 'vf-msg err'; });
      });
      openModal(acctModal);
    };

    // 로그인/가입 후 인증 안내 (소셜 포함). 세션당 한 번만 띄움.
    var _verifyPrompted = false;
    window.belloreMaybePromptVerify = function (info) {
      info = info || lastInfo || {};
      if (!B || !B.configured) return;            // 데모 모드면 생략
      if (!B.currentUser || !B.currentUser()) return;
      if (info.isAdmin) return;
      if (_verifyPrompted) return;
      if (!info.phoneVerified) {
        _verifyPrompted = true;
        window.belloreVerifyPhone({ onDone: function () {
          if (info.role === 'vendor' && !info.accountSubmitted) window.belloreVendorAccount({});
        } });
      } else if (info.role === 'vendor' && !info.accountSubmitted) {
        _verifyPrompted = true;
        window.belloreVendorAccount({});
      }
    };

    /* ========== 시작 ========== */
    if (insightList) {
      B.subscribePosts(function (rows) { postsCache = rows; renderInsight(); });
      B.subscribeReviews(function (rows) { reviewsCache = rows; renderInsight(); });
    }
    renderCmsBlocks();
    B.onAuthChange(function (user, info) {
      lastInfo = info || { isAdmin: false, isApprovedVendor: false };
      var showAdd = !!lastInfo.isAdmin;        // 등록 버튼은 관리자만
      if (colAddBtn) colAddBtn.hidden = !showAdd;
      if (postAddBtn) postAddBtn.hidden = !showAdd;
      var hmBtn = $('#heroManageBtn');
      if (hmBtn) hmBtn.hidden = !showAdd;
      updateVendorView(info);
      applyMyPageRole(info);
      renderInsight();
      renderCmsBlocks();
      if (user) window.belloreMaybePromptVerify(lastInfo);
    });
  });
})();
