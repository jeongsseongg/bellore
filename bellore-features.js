/* ============================================================
   벨로르(BELLORE) · 추가 기능 컨트롤러 (Supabase)
   ------------------------------------------------------------
   - 업체 입찰 화면 (승인업체)
   - 인사이트/커뮤니티 + 후기 : DB 기반 CRUD (관리자만 작성/수정/삭제)
   - 판매시계 등록/수정 : 사진 업로드 + 상태 선택 폼(모달)
   - 마이페이지 : 관리자=관리현황 / 고객=내 비교견적
   디자인 톤(로그인 모달/업로드 그리드 클래스)을 재사용합니다.
   ============================================================ */
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
  function photoPicker(container, max) {
    max = max || 10;
    var files = [];
    var input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = max > 1; input.hidden = true;
    container.appendChild(input);
    var grid = document.createElement('div'); grid.className = 'upload-grid';
    container.appendChild(grid);
    function draw() {
      grid.innerHTML = '';
      files.forEach(function (src, i) {
        var cell = document.createElement('div'); cell.className = 'upload-cell has-img';
        cell.innerHTML = '<img src="' + src + '" alt=""><button type="button" class="remove-btn" data-i="' + i + '">×</button>';
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
      var b = e.target.closest('.remove-btn'); if (!b) return;
      e.preventDefault(); files.splice(+b.dataset.i, 1); draw();
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

    /* ========== 시계 등록/수정 모달 ========== */
    var listingModal = makeModal('listingModal', 'LISTING', '시계 등록');
    var lBody = $('.modal-body', listingModal);
    var lPicker = null, lEditId = null, lExisting = [];

    function statusOptions(cur) {
      return [['on_sale', '판매중'], ['sold', '판매완료'], ['hidden', '숨김']].map(function (s) {
        return '<option value="' + s[0] + '"' + (cur === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
      }).join('');
    }
    function catOptions(cur) {
      return [listingCats.brand, listingCats.user].map(function (c) {
        return '<option' + (cur === c ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
    }

    function openListing(item, presetCat) {
      lEditId = item ? item.id : null;
      lExisting = (item && item.photos) ? item.photos.slice() : [];
      $('h2', listingModal).textContent = item ? '시계 수정' : '새 시계 등록';
      lBody.innerHTML =
        '<form class="signup-form" id="listingForm">' +
        '<label><span>카테고리</span><select name="category">' + catOptions(item ? item.category : presetCat) + '</select></label>' +
        '<label><span>브랜드 *</span><input name="brand" placeholder="예: ROLEX" value="' + esc(item ? item.brand : '') + '" required></label>' +
        '<label><span>모델 / 레퍼런스 *</span><input name="model" placeholder="예: 데이트저스트 36" value="' + esc(item ? item.model : '') + '" required></label>' +
        '<label><span>판매가 (숫자, 비우면 가격문의)</span><input name="price" type="number" value="' + (item && item.price ? item.price : '') + '"></label>' +
        '<label><span>상태</span><select name="status">' + statusOptions(item ? item.status : 'on_sale') + '</select></label>' +
        '<label><span>사진 (최대 5장)</span></label><div id="listingPhotos"></div>' +
        (lExisting.length ? '<p class="muted small">기존 사진 ' + lExisting.length + '장 유지 · 새 사진은 뒤에 추가됩니다.</p>' : '') +
        '<button type="submit" class="login-btn login-default">' + (item ? '수정 저장' : '등록') + '</button>' +
        '</form>';
      lPicker = photoPicker($('#listingPhotos', listingModal), 5);
      openModal(listingModal);
      $('#listingForm', listingModal).addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(e.target);
        var brand = String(fd.get('brand') || '').trim();
        var model = String(fd.get('model') || '').trim();
        if (!brand || !model) { alert('브랜드와 모델을 입력하세요.'); return; }
        var price = parseInt(String(fd.get('price') || '').replace(/[^0-9]/g, ''), 10) || null;
        var payload = {
          brand: brand, model: model, price: price,
          category: fd.get('category'), status: fd.get('status'),
          photos: lPicker.files
        };
        var btn = $('button[type="submit"]', e.target); btn.disabled = true; btn.textContent = '저장 중…';
        var p = lEditId
          ? B.updateProduct(lEditId, Object.assign({ existingPhotos: lExisting }, payload))
          : B.addProduct(payload);
        p.then(function () { closeModal(listingModal); alert('저장되었습니다.'); })
          .catch(function (err) { alert('저장 실패: ' + (err && err.message || err)); })
          .then(function () { btn.disabled = false; btn.textContent = lEditId ? '수정 저장' : '등록'; });
      });
    }
    // script.js 의 수정 버튼이 호출
    window.belloreEditListing = function (id) {
      B.getListing(id).then(function (item) { openListing(item); })
        .catch(function (err) { alert('불러오기 실패: ' + (err && err.message || err)); });
    };

    // 관리자 등록 버튼: 벨로르(#adminAddProduct) / 고객판매(주입 버튼)
    var addBtn = $('#adminAddProduct');
    if (addBtn) addBtn.addEventListener('click', function (e) { e.preventDefault(); openListing(null, listingCats.brand); }, true);
    function injectUserMarketBtn() {
      var b = $('#adminAddUserProduct');
      if (b) b.addEventListener('click', function () { openListing(null, listingCats.user); });
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
          .catch(function (err) { alert('저장 실패: ' + (err && err.message || err)); })
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
      var actions = lastInfo.isAdmin
        ? '<div class="row-actions"><button type="button" class="row-act" data-edit="' + opt.editKey + '">수정</button>' +
          '<button type="button" class="row-act danger" data-del="' + opt.delKey + '">삭제</button></div>'
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

    // 인사이트 섹션 상단 관리자 작성 버튼
    function injectInsightToolbar() {
      if (!insightList || $('#belloreInsightAdmin')) return;
      var bar = document.createElement('div');
      bar.id = 'belloreInsightAdmin'; bar.className = 'admin-only'; bar.hidden = true;
      bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px';
      bar.innerHTML =
        '<button type="button" class="admin-add-btn" id="bWritePost">+ 인사이트 글 작성</button>' +
        '<button type="button" class="admin-add-btn" id="bWriteReview">+ 매입후기 작성</button>';
      insightList.parentNode.insertBefore(bar, insightList);
      $('#bWritePost').addEventListener('click', function () { openEditor('post', null); });
      $('#bWriteReview').addEventListener('click', function () { openEditor('review', null); });
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

    /* ========== 시작 ========== */
    injectInsightToolbar();
    injectUserMarketBtn();
    if (insightList) {
      B.subscribePosts(function (rows) { postsCache = rows; renderInsight(); });
      B.subscribeReviews(function (rows) { reviewsCache = rows; renderInsight(); });
    }
    B.onAuthChange(function (user, info) {
      lastInfo = info || { isAdmin: false, isApprovedVendor: false };
      updateVendorView(info);
      applyMyPageRole(info);
      renderInsight();
    });
  });
})();
