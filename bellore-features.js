/* ============================================================
   벨로르(BELLORE) · 추가 기능 컨트롤러 (Supabase)
   ------------------------------------------------------------
   기존 디자인/마크업 위에 다음 기능을 이식합니다.
   - 업체 입찰 화면 (승인업체: 진행중 비교견적에 입찰)
   - 인사이트/커뮤니티 (관리자 작성, 카테고리별) → 후기 포함
   - 매입후기 (관리자 작성)
   - 관리자: 고객판매 마켓 시계 등록
   주의: 이 파일은 NWBackend(supabase.js)가 활성일 때만 동작합니다.
   ============================================================ */
(function () {
  'use strict';

  function $(s, c) { return (c || document).querySelector(s); }
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

  ready(function () {
    var B = window.NWBackend;
    if (!B || !B.configured) return; // 데모 모드면 동작 안 함

    var CATS = (window.BELLORE_CATEGORIES || {});
    var insightMap = CATS.insight || {};          // key → 한글 카테고리
    var catToKey = {};                              // 한글 카테고리 → key
    Object.keys(insightMap).forEach(function (k) { catToKey[insightMap[k]] = k; });

    var lastInfo = { isAdmin: false, isApprovedVendor: false };

    /* ========== 1) 업체 입찰 화면 ========== */
    var vendorSection = $('#vendorQuotesSection');
    var vendorBox = $('#vendorQuotes');
    var unsubOpen = null;

    function renderVendorQuotes(rows) {
      if (!vendorBox) return;
      var me = B.currentUser();
      if (!rows.length) {
        vendorBox.innerHTML = '<div class="empty-items"><p>현재 입찰 가능한 비교견적이 없습니다.</p></div>';
        return;
      }
      vendorBox.innerHTML = rows.map(function (q) {
        var mine = null;
        (q.bids || []).forEach(function (b) { if (me && b.vendor_id === me.uid) mine = b; });
        var img = (q.photos && q.photos[0]) ? q.photos[0] : FALLBACK_IMG;
        var bidUi = mine
          ? '<p class="my-item-bid">내 입찰가 ' + fmt(mine.amount) + '원' + (mine.message ? ' · ' + esc(mine.message) : '') + '</p>'
          : '<div class="vendor-bid-form">' +
              '<input type="number" class="vbid-amount" placeholder="입찰 금액(원)" data-q="' + esc(q.id) + '">' +
              '<input type="text" class="vbid-msg" placeholder="메시지(선택)" data-q="' + esc(q.id) + '">' +
              '<button type="button" class="admin-bid-btn vbid-go" data-q="' + esc(q.id) + '">입찰하기</button>' +
            '</div>';
        return '<div class="admin-pending-item">' +
          '<div class="admin-pending-img"><img src="' + esc(img) + '" alt=""></div>' +
          '<div class="admin-pending-info">' +
          '<strong>' + esc(q.brand || '') + '</strong>' +
          '<p>' + esc(q.model || '') + '</p>' +
          '<small>입찰 ' + (q.bids ? q.bids.length : 0) + '건' + (q.bidAmount ? ' · 최고 ' + fmt(q.bidAmount) + '원' : '') + '</small>' +
          bidUi +
          '</div></div>';
      }).join('');
    }

    function updateVendorView(info) {
      var show = !!(info && info.isApprovedVendor);
      if (vendorSection) vendorSection.hidden = !show;
      if (show && !unsubOpen) {
        unsubOpen = B.subscribeOpenQuotes(renderVendorQuotes);
      } else if (!show && unsubOpen) {
        unsubOpen(); unsubOpen = null;
      }
    }

    if (vendorBox) {
      vendorBox.addEventListener('click', function (e) {
        var go = e.target.closest('.vbid-go');
        if (!go) return;
        var id = go.dataset.q;
        var amtEl = vendorBox.querySelector('.vbid-amount[data-q="' + id + '"]');
        var msgEl = vendorBox.querySelector('.vbid-msg[data-q="' + id + '"]');
        var amount = parseInt(String(amtEl ? amtEl.value : '').replace(/[^0-9]/g, ''), 10) || 0;
        if (!amount) { alert('입찰 금액을 입력하세요.'); return; }
        go.disabled = true;
        B.placeBid({ id: id }, amount, msgEl ? msgEl.value.trim() : '')
          .then(function () { alert(fmt(amount) + '원으로 입찰했습니다.'); })
          .catch(function (err) { alert('입찰 실패: ' + (err && err.message || err)); })
          .then(function () { go.disabled = false; });
      });
    }

    /* ========== 2) 인사이트/커뮤니티 + 후기 ========== */
    var insightList = $('#insightList');
    var dynHolder = null;
    var postsCache = [];
    var reviewsCache = [];

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

    function buildInsightRow(opt) {
      var art = document.createElement('article');
      art.className = 'insight-row';
      art.setAttribute('data-cat', opt.key);
      art.dataset.body = opt.body || '';      // 모달이 실제 본문을 읽도록 속성으로 저장
      var img = document.createElement('div');
      img.className = 'insight-row-img';
      img.innerHTML = '<img src="' + esc(opt.img || FALLBACK_IMG) + '" alt="" loading="lazy">';
      var bd = document.createElement('div');
      bd.className = 'insight-row-body';
      var lead = (opt.body || '').split('\n')[0];
      bd.innerHTML =
        '<span class="tag-mini">' + esc(opt.label) + '</span>' +
        '<h3>' + esc(opt.title) + '</h3>' +
        '<p>' + esc(opt.stars ? opt.stars + '  ' : '') + esc(lead) + '</p>' +
        '<div class="insight-meta"><span>' + esc(opt.date || '') + '</span>' +
        (opt.author ? '<span>·</span><span>' + esc(opt.author) + '</span>' : '') + '</div>' +
        (lastInfo.isAdmin ? '<button type="button" class="bellore-del" data-del="' + esc(opt.delKey) + '">삭제</button>' : '');
      art.appendChild(img); art.appendChild(bd);
      return art;
    }

    function stars(r) { r = r || 0; return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r); }
    function ymd(iso) { try { return new Date(iso).toLocaleDateString('ko-KR'); } catch (e) { return ''; } }

    function renderInsight() {
      var holder = ensureHolder();
      if (!holder) return;
      holder.innerHTML = '';
      postsCache.forEach(function (p) {
        holder.appendChild(buildInsightRow({
          key: catToKey[p.category] || 'guide',
          label: p.category || '인사이트',
          title: p.title, body: p.body || '', img: p.image_url,
          date: ymd(p.created_at), delKey: 'post:' + p.id
        }));
      });
      reviewsCache.forEach(function (r) {
        holder.appendChild(buildInsightRow({
          key: 'review', label: '매입 후기',
          title: r.title, body: r.body || '',
          img: (r.image_urls && r.image_urls[0]) || '',
          date: ymd(r.created_at), author: r.author_name, stars: stars(r.rating),
          delKey: 'review:' + r.id
        }));
      });
      // 현재 활성 탭 필터 재적용
      var active = $('.insight-tab.active');
      if (active && active.dataset.cat && active.dataset.cat !== 'all') {
        var cat = active.dataset.cat;
        Array.prototype.forEach.call(holder.children, function (row) {
          row.style.display = (row.dataset.cat === cat) ? '' : 'none';
        });
      }
    }

    // 관리자 작성 툴바 (인사이트 섹션 상단)
    function injectInsightAdminToolbar() {
      if (!insightList || $('#belloreInsightAdmin')) return;
      var bar = document.createElement('div');
      bar.id = 'belloreInsightAdmin';
      bar.className = 'admin-only';
      bar.hidden = true;
      bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px';
      bar.innerHTML =
        '<button type="button" class="admin-add-btn" id="belloreWritePost">+ 인사이트 글 작성 (관리자)</button>' +
        '<button type="button" class="admin-add-btn" id="belloreWriteReview">+ 매입후기 작성 (관리자)</button>';
      insightList.parentNode.insertBefore(bar, insightList);

      $('#belloreWritePost').addEventListener('click', function () {
        var keys = Object.keys(insightMap);
        var opts = keys.map(function (k, i) { return (i + 1) + ') ' + insightMap[k]; }).join('\n');
        var sel = prompt('카테고리를 선택하세요.\n' + opts, '1');
        var idx = parseInt(sel, 10) - 1;
        if (isNaN(idx) || idx < 0 || idx >= keys.length) return;
        var category = insightMap[keys[idx]];
        var title = prompt('제목');
        if (!title) return;
        var body = prompt('본문 내용') || '';
        B.addPost({ title: title, body: body, category: category })
          .then(function () { alert('게시되었습니다.'); })
          .catch(function (err) { alert('실패: ' + (err && err.message || err)); });
      });

      $('#belloreWriteReview').addEventListener('click', function () {
        var title = prompt('후기 제목');
        if (!title) return;
        var author = prompt('작성자명', '고객') || '고객';
        var rating = parseInt(prompt('별점 (1~5)', '5'), 10) || 5;
        var body = prompt('후기 내용') || '';
        B.addReview({ title: title, author_name: author, rating: Math.max(1, Math.min(5, rating)), body: body })
          .then(function () { alert('후기가 등록되었습니다.'); })
          .catch(function (err) { alert('실패: ' + (err && err.message || err)); });
      });
    }

    // 삭제 버튼 (관리자)
    document.addEventListener('click', function (e) {
      var del = e.target.closest('.bellore-del');
      if (!del) return;
      e.preventDefault(); e.stopPropagation();
      var key = del.dataset.del || '';
      var parts = key.split(':'); var kind = parts[0]; var id = parts[1];
      if (!confirm('삭제하시겠어요?')) return;
      var p = kind === 'post' ? B.deletePost(id) : B.deleteReview(id);
      p.catch(function (err) { alert('삭제 실패: ' + (err && err.message || err)); });
    });

    /* ========== 3) 관리자: 고객판매 마켓 시계 등록 ========== */
    function injectUserMarketAdminBtn() {
      var panel = $('#panel-user .admin-panel');
      if (!panel || $('#adminAddUserProduct')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'admin-add-btn';
      btn.id = 'adminAddUserProduct';
      btn.style.marginTop = '12px';
      btn.textContent = '+ 고객 판매 시계 등록 (관리자)';
      panel.appendChild(btn);
      btn.addEventListener('click', function () {
        var brand = prompt('브랜드 (예: ROLEX)'); if (!brand) return;
        var model = prompt('모델명 (예: 서브마리너 데이트)'); if (!model) return;
        var price = prompt('판매가 (숫자만)'); if (price === null) return;
        var priceNum = parseInt(String(price).replace(/[^0-9]/g, ''), 10) || 0;
        B.addProduct({ brand: brand, model: model, price: priceNum, category: (CATS.listing || {}).user || '고객판매' })
          .then(function () { alert(brand + ' ' + model + ' 등록 완료 (고객 판매 마켓).'); })
          .catch(function (err) { alert('등록 실패: ' + (err && err.message || err)); });
      });
    }

    /* ========== 구독 시작 ========== */
    injectInsightAdminToolbar();
    injectUserMarketAdminBtn();

    if (insightList) {
      B.subscribePosts(function (rows) { postsCache = rows; renderInsight(); });
      B.subscribeReviews(function (rows) { reviewsCache = rows; renderInsight(); });
    }

    B.onAuthChange(function (user, info) {
      lastInfo = info || { isAdmin: false, isApprovedVendor: false };
      updateVendorView(info);
      // 관리자 토글에 맞춰 삭제버튼 표시 갱신
      renderInsight();
    });
  });
})();
