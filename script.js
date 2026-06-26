/* ============================================
   벨로르 - 메인 스크립트
   ============================================ */

(function () {
    'use strict';

    function $(s, ctx) { return (ctx || document).querySelector(s); }
    function $$(s, ctx) { return Array.from((ctx || document).querySelectorAll(s)); }
    function fmt(n) { return n.toLocaleString('ko-KR'); }

    /* ============ 폼 제출 → 이메일 발송 (FormSubmit.co) ============ */
    var LEAD_EMAIL = 'jeongsseongg@gmail.com';
    function fdToObj(fd) {
        var o = {};
        fd.forEach(function (v, k) {
            if (v instanceof File) { return; } // 파일은 본문에서 제외
            o[k] = v;
        });
        return o;
    }
    // subject: 메일 제목, data: 보낼 항목 객체. 화면 흐름을 막지 않도록 fire-and-forget.
    function sendLead(subject, data) {
        try {
            var payload = {};
            Object.keys(data).forEach(function (k) { payload[k] = data[k]; });
            payload._subject = '[벨로르 문의] ' + subject;
            payload._template = 'table';
            payload._captcha = 'false';
            return fetch('https://formsubmit.co/ajax/' + LEAD_EMAIL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(function (err) { console.warn('메일 발송 실패:', err); });
        } catch (e) { console.warn('메일 발송 오류:', e); }
    }

    function init() {
        initRouter();
        initHeaderScroll();
        initHeaderHeight(); // 헤더 높이 → main-wrap padding-top 동기화
        initCollectionTabs();
        initFilterChips();
        initInsightFilter();
        initInsightModal();
        initPhotoUpload();
        initCompareForm();
        initSellBuyRepairForms();
        initLiveBoard();
        initAuctionDetail();
        initEventSlider();
        initHScroll();
        initLoginModal();
        initSignup();
        initProductModal();
        initAdminMode();
        initPartnerModal();
        initInquiryModal();
        initReveal();
        initParallax();
        initCoupons();
        initOrderUI();
        initAdminOrderUI();
        initAdminDashboard();
        initBackendSync();
        initInstallPrompt();
        initPwaModal();
        initAccountUI();
        initHeroCarousel();
        initLiveBoardLockLink();
        initCatPages();
        initCountdowns();
    }

    /* ============ 히어로 배너 캐러셀 ============ */
    function initHeroCarousel() {
        var carousel = $('#heroCarousel');
        var track = $('#heroTrack');
        if (!carousel || !track) return;
        var prevBtn = $('#heroPrev'), nextBtn = $('#heroNext'), dotsBox = $('#heroDots');
        var index = 0, slides = [], autoTimer = null;

        function slideEls() { return $$('.hero-slide', track).filter(function (s) { return s.style.display !== 'none'; }); }

        function update() {
            slides = slideEls();
            var n = slides.length;
            slides.forEach(function (s, i) { s.classList.toggle('is-active', i === index); });
            track.style.transform = 'translateX(' + (-index * 100) + '%)';
            var multi = n > 1;
            if (prevBtn) prevBtn.hidden = !multi;
            if (nextBtn) nextBtn.hidden = !multi;
            if (dotsBox) {
                dotsBox.innerHTML = '';
                if (multi) {
                    for (var i = 0; i < n; i++) {
                        var d = document.createElement('button');
                        d.type = 'button'; d.className = 'hero-dot' + (i === index ? ' active' : '');
                        d.setAttribute('aria-label', (i + 1) + '번 배너');
                        (function (idx) { d.addEventListener('click', function () { go(idx); }); })(i);
                        dotsBox.appendChild(d);
                    }
                }
            }
        }
        function go(i) {
            var n = slideEls().length;
            if (n === 0) return;
            index = (i + n) % n;
            update();
            restartAuto();
        }
        function next() { go(index + 1); }
        function prev() { go(index - 1); }
        function restartAuto() {
            if (autoTimer) clearInterval(autoTimer);
            if (slideEls().length > 1) autoTimer = setInterval(next, 6000);
        }

        if (prevBtn) prevBtn.addEventListener('click', prev);
        if (nextBtn) nextBtn.addEventListener('click', next);

        // 스와이프(터치/포인터) — 짧은 스와이프·빠른 플릭 모두 인식, 손가락을 그대로 따라옴
        // 배너 슬라이드 자체가 <a> 라서 a/button 으로 막지 않고, 스와이프했으면 클릭만 취소한다
        var startX = 0, startT = 0, dx = 0, dragging = false, swiped = false;
        track.addEventListener('pointerdown', function (e) {
            if (e.button != null && e.button !== 0) return;
            dragging = true; swiped = false; startX = e.clientX; startT = Date.now(); dx = 0;
            track.style.transition = 'none';
            try { track.setPointerCapture(e.pointerId); } catch (err) {}
            if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
        });
        track.addEventListener('pointermove', function (e) {
            if (!dragging) return;
            dx = e.clientX - startX;
            if (Math.abs(dx) > 4) swiped = true;
            track.style.transform = 'translateX(calc(' + (-index * 100) + '% + ' + dx + 'px))';
        });
        // 드래그로 슬라이드를 넘겼으면 그 직후의 클릭(=링크 이동)을 취소
        track.addEventListener('click', function (e) {
            if (swiped) { e.preventDefault(); e.stopPropagation(); swiped = false; }
        }, true);
        function endDrag(e) {
            if (!dragging) return;
            dragging = false;
            try { if (e) track.releasePointerCapture(e.pointerId); } catch (err) {}
            track.style.transition = '';
            var w = carousel.getBoundingClientRect().width || 1;
            var dt = Date.now() - startT;
            var vel = dx / (dt || 1);              // px/ms
            // 30px 이상 끌었거나, 빠른 플릭(속도 0.35px/ms↑)이면 페이지 이동
            if (Math.abs(dx) > Math.min(60, w * 0.18) || Math.abs(vel) > 0.35) {
                dx < 0 ? next() : prev();
            } else {
                update();
                // 거의 안 움직였으면(=탭) 좌/우 가장자리 탭으로 이동
                if (!swiped && e && !(e.target.closest && e.target.closest('a,button'))) {
                    var r = carousel.getBoundingClientRect();
                    var x = e.clientX - r.left;
                    if (x < r.width * 0.30) prev();
                    else if (x > r.width * 0.70) next();
                }
            }
            restartAuto();
        }
        track.addEventListener('pointerup', endDrag);
        track.addEventListener('pointercancel', endDrag);

        // 뷰포트에 맞는 전용 이미지를 우선 사용하되, 없으면 다른 규격으로 폴백한다.
        // (배경은 contain+블러라 폴백 이미지도 잘리지 않고 안전하게 노출 → 관리자 안내문구와 동작 일치)
        // 한 슬롯이라도 채워져 있으면 항상 이미지가 보인다.
        function pickBannerImg(b) {
            var w = window.innerWidth || document.documentElement.clientWidth || 0;
            if (w >= 1024) return b.imagePc || b.imageWide || b.image || '';
            if (w >= 700) return b.imageWide || b.imagePc || b.image || '';
            return b.image || b.imageWide || b.imagePc || '';
        }
        function applySlideBg(slide) {
            var b = slide._banner; if (!b) return;
            var raw = pickBannerImg(b);
            var blur = $('.hero-slide-blur', slide), bg = $('.hero-slide-bg', slide);
            var ph = $('.hero-slide-ph', slide);
            if (!raw) {
                // 전용 이미지 미등록 → 잘리는 폴백 대신 안내 플레이스홀더
                if (bg) bg.style.backgroundImage = 'none';
                if (blur) blur.style.backgroundImage = 'none';
                if (ph) ph.hidden = false;
                slide.classList.add('is-ph');
                return;
            }
            var url = raw.replace(/'/g, '%27');
            if (bg) bg.style.backgroundImage = 'url(\'' + url + '\')';
            if (blur) blur.style.backgroundImage = 'url(\'' + url + '\')';
            if (ph) ph.hidden = true;
            slide.classList.remove('is-ph');
        }

        // DB 배너 주입 (bellore-features.js 가 호출)
        window.belloreSetBanners = function (list) {
            $$('.hero-slide-db', track).forEach(function (n) { n.remove(); });
            var def = $('.hero-default', track);
            carousel.classList.toggle('has-db', !!(list && list.length));
            if (list && list.length) {
                if (def) def.style.display = 'none';
                list.forEach(function (b) {
                    var slide = document.createElement(b.link ? 'a' : 'div');
                    slide.className = 'hero-slide hero-slide-db';
                    if (b.link) { slide.href = b.link; }
                    slide._banner = b;
                    // 문구(제목/부제목)를 넣으면 기본 히어로와 동일한 중앙 정렬 스타일로 노출
                    slide.innerHTML =
                        '<div class="hero-slide-blur"></div>' +
                        '<div class="hero-slide-bg"></div>' +
                        '<div class="hero-slide-ph" hidden>' +
                            '<span class="hero-slide-ph-logo">BELLORE</span>' +
                            '<span class="hero-slide-ph-text">이미지 업로드 중입니다</span>' +
                            '<span class="hero-slide-ph-sub">이 화면 규격 이미지가 아직 등록되지 않았어요</span>' +
                        '</div>' +
                        '<div class="hero-gradient"></div>' +
                        '<div class="container hero-content hero-slide-text">' +
                        (b.title ? '<h2 class="hero-slide-title">' + escapeHtml(b.title) + '</h2>' : '') +
                        (b.subtitle ? '<p class="hero-slide-sub">' + escapeHtml(b.subtitle) + '</p>' : '') +
                        (b.link ? '<div class="hero-cta hero-slide-cta"><span class="btn btn-primary">자세히 보기</span></div>' : '') +
                        '</div>';
                    applySlideBg(slide);
                    track.appendChild(slide);
                });
            } else if (def) {
                def.style.display = '';
            }
            index = 0;
            update();
            restartAuto();
        };

        // 화면 폭이 바뀌면(회전/리사이즈) 각 슬라이드 이미지를 뷰포트에 맞게 다시 선택
        var _bnResizeT = null;
        window.addEventListener('resize', function () {
            clearTimeout(_bnResizeT);
            _bnResizeT = setTimeout(function () {
                $$('.hero-slide-db', track).forEach(applySlideBg);
            }, 200);
        });

        // 캐시된 배너를 먼저 즉시 렌더 → 기본배너 깜빡임 방지(DB 응답 시 갱신)
        try {
            var _cb = JSON.parse(localStorage.getItem('bellore_banners') || 'null');
            if (_cb && _cb.length) window.belloreSetBanners(_cb);
        } catch (e) {}

        function escapeHtml(s) {
            return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        update();
        restartAuto();
    }

    /* ============ 계정 UI: 구글 로그인 · 마이페이지 · 알림 · 관리자 관리 · 상품 수정 ============ */
    var pocketBound = false;
    var myOrdersUnsub = null;
    var myOrdersCache = [];
    var ordersFilter = '';
    var O_LABEL = {
        pending: '결제대기', paid: '결제완료', inspecting: '정품검수', preparing: '상품준비중',
        shipping: '배송중', delivered: '배송완료', confirmed: '구매확정',
        cancel_req: '취소요청', canceled: '주문취소', cancelled: '주문취소', refunded: '환불완료',
        return_req: '반품요청', exchange_req: '교환요청', returning: '회수중'
    };
    // 정상 진행 단계(타임라인)
    var O_FLOW = ['paid', 'inspecting', 'preparing', 'shipping', 'delivered', 'confirmed'];
    var O_FLOW_LABEL = { paid: '결제완료', inspecting: '정품검수', preparing: '상품준비', shipping: '배송중', delivered: '배송완료', confirmed: '구매확정' };
    // 택배사 배송조회 URL
    var COURIERS = {
        'CJ대한통운': 'https://trace.cjlogistics.com/next/tracking.html?wblNo=',
        '한진택배': 'https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2=',
        '롯데택배': 'https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=',
        '우체국택배': 'https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=',
        '로젠택배': 'https://www.ilogen.com/web/personal/trace/'
    };
    function trackUrl(courier, no) {
        var base = COURIERS[courier];
        return base ? (base + encodeURIComponent(no || '')) : '';
    }
    function fmtDate(ts) {
        var ms = ts && ts.seconds ? ts.seconds * 1000 : 0;
        if (!ms) return '';
        var d = new Date(ms);
        function p(n) { return n < 10 ? '0' + n : '' + n; }
        return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function openOrdersList(status) {
        ordersFilter = status || '';
        var m = $('#ordersModal'); if (!m) return;
        $$('#ordersTabs .orders-tab').forEach(function (t) {
            t.classList.toggle('active', (t.dataset.ofilter || '') === ordersFilter);
        });
        m.hidden = false; document.body.style.overflow = 'hidden';
        renderOrdersList();
    }
    function closeOrdersList() {
        var m = $('#ordersModal'); if (m) { m.hidden = true; document.body.style.overflow = 'hidden'; }
    }
    function renderOrdersList() {
        var box = $('#ordersList'); if (!box) return;
        var rows = ordersFilter ? myOrdersCache.filter(function (o) { return o.status === ordersFilter; }) : myOrdersCache;
        if (!rows.length) {
            box.innerHTML = '<div class="orders-empty"><p>' +
                (ordersFilter ? (O_LABEL[ordersFilter] || '해당') + ' 상태의 주문이 없습니다.' : '아직 주문 내역이 없습니다.') +
                '</p></div>';
            return;
        }
        box.innerHTML = rows.map(function (o) {
            var img = o.productImage || 'assets/images.jpg';
            var date = o.createdAt ? relTime(o.createdAt) : '';
            var st = o.status || 'pending';
            var unpaid = st === 'pending'
                ? '<button type="button" class="order-pay" data-opay="' + esc(o.orderNo) + '">입금 안내</button>' : '';
            return '<div class="order-row" data-oview="' + esc(o.orderNo) + '">' +
                '<div class="order-thumb"><img src="' + esc(img) + '" alt=""></div>' +
                '<div class="order-main">' +
                    (o.productBrand ? '<p class="order-brand">' + esc(o.productBrand) + '</p>' : '') +
                    '<p class="order-name">' + esc(o.productName || '상품') + '</p>' +
                    '<p class="order-meta">' + esc(o.orderNo || '') + (date ? ' · ' + date : '') + '</p>' +
                '</div>' +
                '<div class="order-side">' +
                    '<span class="order-badge order-badge--' + st + '">' + (O_LABEL[st] || st) + '</span>' +
                    '<span class="order-amt">' + (o.amount ? fmt(o.amount) + '원' : '-') + '</span>' +
                    unpaid +
                '</div>' +
            '</div>';
        }).join('');
    }
    function openMyPage() {
        var m = $('#myPageModal');
        if (!m) return;
        m.hidden = false;
        document.body.style.overflow = 'hidden';
        renderMyItemsBackend(myListingsCache); // 현재 캐시로 즉시 렌더
        renderMyShortcuts(); // 장바구니 · 최근 본 상품

        // 마이포켓: 구매 가능한 상품 수(현재 판매중 매물 그리드 기준)
        var pqAvail = $('#pqAvailable');
        if (pqAvail) {
            var n = $$('#collection .hcard').filter(function (c) {
                return c.style.display !== 'none';
            }).length;
            pqAvail.textContent = n + '건';
        }

        // 주문 현황(결제대기/결제완료) 실제 데이터 연동
        if (backendOn() && NWBackend.subscribeMyOrders) {
            if (myOrdersUnsub) { try { myOrdersUnsub(); } catch (e) {} }
            myOrdersUnsub = NWBackend.subscribeMyOrders(function (orders) {
                myOrdersCache = orders || [];
                function cnt(st) { return myOrdersCache.filter(function (o) { return o.status === st; }).length; }
                var wait = cnt('pending');
                var set = function (id, n) { var el = $(id); if (el) el.textContent = n; };
                set('#psWait', wait);
                set('#psPaid', cnt('paid'));
                set('#psPrep', cnt('preparing'));
                set('#psShip', cnt('shipping'));
                set('#psDone', cnt('delivered'));
                var pq = $('#pqUnpaid'); if (pq) pq.textContent = wait + '건';
                var om = $('#ordersModal');
                if (om && !om.hidden) renderOrdersList();   // 열려 있으면 실시간 갱신
            });
        }

        if (!pocketBound) {
            pocketBound = true;
            // 정회원 전환 / 주문전체보기: 백엔드 미구현 → 상담 안내
            var up = $('#pocketUpgrade');
            if (up) up.addEventListener('click', function () {
                alert('정회원 전환은 준비 중입니다. 카카오톡 상담으로 안내해 드릴게요.');
                window.open('https://open.kakao.com/o/sMuCaAFh', '_blank');
            });
            var ord = $('#pocketOrders');
            if (ord) ord.addEventListener('click', function () { openOrdersList(''); });
            // 주문현황 칸(결제대기/완료/준비중/배송중/배송완료) 탭하면 해당 상태로 필터
            var ps = document.querySelector('#pocketBox .pocket-status');
            if (ps) ps.addEventListener('click', function (e) {
                var c = e.target.closest('[data-ostatus]'); if (!c) return;
                openOrdersList(c.dataset.ostatus);
            });
            // 주문 모달: 탭 전환 · 닫기 · 입금안내
            var om = $('#ordersModal');
            if (om) om.addEventListener('click', function (e) {
                if (e.target.closest('[data-ordclose]')) { closeOrdersList(); return; }
                var tab = e.target.closest('.orders-tab');
                if (tab) { openOrdersList(tab.dataset.ofilter || ''); return; }
                var pay = e.target.closest('[data-opay]');
                if (pay) {
                    e.stopPropagation();
                    alert('입금 안내\n\n주문번호 ' + pay.dataset.opay + '\n결제/입금은 카카오톡 상담으로 도와드립니다.');
                    window.open('https://open.kakao.com/o/sMuCaAFh', '_blank');
                    return;
                }
                var view = e.target.closest('[data-oview]');
                if (view) { openOrderDetail(view.dataset.oview); return; }
            });
        }
    }
    function closeMyPage() {
        var m = $('#myPageModal');
        if (m) { m.hidden = true; document.body.style.overflow = ''; }
        closeMpSub();
    }

    // 마이페이지 서브페이지(쿠폰·소식시계 등): 스크롤 대신 해당 화면으로 전환
    var MP_SUB_TITLE = { myCouponSection: '내 쿠폰', myAlertsSection: '소식 기다리는 시계' };
    function openMpSub(id) {
        var mc = document.querySelector('#myPageModal .login-content');
        var sec = mc && mc.querySelector('#' + id);
        if (!mc || !sec) return false;
        mc.setAttribute('data-mpsub', id);
        mc.classList.add('mp-sub');
        var t = $('#mpSubTitle'); if (t) t.textContent = MP_SUB_TITLE[id] || '';
        mc.scrollTop = 0;
        return true;
    }
    function closeMpSub() {
        var mc = document.querySelector('#myPageModal .login-content');
        if (!mc) return;
        mc.classList.remove('mp-sub');
        mc.removeAttribute('data-mpsub');
    }

    var notiCache = [];
    function initAccountUI() {
        if (!backendOn()) return;

        // 구글 로그인
        var g = $('#loginGoogle');
        if (g) {
            g.addEventListener('click', function () {
                try { sessionStorage.setItem('bellore_social_pending', '1'); } catch (e) {}
                NWBackend.signInWithGoogle()
                    .then(function (user) {
                        closeLoginModal();
                        alert((user.displayName || '') + '님, 구글 계정으로 로그인되었습니다.');
                    })
                    .catch(function (err) {
                        alert('구글 로그인 실패: ' + authErrorMsg(err));
                    });
            });
        }

        // 카카오 로그인
        var k = $('#loginKakao');
        if (k && NWBackend.signInWithKakao) {
            k.addEventListener('click', function () {
                try { sessionStorage.setItem('bellore_social_pending', '1'); } catch (e) {}
                NWBackend.signInWithKakao()
                    .then(function () { closeLoginModal(); })
                    .catch(function (err) { alert('카카오 로그인 실패: ' + authErrorMsg(err)); });
            });
        }

        // 비교견적 입찰 채택 (고객)
        document.addEventListener('click', function (e) {
            var aw = e.target.closest('[data-award]');
            if (!aw) return;
            e.preventDefault();
            bellConfirm('이 입찰을 채택하시겠어요? 채택하면 견적이 마감됩니다.').then(function (ok) {
                if (!ok) return;
                NWBackend.awardBid(aw.dataset.quote, aw.dataset.award, aw.dataset.vendor)
                    .then(function () {
                        var cm = document.getElementById('cqDetailModal');
                        if (cm) { cm.hidden = true; document.body.style.overflow = ''; }
                        alert('이 견적으로 판매를 진행합니다. 업체에서 곧 연락드립니다.');
                    })
                    .catch(function (err) { alert('채택 실패: ' + (err && err.message || err)); });
            });
        });

        // 마이페이지 모달 닫기
        var myModal = $('#myPageModal');
        if (myModal) {
            myModal.addEventListener('click', function (e) {
                if (e.target.closest('#mpSubBack')) { closeMpSub(); return; }
                if (e.target.closest('[data-myclose]')) { closeMyPage(); return; }
                // 원형 퀵메뉴: 스크롤 대신 해당 섹션을 전체 화면(서브페이지)으로 전환
                var jump = e.target.closest('[data-myjump]');
                if (jump) {
                    var sel = jump.getAttribute('data-myjump');
                    var secId = sel.charAt(0) === '#' ? sel.slice(1) : sel;
                    if (!openMpSub(secId)) {
                        var tgt = $(sel, myModal);
                        if (tgt) tgt.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                    return;
                }
                // 원형 퀵메뉴: 알림 열기
                if (e.target.closest('[data-myact="noti"]')) {
                    var nb = $('#btnNoti'); if (nb) nb.click();
                    return;
                }
                // 장바구니 전체보기 → 찜/장바구니 페이지 장바구니 탭
                if (e.target.closest('[data-myact="cart"]')) {
                    closeMyPage();
                    location.hash = '#wishlist';
                    setTimeout(function () {
                        var t = document.querySelector('.wish-tab[data-wishtab="cart"]');
                        if (t) t.click();
                    }, 80);
                    return;
                }
                // 장바구니/최근 본 상품 미니카드 → 상세 열기
                var mypc = e.target.closest('.mypc');
                if (mypc) {
                    var pid = mypc.getAttribute('data-mypid');
                    closeMyPage();
                    if (pid && window.BELLORE_openProductById) { window.BELLORE_openProductById(pid); return; }
                    if (window.BELLORE_openProductCard) window.BELLORE_openProductCard(mypc);
                    return;
                }
                // 원형 퀵메뉴: 다른 페이지로 이동 시 모달 닫기 (네비게이션은 전역 핸들러가 처리)
                if (e.target.closest('[data-nav]')) closeMyPage();
            });
        }
        // 회원정보 수정 (토스식 단계 페이지: 닉네임·이메일·휴대폰·계좌·비밀번호)
        var profPage = $('#profilePage');
        if (profPage) {
            var VP = window.BELLORE_VERIFY || {};
            var _pStep = 'home', _pwOk = false, _pwMethod = null;
            function pUser() { return (backendOn() && NWBackend.currentUser) ? (NWBackend.currentUser() || {}) : {}; }
            function pSet(id, v) { var el = $('#' + id); if (el) el.textContent = v || '-'; }
            function setPV() {
                var u = pUser();
                pSet('pvName', u.displayName);
                pSet('pvEmail', u.email);
                pSet('pvPhone', u.phone ? (u.phone + (u.phoneVerified ? ' ✓' : '')) : '미등록');
                pSet('pvAccount', u.bankAccount ? ((u.bankName || '') + ' ' + u.bankAccount) : '미등록');
                pSet('pwvPhoneNo', u.phone || '등록된 번호 없음');
                pSet('pwvEmailAddr', u.email || '');
            }
            var P_TITLE = { home: '회원정보 수정', name: '닉네임 변경', email: '이메일 변경', phone: '휴대폰 변경', account: '계좌 변경', pw1: '비밀번호 변경', pw2: '본인인증', pw3: '새 비밀번호' };
            var P_BTN = { home: '', name: '저장', email: '변경 메일 보내기', phone: '저장', account: '저장', pw1: '다음', pw2: '', pw3: '변경 완료' };
            function gotoP(step) {
                _pStep = step;
                $$('.prof-step', profPage).forEach(function (s) { s.hidden = s.dataset.pstep !== step; });
                var t = $('#profTitle'); if (t) t.textContent = P_TITLE[step] || '회원정보 수정';
                var lbl = P_BTN[step], bottom = profPage.querySelector('.pp-bottom'), btn = $('#profNext');
                if (bottom) bottom.style.display = lbl ? '' : 'none';
                if (btn && lbl) { btn.textContent = lbl; btn.disabled = false; }
                var sc = profPage.querySelector('.pp-scroll'); if (sc) sc.scrollTop = 0;
                var u = pUser();
                if (step === 'name') { var e1 = $('#pfName'); if (e1) e1.value = u.displayName || ''; }
                else if (step === 'email') { var e2 = $('#pfEmail'); if (e2) e2.value = u.email || ''; }
                else if (step === 'phone') { var e3 = $('#pfPhone'); if (e3) e3.value = u.phone || ''; var cr = $('#pfPhoneCodeRow'); if (cr) cr.hidden = true; pSet('pfPhoneState', ''); }
                else if (step === 'account') { var b = $('#pfBank'), a = $('#pfAccount'), h = $('#pfHolder'); if (b) b.value = u.bankName || ''; if (a) a.value = u.bankAccount || ''; if (h) h.value = u.bankHolder || ''; }
                else if (step === 'pw1') { var cp = $('#pfCurPw'); if (cp) cp.value = ''; }
                else if (step === 'pw2') { setPV(); var cr2 = $('#pwvCodeRow'); if (cr2) cr2.hidden = true; pSet('pwvState', ''); _pwOk = false; _pwMethod = null; $$('.prof-pick-opt', profPage).forEach(function (x) { x.classList.remove('on'); }); }
                else if (step === 'pw3') { var n1 = $('#pfNewPw'), n2 = $('#pfNewPw2'); if (n1) n1.value = ''; if (n2) n2.value = ''; }
            }
            function openProfilePage(step) {
                if (!backendOn() || !NWBackend.currentUser || !NWBackend.currentUser()) { alert('로그인 후 이용해 주세요.'); return; }
                setPV(); gotoP(typeof step === 'string' ? step : 'home');
                profPage.hidden = false; document.body.style.overflow = 'hidden';
            }
            function closeProfilePage() {
                profPage.hidden = true;
                // 마이페이지가 뒤에 떠 있으면 스크롤 잠금 유지, 아니면 해제
                var mp = $('#myPageModal');
                document.body.style.overflow = (mp && !mp.hidden) ? 'hidden' : '';
            }
            window.BELLORE_openProfile = openProfilePage;
            var editBtn = $('#btnEditProfile'); if (editBtn) editBtn.addEventListener('click', openProfilePage);

            $('#profBack').addEventListener('click', function () {
                if (_pStep === 'home') closeProfilePage();
                else if (_pStep === 'pw2') gotoP('pw1');
                else if (_pStep === 'pw3') gotoP('pw2');
                else gotoP('home');
            });

            profPage.addEventListener('click', function (e) {
                var row = e.target.closest('[data-pgo]'); if (row) { gotoP(row.dataset.pgo); return; }
                var pv = e.target.closest('[data-pwverify]');
                if (pv) {
                    _pwMethod = pv.dataset.pwverify;
                    $$('.prof-pick-opt', profPage).forEach(function (b) { b.classList.toggle('on', b === pv); });
                    var st = $('#pwvState'), cr = $('#pwvCodeRow'), u = pUser();
                    if (_pwMethod === 'email' && VP.email && VP.email.enabled && NWBackend.sendEmailOtp) {
                        if (cr) cr.hidden = false;
                        NWBackend.sendEmailOtp(u.email).then(function () { if (st) { st.textContent = '인증번호를 이메일로 보냈어요.'; st.className = 'vrow-state'; } }).catch(function () { if (st) { st.textContent = '발송 실패'; st.className = 'vrow-state err'; } });
                    } else if (_pwMethod === 'phone' && VP.phone && VP.phone.enabled && NWBackend.verifyIdentityPortone) {
                        NWBackend.verifyIdentityPortone({ phone: u.phone }).then(function () { _pwOk = true; gotoP('pw3'); }).catch(function (err) { if (st) { st.textContent = '인증 실패: ' + (err && err.message || err); st.className = 'vrow-state err'; } });
                    } else { _pwOk = true; gotoP('pw3'); } // 키 미설정(soft) → 즉시 통과
                    return;
                }
            });

            $('#pfPhoneSend').addEventListener('click', function () {
                var phone = ($('#pfPhone').value || '').trim(), st = $('#pfPhoneState');
                if (phone.replace(/[^0-9]/g, '').length < 9) { alert('휴대폰 번호를 정확히 입력하세요.'); return; }
                if (VP.phone && VP.phone.enabled && NWBackend.verifyIdentityPortone) {
                    NWBackend.verifyIdentityPortone({ phone: phone }).then(function () { if (st) { st.textContent = '✓ 본인인증 완료'; st.className = 'vrow-state ok'; } }).catch(function (err) { if (st) { st.textContent = '인증 실패: ' + (err && err.message || err); st.className = 'vrow-state err'; } });
                } else if (st) { st.textContent = '준비 중 — 번호만 저장됩니다.'; st.className = 'vrow-state'; }
            });
            $('#pfPhoneConfirm').addEventListener('click', function () { var st = $('#pfPhoneState'); if (st) { st.textContent = '✓ 인증 완료'; st.className = 'vrow-state ok'; } });
            $('#pwvConfirm').addEventListener('click', function () {
                var code = ($('#pwvCode').value || '').trim(), st = $('#pwvState'), u = pUser();
                if (_pwMethod === 'email' && NWBackend.verifyEmailOtp) {
                    NWBackend.verifyEmailOtp(u.email, code).then(function () { _pwOk = true; gotoP('pw3'); }).catch(function () { if (st) { st.textContent = '인증번호가 올바르지 않습니다.'; st.className = 'vrow-state err'; } });
                } else { _pwOk = true; gotoP('pw3'); }
            });

            $('#profNext').addEventListener('click', function () {
                var btn = this, fail = function (err) { btn.disabled = false; alert('실패: ' + (err && err.message || err)); };
                if (_pStep === 'name') {
                    var nm = ($('#pfName').value || '').trim(); if (!nm) { alert('닉네임을 입력하세요.'); return; }
                    btn.disabled = true; NWBackend.updateDisplayName(nm).then(function () { setPV(); alert('닉네임이 변경되었습니다.'); gotoP('home'); }).catch(fail);
                } else if (_pStep === 'email') {
                    btn.disabled = true; NWBackend.updateEmail(($('#pfEmail').value || '').trim()).then(function () { btn.disabled = false; alert('확인 메일을 보냈어요. 새 이메일의 링크를 누르면 변경이 완료됩니다.'); gotoP('home'); }).catch(fail);
                } else if (_pStep === 'phone') {
                    btn.disabled = true; NWBackend.updatePhoneNumber(($('#pfPhone').value || '').trim()).then(function () { setPV(); alert('휴대폰 번호가 저장되었습니다.'); gotoP('home'); }).catch(fail);
                } else if (_pStep === 'account') {
                    btn.disabled = true; NWBackend.updateBankAccount({ bank: $('#pfBank').value, account: $('#pfAccount').value, holder: $('#pfHolder').value }).then(function () { setPV(); alert('계좌가 저장되었습니다.'); gotoP('home'); }).catch(fail);
                } else if (_pStep === 'pw1') {
                    var cur = $('#pfCurPw').value || ''; if (!cur) { alert('현재 비밀번호를 입력하세요.'); return; }
                    btn.disabled = true; NWBackend.verifyCurrentPassword(cur).then(function () { btn.disabled = false; gotoP('pw2'); }).catch(function (err) { btn.disabled = false; alert(err && err.message || '비밀번호가 일치하지 않습니다.'); });
                } else if (_pStep === 'pw3') {
                    if (!_pwOk) { alert('본인인증을 먼저 완료해 주세요.'); gotoP('pw2'); return; }
                    var p1 = $('#pfNewPw').value || '', p2 = $('#pfNewPw2').value || '';
                    if (p1.length < 6) { alert('비밀번호는 6자 이상이어야 합니다.'); return; }
                    if (p1 !== p2) { alert('비밀번호가 일치하지 않습니다.'); return; }
                    btn.disabled = true; NWBackend.updatePassword(p1).then(function () { _pwOk = false; alert('비밀번호가 변경되었습니다.'); gotoP('home'); }).catch(fail);
                }
            });
        }
        // 로그아웃
        var logout = $('#btnLogout');
        if (logout) {
            logout.addEventListener('click', function () {
                NWBackend.signOut().then(function () {
                    closeMyPage();
                    alert('로그아웃되었습니다.');
                });
            });
        }
        // 업체 승인/취소 (관리자)
        document.addEventListener('click', function (e) {
            var ap = e.target.closest('[data-vapprove]');
            var cn = e.target.closest('[data-vcancel]');
            if (ap) {
                NWBackend.setVendorApproved(ap.dataset.vapprove, true)
                    .then(function () { alert('업체를 승인했습니다.'); })
                    .catch(function (err) { alert('승인 실패: ' + (err && err.message || err)); });
            } else if (cn) {
                bellConfirm('이 업체의 승인을 취소할까요?').then(function (ok) {
                    if (!ok) return;
                    NWBackend.setVendorApproved(cn.dataset.vcancel, false)
                        .catch(function (err) { alert('취소 실패: ' + (err && err.message || err)); });
                });
            }
            // 계좌 인증 승인/취소 (관리자)
            var an = e.target.closest('[data-accton]');
            var ao = e.target.closest('[data-acctoff]');
            if (an) {
                NWBackend.setAccountVerified(an.dataset.accton, true)
                    .then(function () { alert('계좌 인증을 승인했습니다.'); })
                    .catch(function (err) { alert('승인 실패: ' + (err && err.message || err)); });
            } else if (ao) {
                bellConfirm('계좌 인증을 취소할까요?').then(function (ok) {
                    if (!ok) return;
                    NWBackend.setAccountVerified(ao.dataset.acctoff, false)
                        .catch(function (err) { alert('취소 실패: ' + (err && err.message || err)); });
                });
            }
            // VIP 지정/해제 (관리자)
            var von = e.target.closest('[data-vipon]');
            var voff = e.target.closest('[data-vipoff]');
            if (von) {
                NWBackend.setVip(von.dataset.vipon, true)
                    .then(function () { alert('VIP 업체로 지정했습니다. 새 견적 시 카톡 알림톡까지 발송됩니다.'); })
                    .catch(function (err) { alert('VIP 지정 실패: ' + (err && err.message || err)); });
            } else if (voff) {
                NWBackend.setVip(voff.dataset.vipoff, false)
                    .catch(function (err) { alert('VIP 해제 실패: ' + (err && err.message || err)); });
            }
        });

        // 업체: 새 견적 알림 받기 ON/OFF
        var notifyBtn = $('#btnNotifyQuotes');
        if (notifyBtn) notifyBtn.addEventListener('click', function () {
            if (!backendOn() || !NWBackend.setNotifyQuotes) return;
            var on = notifyBtn.getAttribute('aria-pressed') !== 'true'; // 토글
            notifyBtn.disabled = true;
            NWBackend.setNotifyQuotes(on)
                .then(function () {
                    notifyBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
                    var st = $('#notifyQuotesState');
                    if (st) st.textContent = on ? '켜짐' : '꺼짐';
                })
                .catch(function (err) { alert('설정 변경 실패: ' + (err && err.message || err)); })
                .then(function () { notifyBtn.disabled = false; });
        });

        // (회원가입 유형별 UI는 initSignup의 _applyRole에서 처리)

        // 제휴사 센터 버튼
        var pcBtn = $('#btnPartnerCenter');
        if (pcBtn) pcBtn.addEventListener('click', function () {
            if (window.bellorePartnerCenter) window.bellorePartnerCenter({});
        });
        var pnBtn = $('#btnPartnerNewListing');
        if (pnBtn) pnBtn.addEventListener('click', function () {
            if (window.belloreNewListing) window.belloreNewListing();
            else alert('상품 등록 기능을 불러오지 못했습니다.');
        });

        // 알림 모달 (마이페이지 내부 #btnNoti + 상단 헤더 #btnNotiTop 둘 다 연동)
        var btnNoti = $('#btnNoti');
        var btnNotiTop = $('#btnNotiTop');
        var notiModal = $('#notiModal');
        if (notiModal) {
            function openNotiModal() {
                notiModal.hidden = false;
                document.body.style.overflow = 'hidden';
                renderNotiList(notiCache);
                // 열람 시 읽지 않은 알림 읽음 처리
                notiCache.forEach(function (n) {
                    if (!n.read && backendOn() && NWBackend.markNotificationRead) NWBackend.markNotificationRead(n.id).catch(function () {});
                });
            }
            if (btnNoti) btnNoti.addEventListener('click', openNotiModal);
            if (btnNotiTop) btnNotiTop.addEventListener('click', openNotiModal);
            notiModal.addEventListener('click', function (e) {
                if (e.target.closest('[data-noticlose]')) {
                    notiModal.hidden = true;
                    document.body.style.overflow = '';
                }
            });
        }

        // 상단 공유 아이콘 — 사이트 공유(Web Share API + 링크복사 폴백)
        var btnShareTop = $('#btnShareTop');
        if (btnShareTop) btnShareTop.addEventListener('click', function () {
            var data = {
                title: '벨로르 BELLORE',
                text: '명품시계 비교견적·매입·판매는 벨로르에서 — 여러 업체 견적을 한눈에 비교하세요.',
                url: (function () { try { return location.origin + location.pathname; } catch (e) { return 'https://bellore.co.kr'; } })()
            };
            if (navigator.share) { navigator.share(data).catch(function () {}); return; }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(data.url).then(function () { alert('링크를 복사했습니다.'); }, function () {});
            } else { alert(data.url); }
        });

        // 상단 장바구니 아이콘 — 찜/장바구니 페이지의 '장바구니' 탭으로 이동
        var btnCartTop = $('#btnCartTop');
        if (btnCartTop) btnCartTop.addEventListener('click', function () {
            location.hash = '#wishlist';
            setTimeout(function () {
                var t = document.querySelector('.wish-tab[data-wishtab="cart"]');
                if (t) t.click();
            }, 60);
        });

        // 상품 수정/삭제 (관리자) — 수정은 등록 폼(모달)을 연다
        document.addEventListener('click', function (e) {
            var ed = e.target.closest('[data-pedit]');
            var dl = e.target.closest('[data-pdel]');
            if (ed) {
                e.preventDefault(); e.stopPropagation();
                if (window.belloreEditListing) window.belloreEditListing(ed.dataset.pedit);
            } else if (dl) {
                e.preventDefault(); e.stopPropagation();
                bellConfirm('이 상품을 삭제할까요?').then(function (ok) {
                    if (!ok) return;
                    NWBackend.deleteProduct(dl.dataset.pdel)
                        .catch(function (err) { alert('삭제 실패: ' + (err && err.message || err)); });
                });
            }
        });

        // 로그인/권한 상태에 따라 벨·관리자 박스·구독 갱신
        var unsubNoti = null;
        var unsubAdmins = null;
        NWBackend.onAuthChange(function (user, info) {
            // 소셜 로그인(구글·카카오) 직후 휴대폰 미등록이면 본인인증 단계로 강제
            if (user && !(info && info.isAdmin)) {
                var pend = false; try { pend = sessionStorage.getItem('bellore_social_pending') === '1'; } catch (e) {}
                if (pend && !user.phone) {
                    try { sessionStorage.removeItem('bellore_social_pending'); } catch (e) {}
                    closeLoginModal();
                    setTimeout(function () {
                        alert('서비스 이용을 위해 휴대폰 인증이 필요합니다.');
                        if (window.BELLORE_openProfile) window.BELLORE_openProfile('phone');
                    }, 300);
                } else if (pend) { try { sessionStorage.removeItem('bellore_social_pending'); } catch (e) {} }
            }
            // 마이페이지 헤더
            var nameEl = $('#myPageName');
            var emailEl = $('#myPageEmail');
            if (nameEl) nameEl.textContent = user ? ((user.displayName || '회원') + '님') : '마이페이지';
            if (emailEl) emailEl.textContent = user ? (user.email || '') : '';
            // 계정유형(일반회원/업체/관리자)
            var roleEl = $('#myPageRole');
            if (roleEl) {
                if (!user) { roleEl.hidden = true; }
                else {
                    var rt = (info && info.isAdmin) ? '관리자' : (info && info.role === 'vendor') ? '업체회원' : '일반회원';
                    roleEl.textContent = rt; roleEl.hidden = false;
                }
            }

            // 마이포켓 헤더(고객명 · 등급 · 포인트) — 실제 프로필 데이터
            var pname = $('#pocketName');
            if (pname) pname.textContent = user ? ((user.displayName || '회원') + '님') : '고객님';
            var GRADE_LABEL = { family: 'Family', silver: 'Silver', gold: 'Gold', vip: 'VIP' };
            var gradeEl = $('#pocketGrade');
            if (gradeEl) gradeEl.textContent = (info && GRADE_LABEL[info.grade]) || 'Family';
            var pointEl = $('#pocketPoint');
            if (pointEl) pointEl.textContent = ((info && info.points) || 0).toLocaleString('ko-KR') + 'P';

            // 알림 벨
            var bell = $('#btnNoti');
            if (unsubNoti) { unsubNoti(); unsubNoti = null; }
            if (user) {
                if (bell) bell.hidden = false;
                unsubNoti = NWBackend.subscribeNotifications(function (rows) {
                    notiCache = rows;
                    var unread = rows.filter(function (n) { return !n.read; }).length;
                    updateNotiBadge(unread);
                    if (notiModal && !notiModal.hidden) renderNotiList(rows);
                });
            } else {
                if (bell) bell.hidden = true;
                notiCache = [];
                updateNotiBadge(0);
                closeMyPage();
            }

            // 관리자 관리 박스
            var adminBox = $('#adminManageBox');
            if (unsubAdmins) { unsubAdmins(); unsubAdmins = null; }
            if (info && info.isAdmin) {
                if (adminBox) { adminBox.hidden = false; adminBox.classList.add('show'); }
                unsubAdmins = NWBackend.subscribeVendors(renderVendorList);
            } else if (adminBox) {
                adminBox.hidden = true;
            }

            // 업체 전용: 새 견적 알림 설정
            var vNotifyBox = $('#vendorNotifyBox');
            if (vNotifyBox) {
                var isVendor = info && info.role === 'vendor';
                vNotifyBox.hidden = !isVendor;
                if (isVendor) {
                    var on = !(info && info.notifyQuotes === false);
                    var btn = $('#btnNotifyQuotes');
                    var st = $('#notifyQuotesState');
                    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                    if (st) st.textContent = on ? '켜짐' : '꺼짐';
                    var vipNote = $('#vendorVipNote');
                    if (vipNote) vipNote.hidden = !(info && info.vip);
                }
            }

            // 제휴사 전용: 인증센터 · 상품등록 · 정산내역
            var pBox = $('#partnerBox');
            if (pBox) {
                var isPartner = info && info.role === 'partner';
                pBox.hidden = !isPartner;
                if (isPartner) {
                    var allVerified = info.emailVerified && info.phoneVerified && info.bizVerified && info.accountVerified;
                    var vState = $('#partnerVerifyState');
                    if (vState) vState.textContent = allVerified ? '완료' : '필요';
                    var note = $('#partnerStateNote');
                    if (note) {
                        note.textContent = info.isApprovedPartner
                            ? '✓ 제휴사 승인 완료 — 상품을 등록·판매할 수 있어요. 판매대금은 수수료 제외 후 등록 계좌로 정산됩니다.'
                            : (allVerified ? '인증 완료 — 관리자 승인을 기다리는 중입니다.' : '사업자·휴대폰·계좌·이메일 인증을 완료해 주세요.');
                    }
                    var newBtn = $('#btnPartnerNewListing');
                    if (newBtn) newBtn.hidden = !info.isApprovedPartner;
                    renderMySettlements();
                }
            }
        });
    }

    // 제휴사: 내 정산내역 렌더
    function renderMySettlements() {
        var box = $('#myStlList'); if (!box || !backendOn() || !NWBackend.listMySettlements) return;
        NWBackend.listMySettlements().then(function (rows) {
            var cnt = $('#myStlCount'); if (cnt) cnt.textContent = rows.length;
            if (!rows.length) { box.innerHTML = '<p class="mypage-prodrow-empty">정산 내역이 없습니다.</p>'; return; }
            box.innerHTML = rows.map(function (s) {
                var label = s.status === 'paid' ? '입금완료' : (s.status === 'hold' ? '보류' : '정산대기');
                var cls = s.status === 'paid' ? 'stl-paid' : (s.status === 'hold' ? 'stl-hold' : 'stl-pending');
                return '<div class="stl-row">' +
                    '<div class="stl-main"><b>' + esc(s.productName || '상품') + '</b>' +
                    '<span class="stl-amt">정산 ' + fmt(s.net) + '원</span></div>' +
                    '<div class="stl-sub">판매가 ' + fmt(s.gross) + '원 · 수수료 ' + fmt(s.fee) + '원(' + Math.round((s.feeRate || 0) * 100) + '%)' +
                    ' · <span class="' + cls + '">' + label + '</span></div>' +
                    '</div>';
            }).join('');
        }).catch(function () {});
    }

    function updateNotiBadge(n) {
        [$('#notiBadge'), $('#notiBadgeTop')].forEach(function (badge) {
            if (!badge) return;
            if (n > 0) { badge.textContent = n > 99 ? '99+' : n; badge.hidden = false; }
            else badge.hidden = true;
        });
    }

    var NOTI_LABEL = {
        quote_open: '비교견적', quote_new: '비교견적 등록', bid_new: '입찰 도착', awarded: '입찰 채택', approved: '승인 완료',
        account: '계좌 인증', business: '사업자 인증', listing: '판매 매물', settlement: '정산',
        support_new: '고객센터 문의', support_reply: '고객센터 답변', info: '알림'
    };
    // 알림 종류별 색상 카테고리(비교견적/판매/고객센터)
    function notiCat(type) {
        if (type === 'quote_open' || type === 'quote_new' || type === 'bid_new' || type === 'awarded' || type === 'approved') return 'quote';
        if (type === 'listing' || type === 'settlement') return 'sale';
        if (type === 'support_new' || type === 'support_reply') return 'support';
        return 'info';
    }
    // 알림 종류별로 눌렀을 때 이동할 화면
    function notiTarget(type) {
        if (type === 'quote_open' || type === 'quote_new' || type === 'bid_new' || type === 'awarded' || type === 'approved' ||
            type === 'support_new' || type === 'support_reply') return 'cq';
        if (type === 'listing') return 'collection';
        if (type === 'settlement') return 'settlement';
        if (type === 'account' || type === 'business') return 'mypage';
        return '';
    }
    function renderNotiList(rows) {
        var el = $('#notiList');
        if (!el) return;
        if (!rows.length) { el.innerHTML = '<div class="noti-empty">알림이 없습니다.</div>'; return; }
        el.innerHTML = rows.map(function (n) {
            var label = NOTI_LABEL[n.type] || '알림';
            var go = notiTarget(n.type) ? ' has-go' : '';
            // 제목/본문 분리 표시: 제목이 있고 본문과 다르면 제목은 굵게, 본문은 보조로.
            var title = (n.title && n.title !== '알림') ? n.title : '';
            var body = n.text || '';
            if (title && body && title === body) body = '';
            var main = title
                ? '<span class="noti-title">' + esc(title) + '</span>' +
                  (body ? '<span class="noti-text">' + esc(body) + '</span>' : '')
                : '<span class="noti-text">' + esc(body || label) + '</span>';
            return '<button type="button" class="noti-item' + (n.read ? '' : ' unread') + go + '" data-nid="' + esc(n.id) +
                '" data-ntype="' + esc(n.type || '') + '" data-nref="' + esc(n.refId || '') + '">' +
                '<span class="noti-head"><span class="noti-tag cat-' + notiCat(n.type) + '">' + esc(label) + '</span>' +
                '<time>' + relTime(n.createdAt) + '</time></span>' +
                main +
                (notiTarget(n.type) ? '<span class="noti-arrow">바로가기 ›</span>' : '') +
                '</button>';
        }).join('');
        attachNotiSwipe();
    }
    // 알림 스와이프 삭제 (왼쪽으로 밀면 삭제)
    var _notiSwallowClick = false;
    function attachNotiSwipe() {
        var list = $('#notiList'); if (!list) return;
        $$('.noti-item', list).forEach(function (it) {
            if (it._swipeBound) return; it._swipeBound = true;
            var startX = 0, dx = 0, dragging = false;
            function move(x) { dx = Math.min(0, x - startX); it.style.transform = 'translateX(' + dx + 'px)'; if (dx < -10) it.classList.add('swiping'); }
            function end() {
                if (!dragging) return; dragging = false; it.style.transition = '';
                if (dx < -80) {
                    _notiSwallowClick = true;
                    var id = it.getAttribute('data-nid');
                    it.style.transform = 'translateX(-110%)'; it.style.opacity = '0';
                    setTimeout(function () {
                        notiCache = notiCache.filter(function (n) { return String(n.id) !== String(id); });
                        if (id && backendOn() && NWBackend.deleteNotification) NWBackend.deleteNotification(id).catch(function () {});
                        renderNotiList(notiCache);
                        updateNotiBadge(notiCache.filter(function (n) { return !n.read; }).length);
                    }, 180);
                } else { it.style.transform = ''; it.classList.remove('swiping'); }
            }
            it.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; dx = 0; dragging = true; it.style.transition = 'none'; }, { passive: true });
            it.addEventListener('touchmove', function (e) { if (dragging) move(e.touches[0].clientX); }, { passive: true });
            it.addEventListener('touchend', function () { if (Math.abs(dx) > 10) _notiSwallowClick = true; end(); });
        });
    }
    // 알림 클릭 → 읽음 처리 + 해당 화면으로 이동
    document.addEventListener('click', function (e) {
        var it = e.target.closest('#notiList .noti-item');
        if (!it) return;
        if (_notiSwallowClick) { _notiSwallowClick = false; e.preventDefault(); e.stopPropagation(); return; }
        var id = it.getAttribute('data-nid');
        var type = it.getAttribute('data-ntype');
        var ref = it.getAttribute('data-nref') || '';
        if (id && backendOn() && NWBackend.markNotificationRead) {
            NWBackend.markNotificationRead(id).then(function () {}, function () {});
        }
        it.classList.remove('unread');
        var tgt = notiTarget(type);
        var nm = $('#notiModal'); if (nm) { nm.hidden = true; document.body.style.overflow = ''; }
        if (tgt === 'cq') {
            if (window.CQDemo) {
                // 알림 종류별로 해당 화면으로 바로 이동(딥링크)
                var opts = null;
                // 새 비교견적 → 해당 견적 입찰 화면(딥링크)
                if (type === 'quote_open' && ref) opts = { screen: 'v-bid', id: ref };
                // 새 입찰 도착(고객) → 해당 견적 비교 결과 화면(딥링크)
                else if (type === 'bid_new' && ref) opts = { screen: 'c-bids', id: ref };
                // 입찰 채택 알림 → 채택된 견적은 더 이상 open 목록에 없으므로 업체 홈으로
                else if (type === 'awarded') opts = { screen: 'v-watches' };
                // 비교견적 등록(관리자) → 관리자 견적 현황
                else if (type === 'quote_new') opts = { screen: 'a-dash' };
                // 고객센터: 관리자는 문의 목록, 고객은 본인 채팅
                else if (type === 'support_new') opts = { screen: 'a-chats' };
                else if (type === 'support_reply') opts = { screen: 'c-chat' };
                window.CQDemo.open(opts);
            }
        } else if (tgt === 'collection') { closeMyPage(); location.hash = '#collection'; }
        else if (tgt === 'settlement') {
            // 정산 알림 → 마이페이지의 내 정산내역으로 스크롤
            var stl = $('#myStlList') || $('#partnerBox');
            if (stl && typeof stl.scrollIntoView === 'function') setTimeout(function () { stl.scrollIntoView({ behavior: 'smooth' }); }, 120);
        }
        // tgt === 'mypage' 는 알림 모달만 닫으면 마이페이지가 그대로 보임(별도 이동 불필요)
    });

    function renderVendorList(vendors) {
        _adminCache.vendors = vendors || [];
        var el = $('#adminList');
        if (!el) return;
        if (!vendors || !vendors.length) {
            el.innerHTML = '<div class="admin-list-item"><span>가입한 업체가 없습니다.</span></div>';
            return;
        }
        el.innerHTML = vendors.map(function (v) {
            var nm = esc(v.company_name || v.display_name || '(이름 없음)');
            var phoneTag = v.phone_verified ? '📱인증' : '📱미인증';
            var acct = (v.bank_name || v.bank_account)
                ? esc((v.bank_name || '') + ' ' + (v.bank_account || '') + ' (' + (v.bank_holder || '') + ')')
                : '계좌 미제출';
            var bankbook = v.bankbook_url ? ' · <a href="' + esc(v.bankbook_url) + '" target="_blank" rel="noopener">통장사본</a>' : '';
            var acctBtn = v.account_verified
                ? '<button type="button" data-acctoff="' + esc(v.id) + '">계좌인증취소</button>'
                : '<button type="button" data-accton="' + esc(v.id) + '">계좌승인</button>';
            var vipBtn = v.vip
                ? '<button type="button" data-vipoff="' + esc(v.id) + '">VIP해제</button>'
                : '<button type="button" data-vipon="' + esc(v.id) + '">VIP지정</button>';
            return '<div class="admin-list-item admin-vendor-item">' +
                '<span class="av-main">' + nm + (v.approved ? ' · 승인됨' : ' · 대기') + ' · ' + phoneTag +
                    (v.account_verified ? ' · 💳인증' : '') + (v.vip ? ' · ⭐VIP' : '') + '</span>' +
                '<span class="av-acct">' + acct + bankbook + '</span>' +
                '<span class="av-btns">' +
                    (v.approved
                        ? '<button type="button" data-vcancel="' + esc(v.id) + '">승인취소</button>'
                        : '<button type="button" data-vapprove="' + esc(v.id) + '">승인</button>') +
                    acctBtn + vipBtn +
                '</span>' +
            '</div>';
        }).join('');
    }

    /* ============ 쿠폰 ============ */
    function couponValueText(c) {
        if (!c) return '';
        return c.discount_type === 'percent' ? (c.discount_value + '%') : (fmt(c.discount_value) + '원');
    }
    function couponApplyLabel(a) {
        return a === 'order' ? '구매결제' : a === 'commission' ? '위탁수수료' : '구매+수수료';
    }
    function couponMetaText(c) {
        var parts = [couponApplyLabel(c.apply_to)];
        if (c.min_order) parts.push(fmt(c.min_order) + '원 이상');
        if (c.discount_type === 'percent' && c.max_discount) parts.push('최대 ' + fmt(c.max_discount) + '원');
        if (c.expires_at) parts.push('~' + String(c.expires_at).slice(0, 10));
        return parts.join(' · ');
    }
    function couponExpired(c) { return !!(c && c.expires_at && new Date(c.expires_at).getTime() < Date.now()); }

    function myCouponCardHtml(uc) {
        var c = uc.coupon || {};
        var used = uc.status === 'used';
        var expired = !used && couponExpired(c);
        var cls = 'coupon-card' + (used ? ' used' : '') + (expired ? ' expired' : '');
        return '<div class="' + cls + '">' +
            '<div class="cc-val">' + couponValueText(c) + '</div>' +
            '<div class="cc-body"><strong>' + esc(c.title || '쿠폰') + '</strong>' +
            '<span>' + esc(couponMetaText(c)) + '</span></div>' +
            (used ? '<span class="cc-tag">사용완료</span>' : expired ? '<span class="cc-tag">기간만료</span>' : '') +
            '</div>';
    }

    // 마이페이지: 장바구니 · 최근 본 상품 (이미지와 함께 가로 스크롤)
    function miniProdCard(it) {
        var img = it.img || it.image || (it.photos && it.photos[0]) || 'assets/images.jpg';
        var price = parseInt(it.sale_price, 10) > 0 ? parseInt(it.sale_price, 10) : (parseInt(it.price, 10) || 0);
        var priceTxt = price > 0 ? (fmt(price) + '원') : '가격문의';
        return '<button type="button" class="mypc" data-mypid="' + esc(String(it.id || '')) + '" ' +
            'data-brand="' + esc(it.brand || '') + '" data-model="' + esc(it.model || '') + '" ' +
            'data-price="' + esc(String(it.price || 0)) + '" data-sprice="' + esc(String(it.sale_price || '')) + '">' +
            '<span class="mypc-img"><img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'"></span>' +
            '<span class="mypc-brand">' + esc(it.brand || '') + '</span>' +
            '<span class="mypc-model">' + esc(it.model || '') + '</span>' +
            '<span class="mypc-price">' + priceTxt + '</span>' +
        '</button>';
    }
    function renderMyShortcuts() {
        // 장바구니
        var cart = (window.BELLOREWishlist && window.BELLOREWishlist.getCart) ? (window.BELLOREWishlist.getCart() || []) : [];
        var cRow = $('#myCartRow'), cEmpty = $('#myCartEmpty'), cCnt = $('#myCartCount');
        if (cCnt) { cCnt.textContent = cart.length; cCnt.hidden = cart.length === 0; }
        if (cRow) cRow.innerHTML = cart.map(miniProdCard).join('');
        if (cEmpty) cEmpty.hidden = cart.length > 0;
        // 최근 본 상품
        var recent = (window.BELLORE_getViewed && window.BELLORE_getViewed()) || [];
        var rRow = $('#myRecentRow'), rEmpty = $('#myRecentEmpty');
        if (rRow) rRow.innerHTML = recent.map(miniProdCard).join('');
        if (rEmpty) rEmpty.hidden = recent.length > 0;
    }

    function renderMyCoupons() {
        var sec = $('#myCouponSection');
        if (!sec || !backendOn() || !NWBackend.myCoupons) { if (sec) sec.hidden = true; return; }
        NWBackend.myCoupons().then(function (list) {
            var ownedIds = list.map(function (u) { return u.couponId; });
            var active = list.filter(function (u) { return u.status === 'active' && u.coupon && !couponExpired(u.coupon); });
            var cnt = $('#myCouponCount'); if (cnt) cnt.textContent = active.length;
            var pcoup = $('#pocketCoupon'); if (pcoup) { pcoup.textContent = active.length; pcoup.hidden = active.length === 0; }
            var el = $('#myCouponList');
            if (el) {
                el.innerHTML = list.length
                    ? list.map(myCouponCardHtml).join('')
                    : '<p class="coupon-empty">보유한 쿠폰이 없습니다.</p>';
            }
            renderDownloadable(ownedIds);
        }).catch(function () {});
    }

    function renderDownloadable(ownedIds) {
        var box = $('#downloadableCoupons');
        if (!box || !NWBackend.downloadableCoupons) return;
        NWBackend.downloadableCoupons().then(function (list) {
            var avail = (list || []).filter(function (c) { return ownedIds.indexOf(c.id) < 0; });
            if (!avail.length) { box.innerHTML = ''; return; }
            box.innerHTML = '<h5 class="coupon-sub">받을 수 있는 쿠폰</h5>' + avail.map(function (c) {
                return '<div class="coupon-card down' + (c.image_url ? ' has-img' : '') + '">' +
                    (c.image_url ? '<button type="button" class="cc-img" data-cpget="' + esc(c.id) + '"><img src="' + esc(c.image_url) + '" alt="' + esc(c.title) + '" loading="lazy"></button>' : '') +
                    '<div class="cc-val">' + couponValueText(c) + '</div>' +
                    '<div class="cc-body"><strong>' + esc(c.title) + '</strong>' +
                    '<span>' + esc(couponMetaText(c)) + '</span></div>' +
                    '<button type="button" class="cc-get" data-cpget="' + esc(c.id) + '">받기</button></div>';
            }).join('');
        }).catch(function () {});
    }

    function couponKindOf(c) {
        return c.kind || (c.auto_grant ? 'auto' : (c.code ? 'code' : (c.downloadable ? 'image' : 'code')));
    }
    function couponKindLabel(c) {
        var k = couponKindOf(c);
        return k === 'auto' ? '가입 자동지급' : k === 'image' ? '이미지 다운로드' : '코드입력';
    }
    var _adminCouponKind = 'all';
    var _adminCouponCache = [];
    function paintAdminCoupons() {
        var el = $('#adminCouponList');
        if (!el) return;
        var list = _adminCouponCache.filter(function (c) {
            return _adminCouponKind === 'all' || couponKindOf(c) === _adminCouponKind;
        });
        el.innerHTML = list.length ? list.map(function (c) {
            return '<button type="button" class="cpadm-card' + (c.active ? '' : ' off') + '" data-cpedit="' + esc(c.id) + '">' +
                '<span class="cpadm-kind k-' + couponKindOf(c) + '">' + couponKindLabel(c) + '</span>' +
                '<span class="cpadm-card-main">' +
                    '<b>' + esc(c.title) + '</b>' +
                    '<span class="cpadm-card-sub">' + couponValueText(c) + (c.code ? ' · ' + esc(c.code) : '') + (c.active ? '' : ' · 사용중지') + '</span>' +
                '</span>' +
                '<span class="cpadm-card-arrow">›</span>' +
            '</button>';
        }).join('') : '<div class="admin-list-item"><span>쿠폰이 없습니다.</span></div>';
    }
    function renderAdminCoupons() {
        var el = $('#adminCouponList');
        if (!el || !NWBackend.listCoupons) return;
        NWBackend.listCoupons().then(function (list) {
            _adminCouponCache = list || [];
            paintAdminCoupons();
        }).catch(function () {});
    }

    function initCoupons() {
        if (!backendOn() || !NWBackend.onAuthChange) return;
        window.belloreRefreshCoupons = renderMyCoupons;
        var cpEditId = null;
        var _pendingCouponLink = null;

        // 코드 등록(마이페이지)
        var codeBtn = $('#couponCodeBtn');
        if (codeBtn) codeBtn.addEventListener('click', function () {
            var code = ($('#couponCodeInput').value || '').trim();
            if (!code) { alert('쿠폰 코드를 입력해 주세요.'); return; }
            codeBtn.disabled = true;
            NWBackend.claimCouponByCode(code).then(function () {
                $('#couponCodeInput').value = '';
                alert('쿠폰이 등록되었습니다.');
                renderMyCoupons();
            }).catch(function (e) { alert(couponClaimErr(e)); })
                .then(function () { codeBtn.disabled = false; });
        });

        // 쿠폰 받기/삭제/토글 (위임)
        document.addEventListener('click', function (e) {
            var get = e.target.closest('[data-cpget]');
            var del = e.target.closest('[data-cpdel]');
            var tg = e.target.closest('[data-cptoggle]');
            var ed = e.target.closest('[data-cpedit]');
            if (ed) {
                NWBackend.getCoupon(ed.dataset.cpedit).then(openCouponPage)
                    .catch(function (err) { alert('불러오기 실패: ' + (err && err.message || err)); });
            } else if (get) {
                get.disabled = true;
                NWBackend.claimCoupon(get.dataset.cpget).then(function () {
                    alert('쿠폰을 받았습니다.'); renderMyCoupons();
                }).catch(function (err) { alert(couponClaimErr(err)); get.disabled = false; });
            } else if (del) {
                bellConfirm('이 쿠폰을 삭제할까요?').then(function (ok) {
                    if (!ok) return;
                    NWBackend.deleteCoupon(del.dataset.cpdel)
                        .then(renderAdminCoupons).catch(function (err) { alert('삭제 실패: ' + (err && err.message || err)); });
                });
            } else if (tg) {
                NWBackend.setCouponActive(tg.dataset.cptoggle, tg.dataset.on !== '1')
                    .then(renderAdminCoupons).catch(function (err) { alert('변경 실패: ' + (err && err.message || err)); });
            }
        });

        // ===== 쿠폰 만들기/수정 페이지 (관리자) =====
        var cpPage = $('#couponPage');
        function cpShareUrl(id) { return location.origin + location.pathname + '?coupon=' + id; }
        function cpSelectedKind() {
            var r = cpPage ? cpPage.querySelector('input[name="cp_kind"]:checked') : null;
            return r ? r.value : 'code';
        }
        function cpUpdateImgPreview() {
            var inp = $('#cpImageUrl'); var url = (inp && inp.value || '').trim();
            var wrap = $('#cpImgPreview'), img = $('#cpImgPreviewImg');
            if (wrap && img) { if (url) { img.src = url; wrap.hidden = false; } else { wrap.hidden = true; } }
        }
        function cpApplyKindUI() {
            if (!cpPage) return;
            var k = cpSelectedKind();
            var codeRow = cpPage.querySelector('.cp-row-code');
            var imgRow = cpPage.querySelector('.cp-row-image');
            if (codeRow) codeRow.style.display = (k === 'code') ? '' : 'none';
            if (imgRow) imgRow.style.display = (k === 'image') ? '' : 'none';
            var shareWrap = $('#cpShareWrap');
            if (shareWrap) shareWrap.hidden = !(k === 'image' && cpEditId);
        }
        function closeCouponPage() { if (cpPage) { cpPage.hidden = true; document.body.style.overflow = ''; } }
        window.openCouponPage = function (c) {
            if (!cpPage) return;
            cpEditId = c ? c.id : null;
            $('#cpPageTitle').textContent = c ? '쿠폰 수정' : '쿠폰 만들기';
            $('#cpSave').textContent = c ? '수정 저장' : '쿠폰 저장';
            var kind = c ? couponKindOf(c) : 'code';
            var kr = cpPage.querySelector('input[name="cp_kind"][value="' + kind + '"]');
            if (kr) kr.checked = true;
            $('#cpTitle').value = c ? (c.title || '') : '';
            $('#cpType').value = c ? (c.discount_type || 'amount') : 'amount';
            $('#cpValue').value = c ? (c.discount_value || '') : '';
            $('#cpMax').value = c && c.max_discount ? c.max_discount : '';
            $('#cpMin').value = c && c.min_order ? c.min_order : '';
            $('#cpApply').value = c ? (c.apply_to || 'both') : 'both';
            $('#cpCode').value = c ? (c.code || '') : '';
            $('#cpImageUrl').value = c ? (c.image_url || '') : '';
            $('#cpPerUser').value = c ? (c.per_user_limit || 1) : 1;
            $('#cpLimit').value = c && c.usage_limit ? c.usage_limit : '';
            $('#cpExpires').value = c && c.expires_at ? String(c.expires_at).slice(0, 10) : '';
            var cpAct = $('#cpActive'); if (cpAct) cpAct.checked = c ? (c.active !== false) : true;
            var cpDel = $('#cpDelete'); if (cpDel) cpDel.hidden = !cpEditId;
            if (cpEditId) { var sl = $('#cpShareLink'); if (sl) sl.value = cpShareUrl(cpEditId); }
            cpUpdateImgPreview();
            cpApplyKindUI();
            cpPage.hidden = false; document.body.style.overflow = 'hidden';
            var sc = cpPage.querySelector('.pp-scroll'); if (sc) sc.scrollTop = 0;
        };

        var addBtn = $('#adminAddCouponBtn');
        if (addBtn) addBtn.addEventListener('click', function () { window.openCouponPage(null); });

        // 쿠폰 종류 탭
        var cpTabs = $('#cpAdmTabs');
        if (cpTabs) cpTabs.addEventListener('click', function (e) {
            var t = e.target.closest('[data-cpkind]'); if (!t) return;
            _adminCouponKind = t.dataset.cpkind;
            Array.prototype.forEach.call(cpTabs.querySelectorAll('.cpadm-tab'), function (b) { b.classList.toggle('on', b === t); });
            paintAdminCoupons();
        });

        if (cpPage) {
            cpPage.addEventListener('click', function (e) { if (e.target.closest('[data-cpclose]')) closeCouponPage(); });
            cpPage.addEventListener('change', function (e) { if (e.target.name === 'cp_kind') cpApplyKindUI(); });
            var imgInp = $('#cpImageUrl'); if (imgInp) imgInp.addEventListener('input', cpUpdateImgPreview);
            var copyBtn = $('#cpCopyLink');
            if (copyBtn) copyBtn.addEventListener('click', function () {
                var t = $('#cpShareLink'); if (!t) return;
                t.select();
                if (navigator.clipboard) { navigator.clipboard.writeText(t.value).catch(function () {}); }
                else { try { document.execCommand('copy'); } catch (e) {} }
                copyBtn.textContent = '복사됨'; setTimeout(function () { copyBtn.textContent = '복사'; }, 1500);
            });
            var saveBtn = $('#cpSave');
            if (saveBtn) saveBtn.addEventListener('click', function () {
                var title = ($('#cpTitle').value || '').trim();
                var value = parseInt($('#cpValue').value, 10) || 0;
                var kind = cpSelectedKind();
                if (!title || value <= 0) { alert('쿠폰 이름과 할인 값을 입력해 주세요.'); return; }
                if (kind === 'code' && !($('#cpCode').value || '').trim()) { alert('코드입력 쿠폰은 쿠폰 코드를 입력해 주세요.'); return; }
                if (kind === 'image' && !($('#cpImageUrl').value || '').trim()) { alert('이미지 다운로드 쿠폰은 이미지 URL을 입력해 주세요.'); return; }
                var payload = {
                    title: title,
                    discountType: $('#cpType').value,
                    discountValue: value,
                    maxDiscount: parseInt($('#cpMax').value, 10) || null,
                    minOrder: parseInt($('#cpMin').value, 10) || 0,
                    applyTo: $('#cpApply').value,
                    kind: kind,
                    code: kind === 'code' ? (($('#cpCode').value || '').trim() || null) : null,
                    imageUrl: kind === 'image' ? (($('#cpImageUrl').value || '').trim() || null) : null,
                    downloadable: kind === 'image',
                    autoGrant: kind === 'auto',
                    perUserLimit: parseInt($('#cpPerUser').value, 10) || 1,
                    usageLimit: parseInt($('#cpLimit').value, 10) || null,
                    expiresAt: $('#cpExpires').value ? new Date($('#cpExpires').value + 'T23:59:59').toISOString() : null,
                    active: $('#cpActive') ? $('#cpActive').checked : true
                };
                saveBtn.disabled = true;
                var op = cpEditId ? NWBackend.updateCoupon(cpEditId, payload) : NWBackend.createCoupon(payload);
                op.then(function () {
                    closeCouponPage();
                    alert(cpEditId ? '쿠폰을 수정했습니다.' : '쿠폰을 생성했습니다.');
                    renderAdminCoupons(); renderMyCoupons();
                }).catch(function (err) { alert('저장 실패: ' + (err && err.message || err)); })
                    .then(function () { saveBtn.disabled = false; });
            });
            var delBtn = $('#cpDelete');
            if (delBtn) delBtn.addEventListener('click', function () {
                if (!cpEditId) return;
                bellConfirm('이 쿠폰을 삭제할까요? 되돌릴 수 없습니다.').then(function (ok) {
                    if (!ok) return;
                    delBtn.disabled = true;
                    NWBackend.deleteCoupon(cpEditId).then(function () {
                        closeCouponPage(); alert('쿠폰을 삭제했습니다.'); renderAdminCoupons(); renderMyCoupons();
                    }).catch(function (err) { alert('삭제 실패: ' + (err && err.message || err)); })
                        .then(function () { delBtn.disabled = false; });
                });
            });
        }

        // ===== 이미지 쿠폰 링크(?coupon=ID) 자동 다운로드 =====
        function cleanCouponParam() {
            try {
                var s = location.search.replace(/([?&])coupon=[^&]*/, '$1').replace(/[?&]+$/, '').replace(/[?&]&/, '?');
                history.replaceState(null, '', location.pathname + (s && s !== '?' ? s : '') + location.hash);
            } catch (e) {}
        }
        var cm = /[?&]coupon=([^&#]+)/.exec(location.search);
        if (cm) _pendingCouponLink = decodeURIComponent(cm[1]);
        window._belloreClaimPendingCoupon = function (user) {
            if (!_pendingCouponLink) return;
            if (user) {
                var pid = _pendingCouponLink; _pendingCouponLink = null;
                NWBackend.claimCoupon(pid).then(function () {
                    alert('쿠폰이 발급되었습니다. 마이페이지 > 내 쿠폰에서 확인하세요.');
                    renderMyCoupons();
                }).catch(function (e) { alert(couponClaimErr(e)); }).then(cleanCouponParam);
            } else {
                alert('로그인 후 쿠폰을 받을 수 있어요. 로그인해 주세요.');
                openLoginModal();
            }
        };

        NWBackend.onAuthChange(function (user, info) {
            if (window._belloreClaimPendingCoupon) window._belloreClaimPendingCoupon(user);
            var adminBox = $('#adminCouponBox');
            if (adminBox) {
                var isAdmin = !!(info && info.isAdmin);
                adminBox.hidden = !isAdmin;
                if (isAdmin) renderAdminCoupons();
            }
            var mySec = $('#myCouponSection');
            if (mySec) mySec.hidden = !user;
            if (user) renderMyCoupons();
            else {
                var el = $('#myCouponList'); if (el) el.innerHTML = '';
                var dl = $('#downloadableCoupons'); if (dl) dl.innerHTML = '';
            }
        });
    }

    /* ============ 주문 상세 (고객) ============ */
    var _orderCache = null;        // 현재 보고 있는 주문
    var _returnOrder = null;       // 교환/반품 대상 주문
    var _orderBound = false;

    function setBodyScrollLock(on) { document.body.style.overflow = on ? 'hidden' : ''; }

    function orderTimelineHtml(o) {
        var stamp = { paid: o.paidAt, shipping: o.shippedAt, delivered: o.deliveredAt, confirmed: o.confirmedAt };
        var idx = O_FLOW.indexOf(o.status);
        // 비정상 상태(취소/반품 등)는 진행바 대신 안내만
        var abnormal = idx < 0;
        return '<ol class="op-timeline' + (abnormal ? ' op-timeline--off' : '') + '">' +
            O_FLOW.map(function (st, i) {
                var done = !abnormal && i <= idx;
                var dt = stamp[st] ? fmtDate(stamp[st]) : '';
                return '<li class="' + (done ? 'on' : '') + '"><span class="op-dot"></span>' +
                    '<span class="op-step">' + O_FLOW_LABEL[st] + (dt ? '<em>' + dt + '</em>' : '') + '</span></li>';
            }).join('') + '</ol>';
    }

    function orderActionsHtml(o) {
        var btns = [];
        if (o.status === 'delivered') btns.push('<button class="op-btn op-btn--main" data-oconfirm>구매확정</button>');
        if (['delivered', 'confirmed'].indexOf(o.status) >= 0) btns.push('<button class="op-btn" data-oreturn>교환 · 반품</button>');
        if (['pending', 'paid', 'inspecting', 'preparing'].indexOf(o.status) >= 0) btns.push('<button class="op-btn op-btn--danger" data-ocancel>주문취소</button>');
        return btns.join('');
    }

    function renderOrderDetail(o) {
        _orderCache = o;
        var body = $('#orderPageBody'); if (!body) return;
        var img = o.productImage || 'assets/images.jpg';
        var st = o.status || 'pending';
        var addr = o.shipAddr1 ? (esc(o.shipAddr1) + ' ' + esc(o.shipAddr2 || '')) : '';
        var track = (o.courier && o.trackingNo) ? trackUrl(o.courier, o.trackingNo) : '';

        var html = '' +
            '<div class="op-head">' +
                '<div class="op-thumb"><img src="' + esc(img) + '" alt=""></div>' +
                '<div class="op-headinfo">' +
                    (o.productBrand ? '<p class="op-brand">' + esc(o.productBrand) + '</p>' : '') +
                    '<p class="op-name">' + esc(o.productName || '상품') + '</p>' +
                    '<span class="order-badge order-badge--' + st + '">' + (O_LABEL[st] || st) + '</span>' +
                '</div>' +
            '</div>' +
            orderTimelineHtml(o) +
            '<div class="op-sec"><h4>결제 정보</h4>' +
                '<div class="op-row"><span>주문번호</span><b>' + esc(o.orderNo) + '</b></div>' +
                '<div class="op-row"><span>주문일시</span><b>' + (fmtDate(o.createdAt) || '-') + '</b></div>' +
                '<div class="op-row"><span>결제방식</span><b>' + (o.payType === 'full' ? '전액 결제' : '예약금 결제') + '</b></div>' +
                (o.discount ? '<div class="op-row"><span>쿠폰할인</span><b>-' + fmt(o.discount) + '원</b></div>' : '') +
                '<div class="op-row op-row--total"><span>결제금액</span><b>' + fmt(o.amount) + '원</b></div>' +
                (o.receiptUrl ? '<a class="op-receipt" href="' + esc(o.receiptUrl) + '" target="_blank" rel="noopener">영수증 보기</a>' : '') +
            '</div>' +
            (addr ?
            '<div class="op-sec"><h4>배송지</h4>' +
                '<div class="op-row"><span>받는 분</span><b>' + esc(o.shipRecipient || o.buyerName || '') + '</b></div>' +
                '<div class="op-row"><span>연락처</span><b>' + esc(o.shipPhone || o.buyerPhone || '') + '</b></div>' +
                '<div class="op-row"><span>주소</span><b>(' + esc(o.shipPostcode || '') + ') ' + addr + '</b></div>' +
                (o.shipRequest ? '<div class="op-row"><span>요청사항</span><b>' + esc(o.shipRequest) + '</b></div>' : '') +
            '</div>' : '') +
            ((o.courier || o.trackingNo) ?
            '<div class="op-sec"><h4>배송 조회</h4>' +
                '<div class="op-row"><span>택배사</span><b>' + esc(o.courier || '-') + '</b></div>' +
                '<div class="op-row"><span>운송장</span><b>' + esc(o.trackingNo || '-') + '</b></div>' +
                (track ? '<a class="op-track" href="' + track + '" target="_blank" rel="noopener">배송 조회하기</a>' :
                    (o.trackingNo ? '<p class="op-track-note">' + esc(o.courier || '') + ' 고객센터로 조회해 주세요.</p>' : '')) +
            '</div>' : '') +
            (o.cancelReason ? '<div class="op-sec"><h4>취소/반품 사유</h4><p class="op-memo">' + esc(o.cancelReason) + '</p></div>' : '');

        body.innerHTML = html;
        var act = $('#orderPageActions');
        if (act) act.innerHTML = orderActionsHtml(o);
    }

    function openOrderDetail(orderNo) {
        var pg = $('#orderPage'); if (!pg) return;
        var cached = myOrdersCache.filter(function (x) { return x.orderNo === orderNo; })[0];
        if (cached) renderOrderDetail(cached);
        pg.hidden = false; setBodyScrollLock(true);
        var sc = pg.querySelector('.pp-scroll'); if (sc) sc.scrollTop = 0;
        // 최신 데이터로 갱신
        if (backendOn() && NWBackend.getOrder) {
            NWBackend.getOrder(orderNo).then(renderOrderDetail).catch(function () {});
        }
    }
    function closeOrderDetail() { var pg = $('#orderPage'); if (pg) pg.hidden = true; setBodyScrollLock(true); }

    /* ============ 교환/반품 신청 (고객) ============ */
    var _rpFiles = [];
    function openReturnPage(o) {
        _returnOrder = o; _rpFiles = [];
        var pg = $('#returnPage'); if (!pg) return;
        var info = $('#rpOrderInfo');
        if (info) info.innerHTML = '<p class="rp-pn">' + esc(o.productName || '상품') + '</p>' +
            '<p class="rp-on">' + esc(o.orderNo) + ' · ' + fmt(o.amount) + '원</p>';
        var rd = $('#rpDetail'); if (rd) rd.value = '';
        var th = $('#rpThumbs'); if (th) th.innerHTML = '';
        var fp = $('#rpPhotos'); if (fp) fp.value = '';
        var rt = pg.querySelector('input[name="rp_type"][value="return"]'); if (rt) rt.checked = true;
        pg.hidden = false; setBodyScrollLock(true);
        var sc = pg.querySelector('.pp-scroll'); if (sc) sc.scrollTop = 0;
    }
    function closeReturnPage() { var pg = $('#returnPage'); if (pg) pg.hidden = true; setBodyScrollLock(true); }

    function initOrderUI() {
        if (_orderBound) return; _orderBound = true;
        document.addEventListener('click', function (e) {
            if (e.target.closest('[data-opclose]')) { closeOrderDetail(); return; }
            if (e.target.closest('[data-rpclose]')) { closeReturnPage(); return; }
            // 구매확정
            if (e.target.closest('[data-oconfirm]')) {
                if (!_orderCache) return;
                bellConfirm('구매를 확정하시겠어요? 확정 후에는 교환/반품이 제한될 수 있습니다.').then(function (ok) {
                    if (!ok) return;
                    NWBackend.confirmReceipt(_orderCache.orderNo).then(function () {
                        alert('구매가 확정되었습니다.'); return NWBackend.getOrder(_orderCache.orderNo).then(renderOrderDetail);
                    }).catch(function () { alert('처리에 실패했습니다. 잠시 후 다시 시도해 주세요.'); });
                });
                return;
            }
            // 주문취소
            if (e.target.closest('[data-ocancel]')) {
                if (!_orderCache) return;
                bellPrompt('주문을 취소합니다. 사유를 입력해 주세요.', '단순 변심').then(function (reason) {
                    if (reason === null) return;
                    NWBackend.requestCancel(_orderCache.orderNo, reason).then(function (newSt) {
                        alert(newSt === 'canceled' ? '주문이 취소되었습니다.' : '취소 요청이 접수되었습니다. 환불은 확인 후 진행됩니다.');
                        return NWBackend.getOrder(_orderCache.orderNo).then(renderOrderDetail);
                    }).catch(function (err) {
                        var m = (err && (err.message || err.code)) || '';
                        alert(/BAD_STATE/.test(m) ? '현재 단계에서는 취소할 수 없습니다. 교환·반품을 이용해 주세요.' : '취소에 실패했습니다.');
                    });
                });
                return;
            }
            // 교환/반품 열기
            if (e.target.closest('[data-oreturn]')) {
                if (_orderCache) openReturnPage(_orderCache);
                return;
            }
        });

        // 반품 사진 선택
        var fp = $('#rpPhotos');
        if (fp) fp.addEventListener('change', function () {
            _rpFiles = Array.prototype.slice.call(fp.files || []).slice(0, 5);
            var th = $('#rpThumbs');
            if (th) th.innerHTML = _rpFiles.map(function (f) {
                return '<span class="rp-thumb">' + esc(f.name) + '</span>';
            }).join('');
        });

        // 반품 제출
        var sub = $('#rpSubmit');
        if (sub) sub.addEventListener('click', function () {
            if (!_returnOrder) return;
            var pg = $('#returnPage');
            var type = (pg.querySelector('input[name="rp_type"]:checked') || {}).value || 'return';
            var reason = ($('#rpReason').value) || '';
            var detail = ($('#rpDetail').value || '').trim();
            sub.disabled = true; sub.textContent = '접수 중...';
            var up = (_rpFiles.length && NWBackend.uploadPhotos)
                ? NWBackend.uploadPhotos(_rpFiles, 5) : Promise.resolve([]);
            up.then(function (photos) {
                return NWBackend.createReturn({ orderNo: _returnOrder.orderNo, type: type, reason: reason, detail: detail, photos: photos });
            }).then(function () {
                alert('접수되었습니다. 확인 후 회수 안내를 드리겠습니다.');
                closeReturnPage();
                if (_orderCache) NWBackend.getOrder(_orderCache.orderNo).then(renderOrderDetail).catch(function () {});
            }).catch(function (err) {
                var m = (err && (err.message || err.code)) || '';
                alert(/BAD_STATE/.test(m) ? '배송완료 후에만 신청할 수 있습니다.' : '접수에 실패했습니다. 다시 시도해 주세요.');
            }).then(function () { sub.disabled = false; sub.textContent = '신청하기'; });
        });
    }

    /* ============ 관리자: 주문/배송 관리 ============ */
    var _aOrdersUnsub = null, _aOrdersCache = [], _aOrderFilter = '';
    var _aReturnsUnsub = null, _aReturnsCache = [];
    var _aOrderEditing = null, _adminOrderBound = false;
    var ADMIN_STATUSES = ['paid', 'inspecting', 'preparing', 'shipping', 'delivered', 'confirmed', 'cancel_req', 'canceled', 'refunded'];

    function isToday(ts) {
        var ms = (ts && ts.toMillis) ? ts.toMillis() : (ts && ts.seconds ? ts.seconds * 1000 : Date.parse(ts));
        if (!ms || isNaN(ms)) return false;
        var now = new Date(), d = new Date(ms);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    }
    function renderAdminOrders() {
        var box = $('#adminOrderList'); if (!box) return;
        var rows;
        if (_aOrderFilter === 'today') rows = _aOrdersCache.filter(function (o) { return isToday(o.createdAt); });
        else if (_aOrderFilter) rows = _aOrdersCache.filter(function (o) { return o.status === _aOrderFilter; });
        else rows = _aOrdersCache;
        if (!rows.length) { box.innerHTML = '<p class="admin-empty">해당 주문이 없습니다.</p>'; return; }
        box.innerHTML = rows.map(function (o) {
            var st = o.status || 'pending';
            return '<button type="button" class="aord-card" data-aoedit="' + esc(o.orderNo) + '">' +
                '<div class="aord-main"><b>' + esc(o.productName || '상품') + '</b>' +
                '<span>' + esc(o.orderNo) + ' · ' + (fmtDate(o.createdAt) || '') + '</span>' +
                '<span>' + esc(o.buyerName || '') + ' · ' + fmt(o.amount) + '원</span></div>' +
                '<span class="order-badge order-badge--' + st + '">' + (O_LABEL[st] || st) + '</span>' +
                '</button>';
        }).join('');
    }

    function renderAdminOrderEditor(o) {
        _aOrderEditing = o;
        var body = $('#adminOrderBody'); if (!body) return;
        var addr = o.shipAddr1 ? ('(' + esc(o.shipPostcode || '') + ') ' + esc(o.shipAddr1) + ' ' + esc(o.shipAddr2 || '')) : '미입력';
        body.innerHTML = '' +
            '<div class="op-sec"><h4>' + esc(o.productName || '상품') + '</h4>' +
                '<div class="op-row"><span>주문번호</span><b>' + esc(o.orderNo) + '</b></div>' +
                '<div class="op-row"><span>주문자</span><b>' + esc(o.buyerName || '') + ' / ' + esc(o.buyerPhone || '') + '</b></div>' +
                '<div class="op-row"><span>결제금액</span><b>' + fmt(o.amount) + '원 (' + (o.payType === 'full' ? '전액' : '예약금') + ')</b></div>' +
                '<div class="op-row"><span>배송지</span><b>' + addr + '</b></div>' +
                (o.shipRequest ? '<div class="op-row"><span>요청</span><b>' + esc(o.shipRequest) + '</b></div>' : '') +
            '</div>' +
            '<div class="cp-field"><label>주문 상태</label><select id="aopStatus">' +
                ADMIN_STATUSES.map(function (s) { return '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' + (O_LABEL[s] || s) + '</option>'; }).join('') +
            '</select></div>' +
            '<div class="cp-field"><label>택배사</label><select id="aopCourier">' +
                '<option value="">선택</option>' +
                Object.keys(COURIERS).map(function (c) { return '<option value="' + c + '"' + (c === o.courier ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
            '</select></div>' +
            '<div class="cp-field"><label>운송장번호 <em class="cp-hint">입력 시 자동으로 배송중 처리</em></label>' +
                '<input type="text" id="aopTracking" value="' + esc(o.trackingNo || '') + '" placeholder="숫자만"></div>' +
            '<div class="cp-field"><label>관리자 메모</label><textarea id="aopMemo" rows="2">' + esc(o.adminMemo || '') + '</textarea></div>' +
            '<button type="button" class="cp-del-btn" id="aopRefund">결제 취소 / 환불</button>';
    }

    function openAdminOrderPage(orderNo) {
        var o = _aOrdersCache.filter(function (x) { return x.orderNo === orderNo; })[0];
        if (!o) return;
        renderAdminOrderEditor(o);
        var pg = $('#adminOrderPage'); if (!pg) return;
        pg.hidden = false; setBodyScrollLock(true);
        var sc = pg.querySelector('.pp-scroll'); if (sc) sc.scrollTop = 0;
    }
    function closeAdminOrderPage() { var pg = $('#adminOrderPage'); if (pg) pg.hidden = true; setBodyScrollLock(true); }

    var RR_LABEL = { requested: '접수', approved: '승인', rejected: '거절', collecting: '회수중', done: '완료' };
    function renderAdminReturns() {
        var box = $('#adminReturnList'); if (!box) return;
        if (!_aReturnsCache.length) { box.innerHTML = '<p class="admin-empty">교환/반품 요청이 없습니다.</p>'; return; }
        box.innerHTML = _aReturnsCache.map(function (r) {
            var ord = _aOrdersCache.filter(function (o) { return o.id === r.orderId; })[0];
            var photos = (r.photos || []).map(function (u) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener" class="rr-ph"><img src="' + esc(u) + '"></a>'; }).join('');
            return '<div class="rr-card" data-rr="' + esc(r.id) + '">' +
                '<div class="rr-top"><b>' + (r.rtype === 'exchange' ? '교환' : '반품') + '</b>' +
                '<span class="rr-st rr-st--' + r.status + '">' + (RR_LABEL[r.status] || r.status) + '</span></div>' +
                '<p class="rr-pn">' + esc(ord ? ord.productName : '') + '</p>' +
                '<p class="rr-reason">' + esc(r.reason || '') + (r.detail ? ' · ' + esc(r.detail) : '') + '</p>' +
                (photos ? '<div class="rr-photos">' + photos + '</div>' : '') +
                '<div class="rr-acts">' +
                    '<button type="button" data-rract="approved" data-rrid="' + esc(r.id) + '">승인</button>' +
                    '<button type="button" data-rract="collecting" data-rrid="' + esc(r.id) + '">회수중</button>' +
                    '<button type="button" data-rract="done" data-rrid="' + esc(r.id) + '">완료</button>' +
                    '<button type="button" class="rr-rej" data-rract="rejected" data-rrid="' + esc(r.id) + '">거절</button>' +
                '</div></div>';
        }).join('');
    }

    function initAdminOrderUI() {
        if (_adminOrderBound) return; _adminOrderBound = true;
        // 주문 카드 클릭 → 편집 / 상태탭 / 저장 / 환불
        document.addEventListener('click', function (e) {
            if (e.target.closest('[data-aopclose]')) { closeAdminOrderPage(); return; }
            var card = e.target.closest('[data-aoedit]');
            if (card) { openAdminOrderPage(card.dataset.aoedit); return; }
            var tab = e.target.closest('#aordTabs [data-aord]');
            if (tab) {
                _aOrderFilter = tab.dataset.aord || '';
                $$('#aordTabs .cpadm-tab').forEach(function (t) { t.classList.toggle('on', t === tab); });
                renderAdminOrders(); return;
            }
            if (e.target.closest('#aopRefund')) {
                if (!_aOrderEditing) return;
                bellConfirm('이 주문을 환불 처리할까요? 토스 결제건은 실제 취소가 진행됩니다.').then(function (ok) {
                    if (!ok) return;
                    NWBackend.adminRefund(_aOrderEditing, '관리자 환불').then(function (res) {
                        if (res && (res.ok || res.alreadyRefunded)) { alert('환불 처리되었습니다.'); closeAdminOrderPage(); }
                        else alert('환불 실패: ' + ((res && res.error) || '알 수 없는 오류'));
                    }).catch(function () { alert('환불 처리 중 오류가 발생했습니다.'); });
                });
                return;
            }
            // 교환/반품 처리
            var rract = e.target.closest('[data-rract]');
            if (rract) {
                var id = rract.dataset.rrid, act = rract.dataset.rract;
                if (act === 'rejected') {
                    bellPrompt('거절 사유(선택)', '').then(function (memo) {
                        NWBackend.adminResolveReturn(id, act, memo).catch(function () { alert('처리 실패'); });
                    });
                } else {
                    NWBackend.adminResolveReturn(id, act, null).catch(function () { alert('처리 실패'); });
                }
                return;
            }
        });
        // 저장(상태/운송장/메모)
        var save = $('#aopSave');
        if (save) save.addEventListener('click', function () {
            if (!_aOrderEditing) return;
            var o = _aOrderEditing, id = o.id;
            var status = $('#aopStatus').value;
            var courier = $('#aopCourier').value;
            var tracking = ($('#aopTracking').value || '').trim();
            var memo = ($('#aopMemo').value || '').trim();
            // 운송장을 새로 넣었는데 상태를 안 바꿨고 아직 배송 전이면 자동으로 배송중 처리
            if (tracking && status === o.status && ['shipping', 'delivered', 'confirmed'].indexOf(status) < 0) {
                status = 'shipping';
            }
            save.disabled = true; save.textContent = '저장 중...';
            // 순차 처리: 메모 → 운송장 → 상태(상태가 마지막에 적용되어 우선)
            var p = NWBackend.adminSetOrderMemo(id, memo);
            p = p.then(function () { return NWBackend.adminSetTracking(id, courier, tracking); });
            p = p.then(function () { return NWBackend.adminSetOrderStatus(id, status); });
            p.then(function () { alert('저장되었습니다.'); closeAdminOrderPage(); })
             .catch(function () { alert('저장에 실패했습니다.'); })
             .then(function () { save.disabled = false; save.textContent = '저장'; });
        });
    }

    /* ============ 관리자 대시보드 / 관리 패널 ============ */
    var _adminCache = { pending: [], vendors: [] };
    function renderAdminDash() {
        var box = $('#adminDash');
        if (!box || !backendOn() || !NWBackend.adminOrderStats) return;
        function cell(val, label, status) {
            return '<button type="button" class="admin-dash-cell" data-ostatus="' + (status || '') + '"><b>' + val + '</b><span>' + label + ' ›</span></button>';
        }
        NWBackend.adminOrderStats().then(function (s) {
            box.innerHTML =
                cell(s.todayOrders + '건', '오늘 주문', '') +
                cell(fmt(s.paidTodayAmount) + '원', '오늘 입금확인', 'paid') +
                cell(s.shipping + '건', '배송중', 'shipping') +
                cell(s.pendingPay + '건', '결제대기', 'pending') +
                cell(s.preparing + '건', '상품준비중', 'preparing') +
                cell(s.paid + '건', '결제완료', 'paid');
        }).catch(function () {});
    }
    function refreshAdminBadges() {
        if (!backendOn() || !NWBackend.adminSummary) return;
        NWBackend.adminSummary().then(function (s) {
            setBadge('#amrQuotes', s.pending);
            setBadge('#amrMembers', (s.vendorsPending || 0) + (s.partnersPending || 0));
            setBadge('#amrOrders', s.ordersPending);
            setBadge('#amrReturns', s.returnsPending);
        }).catch(function () {});
    }
    function setBadge(sel, n) {
        var el = $(sel);
        if (!el) return;
        if (n > 0) { el.textContent = n > 99 ? '99+' : n; el.hidden = false; }
        else el.hidden = true;
    }
    var O_FILTER_LABEL = { '': '전체 주문', today: '오늘 주문', pending: '결제 대기', paid: '결제 완료 (배송 준비)', shipping: '배송 중', delivered: '배송 완료' };
    function openAdminPanel(view, ofilter) {
        var p = $('#adminPanel');
        if (!p) return;
        $$('.admin-panel-view', p).forEach(function (sec) { sec.hidden = sec.dataset.apv !== view; });
        var titles = { quotes: '비교견적 승인', members: '회원관리', coupons: '쿠폰 관리', listings: '판매시계 관리', orders: '주문 관리', returns: '교환 · 반품', settlements: '정산 관리', analytics: '활동 로그' };
        var t = $('#adminPanelTitle');
        if (t) t.textContent = (view === 'orders') ? (O_FILTER_LABEL[ofilter || ''] || '주문 관리') : (titles[view] || '관리');
        // 패널을 열 때 항목을 즉시 다시 그려, 첫 진입에서 빈 화면이 보이지 않게 한다
        // (구독이 비동기로 들어오는 사이 들어와도 캐시로 바로 채움)
        if (view === 'quotes') renderAdminPending(_adminCache.pending);
        else if (view === 'members') openMembers(_memFilter || 'all');
        else if (view === 'coupons') renderAdminCoupons();
        else if (view === 'orders') {
            _aOrderFilter = ofilter || '';
            renderAdminOrders();
            if (backendOn() && NWBackend.adminSubscribeOrders) {
                if (_aOrdersUnsub) { try { _aOrdersUnsub(); } catch (e) {} }
                _aOrdersUnsub = NWBackend.adminSubscribeOrders('', function (list) { _aOrdersCache = list || []; renderAdminOrders(); });
            }
        }
        else if (view === 'returns') {
            renderAdminReturns();
            if (backendOn() && NWBackend.adminSubscribeReturns) {
                if (_aReturnsUnsub) { try { _aReturnsUnsub(); } catch (e) {} }
                _aReturnsUnsub = NWBackend.adminSubscribeReturns(function (list) { _aReturnsCache = list || []; renderAdminReturns(); });
                // 반품 카드에 상품명을 보여주려면 주문 캐시도 필요
                if (NWBackend.adminSubscribeOrders && !_aOrdersCache.length) {
                    NWBackend.adminSubscribeOrders('', function (list) { _aOrdersCache = list || []; renderAdminReturns(); });
                }
            }
        }
        else if (view === 'partners') renderAdminPartners();
        else if (view === 'settlements') renderAdminSettlements(_stlFilter);
        else if (view === 'analytics') renderAdminAnalytics();
        p.hidden = false; document.body.style.overflow = 'hidden';
        var sc = $('.admin-panel-scroll', p); if (sc) sc.scrollTop = 0;
    }
    function closeAdminPanel() {
        var p = $('#adminPanel');
        if (p) { p.hidden = true; document.body.style.overflow = 'hidden'; } // 마이페이지가 여전히 떠 있음
    }

    /* ===== 관리자: 회원관리(일반·업체·제휴사 통합) ===== */
    var _memFilter = 'all';
    var ROLE_LABEL = { customer: '일반회원', vendor: '업체', partner: '제휴사', admin: '관리자' };
    function openMembers(kind) {
        _memFilter = kind || 'all';
        $$('#memTabs [data-mem]').forEach(function (b) { b.classList.toggle('on', (b.dataset.mem || 'all') === _memFilter); });
        var paneList = $('#memPaneList'), paneVendor = $('#memPaneVendor'), panePartner = $('#memPanePartner');
        var showVendor = _memFilter === 'vendor', showPartner = _memFilter === 'partner';
        if (paneVendor) paneVendor.hidden = !showVendor;
        if (panePartner) panePartner.hidden = !showPartner;
        if (paneList) paneList.hidden = showVendor || showPartner;
        if (showVendor) renderVendorList(_adminCache.vendors);
        else if (showPartner) renderAdminPartners();
        else renderAdminMembers(_memFilter); // all | customer
    }
    function renderAdminMembers(kind) {
        var box = $('#adminMembers'); if (!box) return;
        if (!backendOn() || !NWBackend.listAllMembers) { box.innerHTML = '<div class="admin-list-item"><span>백엔드 연결이 필요합니다.</span></div>'; return; }
        box.innerHTML = '<div class="admin-list-item"><span>불러오는 중…</span></div>';
        NWBackend.listAllMembers().then(function (rows) {
            rows = rows || [];
            var list = (kind === 'customer') ? rows.filter(function (m) { return (m.role || 'customer') === 'customer'; }) : rows;
            if (!list.length) { box.innerHTML = '<div class="admin-list-item"><span>회원이 없습니다.</span></div>'; return; }
            box.innerHTML = list.map(function (m) {
                var nm = esc(m.display_name || m.company_name || m.biz_name || '(이름 없음)');
                var role = ROLE_LABEL[m.role] || m.role || '회원';
                var sub = [];
                if (m.email) sub.push(esc(m.email));
                if (m.phone) sub.push(esc(m.phone) + (m.phone_verified ? ' ✓' : ''));
                if (m.bank_account) sub.push(esc((m.bank_name || '') + ' ' + m.bank_account));
                var when = m.created_at ? (' · 가입 ' + String(m.created_at).slice(0, 10)) : '';
                var reset = m.email ? '<button type="button" class="stl-act" data-resetpw="' + esc(m.email) + '">비번 재설정 메일</button>' : '';
                return '<div class="admin-list-item mem-item">' +
                    '<div class="mem-top"><b>' + nm + '</b><span class="mem-role mem-role--' + (m.role || 'customer') + '">' + role + '</span></div>' +
                    '<div class="mem-sub">' + (sub.join(' · ') || '추가 정보 없음') + when + '</div>' +
                    (reset ? '<div class="pa-acts">' + reset + '</div>' : '') +
                '</div>';
            }).join('');
        }).catch(function () { box.innerHTML = '<div class="admin-list-item"><span>불러오기 실패 (로그인/권한 확인)</span></div>'; });
    }
    document.addEventListener('click', function (e) {
        var mt = e.target.closest('#memTabs [data-mem]');
        if (mt) { openMembers(mt.dataset.mem || 'all'); }
    });

    /* ===== 관리자: 제휴사 관리 ===== */
    function renderAdminPartners() {
        var box = $('#adminPartners'); if (!box || !backendOn() || !NWBackend.listPartners) return;
        box.innerHTML = '<div class="admin-list-item"><span>불러오는 중…</span></div>';
        NWBackend.listPartners().then(function (rows) {
            setBadge('#amrPartners', rows.filter(function (p) { return !p.approved; }).length);
            if (!rows.length) { box.innerHTML = '<div class="admin-list-item"><span>제휴사가 없습니다.</span></div>'; return; }
            box.innerHTML = rows.map(function (p) {
                var name = esc(p.biz_name || p.company_name || p.display_name || '(이름 없음)');
                var rate = Math.round((p.commission_rate != null ? p.commission_rate : 0.1) * 100);
                function chip(ok, label) { return '<span class="pchip ' + (ok ? 'on' : 'off') + '">' + label + (ok ? ' ✓' : '') + '</span>'; }
                var emailOk = !!p.email_verified;
                return '<div class="admin-list-item partner-adm" data-pid="' + esc(p.id) + '">' +
                    '<div class="pa-head"><b>' + name + '</b>' +
                        '<span class="pa-state ' + (p.approved ? 'ok' : 'no') + '">' + (p.approved ? '승인됨' : '승인 대기') + '</span></div>' +
                    '<div class="pa-sub">대표 ' + esc(p.ceo_name || '-') + ' · 사업자 ' + esc(p.business_no || '-') + ' · 수수료 ' + rate + '%</div>' +
                    '<div class="pa-sub small">' + esc(p.email || '') + (p.bank_account ? (' · ' + esc(p.bank_name || '') + ' ' + esc(p.bank_account) + ' (' + esc(p.bank_holder || '') + ')') : '') + '</div>' +
                    '<div class="pa-chips">' + chip(emailOk, '이메일') + chip(!!p.phone_verified, '휴대폰') + chip(!!p.biz_verified, '사업자') + chip(!!p.account_verified, '계좌') + '</div>' +
                    '<div class="pa-acts">' +
                        '<button type="button" class="stl-act" data-pbiz="' + esc(p.id) + '" data-on="' + (p.biz_verified ? '0' : '1') + '">' + (p.biz_verified ? '사업자해제' : '사업자승인') + '</button>' +
                        '<button type="button" class="stl-act" data-pacct="' + esc(p.id) + '" data-on="' + (p.account_verified ? '0' : '1') + '">' + (p.account_verified ? '계좌해제' : '계좌승인') + '</button>' +
                        '<button type="button" class="stl-act" data-prate="' + esc(p.id) + '" data-rate="' + rate + '">수수료변경</button>' +
                        '<button type="button" class="stl-act' + (p.approved ? ' ghost' : '') + '" data-papprove="' + esc(p.id) + '" data-on="' + (p.approved ? '0' : '1') + '">' + (p.approved ? '승인취소' : '제휴사 승인') + '</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }).catch(function () { box.innerHTML = '<div class="admin-list-item"><span>불러오기 실패 (partner.sql 실행 여부 확인)</span></div>'; });
    }

    /* ===== 관리자: 방문 · 조회 분석 ===== */
    function aTime(iso) {
        var ms = Date.parse(iso); if (isNaN(ms)) return '';
        var d = new Date(ms), diff = (Date.now() - ms) / 1000;
        if (diff < 60) return '방금';
        if (diff < 3600) return Math.floor(diff / 60) + '분 전';
        if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
            ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    }
    function renderAdminAnalytics() {
        var box = $('#adminAnalytics'); if (!box) return;
        if (!backendOn() || !NWBackend.analyticsOverview) {
            box.innerHTML = '<p class="admin-empty">분석 기능을 사용하려면 analytics.sql 을 실행하세요.</p>';
            return;
        }
        box.innerHTML = '<p class="admin-empty">불러오는 중…</p>';
        function card(v, l) { return '<div class="an-card"><b>' + v + '</b><span>' + l + '</span></div>'; }
        var failHTML = '<p class="admin-empty">불러오기 실패 — analytics.sql 실행 여부를 확인하세요.<br>(관리자 계정으로 로그인되어 있어야 합니다.)</p>';
        NWBackend.analyticsOverview().then(function (o) {
            o = o || {};
            var html = '<div class="an-grid">' +
                card((o.visitsToday || 0), '오늘 방문') +
                card((o.visitorsToday || 0), '오늘 방문자') +
                card((o.viewsToday || 0), '오늘 시계조회') +
                card((o.membersViews || 0), '회원 조회') +
                card((o.visits7d || 0), '7일 방문') +
                card((o.views7d || 0), '7일 조회') +
                '</div>' +
                '<h4 class="an-h">인기 시계 TOP <span class="an-mut">(최근 7일)</span></h4>' +
                '<div id="anPopular" class="an-list"><p class="admin-empty">집계 중…</p></div>' +
                '<h4 class="an-h">최근 조회 <span class="an-mut">(누가 어떤 시계를)</span></h4>' +
                '<div id="anRecent" class="an-list"><p class="admin-empty">집계 중…</p></div>';
            box.innerHTML = html;

            if (NWBackend.popularProducts) NWBackend.popularProducts(7, 12).then(function (rows) {
                var el = $('#anPopular'); if (!el) return;
                if (!rows || !rows.length) { el.innerHTML = '<p class="admin-empty">아직 조회 데이터가 없습니다.</p>'; return; }
                el.innerHTML = rows.map(function (r, i) {
                    var name = ((r.brand || '') + ' ' + (r.model || '')).trim() || '(상품)';
                    return '<div class="an-row"><span class="an-rank">' + (i + 1) + '</span>' +
                        '<span class="an-name">' + esc(name) + '</span>' +
                        '<span class="an-num">' + r.views + '회 · ' + r.viewers + '명</span></div>';
                }).join('');
            }).catch(function () { var el = $('#anPopular'); if (el) el.innerHTML = ''; });

            if (NWBackend.recentProductViews) NWBackend.recentProductViews(40).then(function (rows) {
                var el = $('#anRecent'); if (!el) return;
                if (!rows || !rows.length) { el.innerHTML = '<p class="admin-empty">아직 조회 데이터가 없습니다.</p>'; return; }
                el.innerHTML = rows.map(function (r) {
                    var name = ((r.brand || '') + ' ' + (r.model || '')).trim() || '(상품)';
                    var who = r.is_member ? esc(r.viewer_name || r.viewer_email || '회원') : '비회원';
                    var whoCls = r.is_member ? 'an-who member' : 'an-who';
                    return '<div class="an-row"><span class="' + whoCls + '">' + who + '</span>' +
                        '<span class="an-name">' + esc(name) + '</span>' +
                        '<span class="an-num">' + aTime(r.created_at) + '</span></div>';
                }).join('');
            }).catch(function () { var el = $('#anRecent'); if (el) el.innerHTML = ''; });
        }).catch(function () { box.innerHTML = failHTML; });
    }

    /* ===== 관리자: 정산 관리 ===== */
    var _stlFilter = '';
    function renderAdminSettlements(filter) {
        _stlFilter = filter || '';
        var box = $('#adminSettlements'); if (!box || !backendOn() || !NWBackend.listAllSettlements) return;
        box.innerHTML = '<div class="admin-list-item"><span>불러오는 중…</span></div>';
        NWBackend.listAllSettlements(_stlFilter ? { status: _stlFilter } : {}).then(function (rows) {
            var pendCnt = rows.filter(function (s) { return s.status === 'pending'; }).length;
            if (!_stlFilter) setBadge('#amrSettlements', pendCnt);
            if (!rows.length) { box.innerHTML = '<div class="admin-list-item"><span>정산 내역이 없습니다.</span></div>'; return; }
            box.innerHTML = rows.map(function (s) {
                var label = s.status === 'paid' ? '입금완료' : (s.status === 'hold' ? '보류' : '정산대기');
                var cls = s.status === 'paid' ? 'stl-paid' : (s.status === 'hold' ? 'stl-hold' : 'stl-pending');
                var payee = s.sellerRole === 'admin'
                    ? '벨로르(직접판매)'
                    : (esc(s.bank || '') + ' ' + esc(s.account || '') + ' (' + esc(s.holder || '') + ')');
                var btns = '';
                if (s.sellerRole !== 'admin') {
                    if (s.status !== 'paid') btns += '<button type="button" class="stl-act" data-stlpaid="' + esc(s.id) + '">입금완료 처리</button>';
                    else btns += '<button type="button" class="stl-act ghost" data-stlpending="' + esc(s.id) + '">대기로 되돌리기</button>';
                }
                return '<div class="admin-list-item stl-adm">' +
                    '<div class="stl-main"><b>' + esc(s.productName || '상품') + '</b><span class="stl-amt">정산 ' + fmt(s.net) + '원</span></div>' +
                    '<div class="stl-sub">판매가 ' + fmt(s.gross) + '원 · 수수료 ' + fmt(s.fee) + '원(' + Math.round((s.feeRate || 0) * 100) + '%) · <span class="' + cls + '">' + label + '</span></div>' +
                    '<div class="stl-sub small">정산대상: ' + payee + '</div>' +
                    (btns ? '<div class="pa-acts">' + btns + '</div>' : '') +
                '</div>';
            }).join('');
        }).catch(function () { box.innerHTML = '<div class="admin-list-item"><span>불러오기 실패 (partner.sql 실행 여부 확인)</span></div>'; });
    }

    // 제휴사/정산 액션 + 정산 탭
    document.addEventListener('click', function (e) {
        var t = e.target;
        var pb = t.closest('[data-pbiz]'), pa = t.closest('[data-pacct]'), pr = t.closest('[data-prate]'), pap = t.closest('[data-papprove]');
        var sp = t.closest('[data-stlpaid]'), spd = t.closest('[data-stlpending]');
        var stlTab = t.closest('#stlTabs [data-stl]');
        if (!backendOn()) { if (pb||pa||pr||pap||sp||spd) alert('백엔드 연결이 필요합니다.'); }
        if (pb) {
            NWBackend.setBizVerified(pb.dataset.pbiz, pb.dataset.on === '1')
                .then(renderAdminPartners).catch(function (err) { alert('실패: ' + (err && err.message || err)); });
        } else if (pa) {
            NWBackend.setAccountVerified(pa.dataset.pacct, pa.dataset.on === '1')
                .then(renderAdminPartners).catch(function (err) { alert('실패: ' + (err && err.message || err)); });
        } else if (pr) {
            bellPrompt('수수료율(%)을 입력하세요. 예: 10', pr.dataset.rate).then(function (v) {
                if (v == null) return;
                var rate = parseFloat(String(v).replace(/[^0-9.]/g, ''));
                if (!(rate >= 0 && rate <= 100)) { alert('0~100 사이 숫자를 입력하세요.'); return; }
                NWBackend.setPartnerCommission(pr.dataset.prate, rate / 100)
                    .then(renderAdminPartners).catch(function (err) { alert('실패: ' + (err && err.message || err)); });
            });
        } else if (pap) {
            var on = pap.dataset.on === '1';
            bellConfirm(on ? '이 제휴사를 승인할까요? 승인하면 상품 등록·판매가 가능합니다.' : '제휴사 승인을 취소할까요?').then(function (ok) {
                if (!ok) return;
                NWBackend.setPartnerApproved(pap.dataset.papprove, on)
                    .then(renderAdminPartners).catch(function (err) { alert('실패: ' + (err && err.message || err)); });
            });
        } else if (sp) {
            bellConfirm('이 정산을 입금완료로 처리할까요? 제휴사에게 알림이 전송됩니다.').then(function (ok) {
                if (!ok) return;
                NWBackend.setSettlementStatus(sp.dataset.stlpaid, 'paid')
                    .then(function () { renderAdminSettlements(_stlFilter); }).catch(function (err) { alert('실패: ' + (err && err.message || err)); });
            });
        } else if (spd) {
            NWBackend.setSettlementStatus(spd.dataset.stlpending, 'pending')
                .then(function () { renderAdminSettlements(_stlFilter); }).catch(function (err) { alert('실패: ' + (err && err.message || err)); });
        } else if (stlTab) {
            $$('#stlTabs .cpadm-tab').forEach(function (b) { b.classList.toggle('on', b === stlTab); });
            renderAdminSettlements(stlTab.dataset.stl || '');
        }
    });

    function initAdminDashboard() {
        // 클릭 바인딩은 백엔드 설정과 무관하게 항상 연결(메뉴 → 패널 열기)
        document.addEventListener('click', function (e) {
            var row = e.target.closest('#adminMenuBox [data-apv]');
            if (row) { openAdminPanel(row.dataset.apv, row.dataset.ofilter); return; }
            if (e.target.closest('#adminPanelBack')) closeAdminPanel();
            // 오늘 현황 칸 탭 → 관리자 주문 패널을 해당 상태로 필터해 열기
            // (고객용 주문모달이 아니라, 누가/언제/무엇을 결제대기 중인지 보이는 관리자 목록)
            var dc = e.target.closest('#adminDash [data-ostatus]');
            if (dc) {
                openAdminPanel('orders', dc.dataset.ostatus || '');
                return;
            }
        });

        if (!backendOn() || !NWBackend.onAuthChange) return;

        NWBackend.onAuthChange(function (user, info) {
            var isAdmin = !!(info && info.isAdmin);
            ['adminDashBox', 'adminMenuBox'].forEach(function (id) { var el = $('#' + id); if (el) el.hidden = !isAdmin; });
            // 관리자에겐 고객용 영역 숨김(포인트/내쿠폰/소식 시계)
            ['pocketBox', 'myAlertsSection', 'myCartLink', 'mpHubCats'].forEach(function (id) {
                var el = $('#' + id); if (el) el.hidden = isAdmin;
            });
            if (!isAdmin) { var p = $('#adminPanel'); if (p) p.hidden = true; }
            if (isAdmin) { renderAdminDash(); refreshAdminBadges(); }
        });

        // 마이페이지 열릴 때 대시보드 갱신
        var myModal = $('#myPageModal');
        if (myModal && window.MutationObserver) {
            new MutationObserver(function () {
                if (!myModal.hidden) { renderAdminDash(); refreshAdminBadges(); }
            }).observe(myModal, { attributes: true, attributeFilter: ['hidden'] });
        }
    }

    function couponClaimErr(e) {
        var m = (e && (e.message || e.code)) || '';
        if (/NOT_FOUND/.test(m)) return '존재하지 않는 쿠폰입니다.';
        if (/ALREADY_OWNED/.test(m)) return '이미 보유한 쿠폰입니다.';
        if (/EXPIRED/.test(m)) return '만료된 쿠폰입니다.';
        if (/NOT_STARTED/.test(m)) return '아직 받을 수 없는 쿠폰입니다.';
        if (/SOLD_OUT/.test(m)) return '발급이 마감되었습니다.';
        if (/DOWNLOADABLE/.test(m)) return '다운로드할 수 없는 쿠폰입니다.';
        if (/LOGGED_IN/.test(m)) return '로그인이 필요합니다.';
        return '쿠폰을 받을 수 없습니다.';
    }

    function relTime(ts) {
        var ms = 0;
        if (ts && typeof ts.toMillis === 'function') ms = ts.toMillis();
        else if (ts && ts.seconds) ms = ts.seconds * 1000;
        if (!ms) return '방금';
        var diff = Math.floor((Date.now() - ms) / 60000);
        if (diff < 1) return '방금';
        if (diff < 60) return diff + '분 전';
        if (diff < 1440) return Math.floor(diff / 60) + '시간 전';
        return Math.floor(diff / 1440) + '일 전';
    }

    /* ============ 앱 설치 (홈 화면에 추가) ============
       푸터 사업자 영역의 '모바일 앱 설치' 버튼에서 호출.
       설치 가능 시 클릭하면 브라우저 네이티브 설치창이 뜬다. */
    var deferredInstallPrompt = null;

    // 설치 프롬프트는 <head> 초기 스크립트에서 window.__bipEvent 로 먼저 캡처해 둔다.
    function getInstallPrompt() { return window.__bipEvent || deferredInstallPrompt; }

    // 카카오톡/네이버/인스타 등 인앱 브라우저는 PWA 설치 자체가 불가능하다.
    function isInAppBrowser() {
        var ua = navigator.userAgent || '';
        return /KAKAOTALK|NAVER\(inapp|NAVER |Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp|wadiz|Snapchat|Twitter|kakaostory|Whale/i.test(ua);
    }

    function initInstallPrompt() {
        var btn = $('#installBtn');

        // 늦게 들어온 이벤트도 잡아 둠 (초기 스크립트와 이중 안전망)
        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            deferredInstallPrompt = e;
            window.__bipEvent = e;
        });

        // 이미 설치된 경우 배너 숨김
        var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
            window.navigator.standalone === true;
        if (btn && !standalone) btn.hidden = false;
        if (btn && standalone) btn.hidden = true;

        window.addEventListener('appinstalled', function () {
            deferredInstallPrompt = null;
            window.__bipEvent = null;
            if (btn) btn.hidden = true;
        });

        if (btn) {
            btn.addEventListener('click', function () {
                var promptEvent = getInstallPrompt();
                if (promptEvent) {
                    // 네이티브 설치창 바로 띄우기
                    promptEvent.prompt();
                    promptEvent.userChoice.then(function () {
                        deferredInstallPrompt = null;
                        window.__bipEvent = null;
                    });
                    return;
                }
                if (isInAppBrowser()) {
                    showInstallToast('인앱 브라우저에서는 설치가 안 돼요.\n우측 상단 메뉴(⋮ 또는 ⋯) → "다른 브라우저로 열기"\n(Chrome/Safari)로 접속한 뒤 설치하세요.');
                } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
                    showInstallToast('하단 공유 버튼(□↑)을 누른 후\n"홈 화면에 추가"를 선택하세요.');
                } else {
                    showInstallToast('브라우저 메뉴(⋮) → "앱 설치" 또는\n"홈 화면에 추가"를 선택하세요.');
                }
            });
        }
    }

    function showInstallToast(msg) {
        if (!msg) {
            msg = /iphone|ipad|ipod/i.test(navigator.userAgent)
                ? '하단 공유 버튼(□↑)을 누른 후\n"홈 화면에 추가"를 선택하세요.'
                : '브라우저 메뉴 → "홈 화면에 추가"를 선택하세요.';
        }
        var toast = document.createElement('div');
        toast.className = 'install-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(function () { toast.classList.add('show'); }, 10);
        setTimeout(function () { toast.classList.remove('show'); setTimeout(function () { toast.remove(); }, 300); }, 3500);
    }

    function showInstallHelp() {
        var modal = $('#pwaInstallModal');
        if (!modal) return;
        var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        var native = $('#pwaInstallNative');
        var manual = $('#pwaInstallManual');
        if (isIOS) {
            if (native) native.hidden = true;
            if (manual) {
                manual.hidden = false;
                var iosHint = manual.querySelector('.pwa-ios');
                var androidHint = manual.querySelector('.pwa-android');
                if (iosHint) iosHint.hidden = false;
                if (androidHint) androidHint.hidden = true;
            }
        } else {
            if (native) native.hidden = true;
            if (manual) {
                manual.hidden = false;
                var iosHint2 = manual.querySelector('.pwa-ios');
                var androidHint2 = manual.querySelector('.pwa-android');
                if (iosHint2) iosHint2.hidden = true;
                if (androidHint2) androidHint2.hidden = false;
            }
        }
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closePwaModal() {
        var modal = $('#pwaInstallModal');
        if (modal) { modal.hidden = true; document.body.style.overflow = ''; }
    }

    function initPwaModal() {
        var modal = $('#pwaInstallModal');
        if (!modal) return;
        modal.addEventListener('click', function (e) {
            if (e.target.closest('[data-pwa-close]')) closePwaModal();
        });
        var confirmBtn = $('#pwaInstallConfirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', function () {
                var promptEvent = getInstallPrompt();
                if (promptEvent) {
                    promptEvent.prompt();
                    promptEvent.userChoice.then(function () {
                        deferredInstallPrompt = null;
                        window.__bipEvent = null;
                        closePwaModal();
                    });
                }
            });
        }
    }

    /* ============ 판매/구입/수리 폼 ============ */
    function initSellBuyRepairForms() {
        // 판매 폼 - 사진 업로드 (최대 10장)
        var sellPhotos = [];
        var sellInput = $('#sellPhotoInput');
        var sellGrid = $('#sellUploadGrid');

        if (sellInput && sellGrid) {
            sellInput.addEventListener('change', function (e) {
                var files = Array.from(e.target.files || []);
                files.forEach(function (file) {
                    if (sellPhotos.length >= 10) return;
                    var reader = new FileReader();
                    reader.onload = function (ev) {
                        sellPhotos.push(ev.target.result);
                        renderSellGrid();
                    };
                    reader.readAsDataURL(file);
                });
                sellInput.value = '';
            });

            sellGrid.addEventListener('click', function (e) {
                var btn = e.target.closest('.remove-btn');
                if (!btn) return;
                e.preventDefault();
                e.stopPropagation();
                var i = parseInt(btn.dataset.idx, 10);
                if (!isNaN(i)) {
                    sellPhotos.splice(i, 1);
                    renderSellGrid();
                }
            });

            enablePhotoReorder(sellGrid, function () { return sellPhotos; }, renderSellGrid);
        }

        function renderSellGrid() {
            if (!sellGrid) return;
            $$('.upload-cell.has-img', sellGrid).forEach(function (c) { c.remove(); });
            var addCell = $('.upload-add', sellGrid);
            sellPhotos.forEach(function (src, idx) {
                var cell = document.createElement('div');
                cell.className = 'upload-cell has-img';
                cell.dataset.idx = idx;
                cell.innerHTML =
                    '<img src="' + src + '" alt="" draggable="false">' +
                    '<button type="button" class="remove-btn" data-idx="' + idx + '" aria-label="삭제">×</button>';
                if (addCell) sellGrid.insertBefore(cell, addCell);
            });
            if (addCell) addCell.style.display = sellPhotos.length >= 10 ? 'none' : '';
        }

        // 판매 폼 제출
        var sellForm = $('#sellForm');
        if (sellForm) {
            sellForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var fd = new FormData(sellForm);
                if (!fd.get('brand') || !fd.get('parts') || !fd.get('name') || !fd.get('phone')) {
                    alert('필수 항목(*)을 모두 입력해주세요.');
                    return;
                }
                if (sellPhotos.length === 0) {
                    alert('시계 사진을 1장 이상 등록해주세요.');
                    return;
                }
                var sellData = fdToObj(fd);
                sellData['사진수'] = sellPhotos.length + '장';
                sendLead('시계 판매 견적 신청', sellData);
                alert(fd.get('name') + '님, 판매 견적 신청이 접수되었습니다.\n사진 ' + sellPhotos.length + '장이 함께 전송되었습니다.\n빠른 시간 안에 ' + fd.get('phone') + '으로 연락드립니다.');
                sellForm.reset();
                sellPhotos = [];
                renderSellGrid();
                navigate('home');
            });
        }

        // 구입 폼 제출
        var buyForm = $('#buyForm');
        if (buyForm) {
            buyForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var fd = new FormData(buyForm);
                if (!fd.get('want') || !fd.get('name') || !fd.get('phone')) {
                    alert('필수 항목(*)을 모두 입력해주세요.');
                    return;
                }
                sendLead('시계 구입 문의', fdToObj(fd));
                alert(fd.get('name') + '님, 구입 문의가 접수되었습니다.\n매물 확보 시 즉시 ' + fd.get('phone') + '으로 안내드립니다.');
                buyForm.reset();
                navigate('home');
            });
        }

        // 수리 폼 제출
        var repairForm = $('#repairForm');
        if (repairForm) {
            repairForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var fd = new FormData(repairForm);
                if (!fd.get('issue') || !fd.get('area') || !fd.get('name') || !fd.get('phone')) {
                    alert('필수 항목(*)을 모두 입력해주세요.');
                    return;
                }
                sendLead('시계 수리 문의', fdToObj(fd));
                alert(fd.get('name') + '님, 수리 문의가 접수되었습니다.\n1시간 이내 ' + fd.get('phone') + '으로 견적 회신드립니다.');
                repairForm.reset();
                navigate('home');
            });
        }
    }

    /* ============ 홈: LIVE 비교견적 진행 현황 보드 ============ */
    var _liveBoardLoggedIn = false;
    var _liveBoardRender = null;

    var BIDDERS_POOL = [
        { code: 'K', kind: '감정사' }, { code: 'T', kind: '워치' }, { code: 'H', kind: '딜러' },
        { code: 'D', kind: '감정사' }, { code: 'M', kind: '워치' }, { code: 'G', kind: '딜러' },
        { code: 'C', kind: '워치' }, { code: 'N', kind: '딜러' }, { code: 'P', kind: '감정사' },
        { code: 'Y', kind: '워치' }, { code: 'J', kind: '딜러' }, { code: 'S', kind: '감정사' }
    ];

    var WATCH_POOL = [
        { brand: 'ROLEX', model: '서브마리너 풀세트', img: 'assets/2026-03-18_이미지자료_193209.jpg', basePrice: 1500 },
        { brand: 'PATEK', model: '노틸러스 5711', img: 'assets/KakaoTalk_20250502_221302124_02.jpg', basePrice: 5000 },
        { brand: 'AP', model: '로열오크 15500ST', img: 'assets/KakaoTalk_20250513_003812408_03.jpg', basePrice: 4500 },
        { brand: 'VACHERON', model: '오버시즈 퍼페추얼', img: 'assets/KakaoTalk_20250428_224216035.jpg', basePrice: 3800 },
        { brand: 'ROLEX', model: 'GMT 펩시', img: 'assets/KakaoTalk_20250506_211755713_02.jpg', basePrice: 2100 },
        { brand: 'FRANCK', model: '뱅가드 V45 다이아', img: 'assets/1(487).jpg', basePrice: 3000 },
        { brand: 'ROLEX', model: '데이트저스트 41 화이트', img: 'assets/m1263340002.png', basePrice: 1600 },
        { brand: 'ROLEX', model: '데이데이트 다이아베젤', img: 'assets/m128395tbr0032.png', basePrice: 7600 },
        { brand: 'FRANCK', model: '카사블랑카 6850', img: 'assets/6850CASA.jpg', basePrice: 850 }
    ];

    function pickBidder() {
        var b = BIDDERS_POOL[Math.floor(Math.random() * BIDDERS_POOL.length)];
        return b.code + '■■ ' + b.kind;
    }

    function timeAgoText(min) {
        if (min < 1) return '방금';
        if (min < 60) return min + '분 전';
        if (min < 60 * 24) {
            var h = Math.floor(min / 60);
            return h + '시간 전';
        }
        var d = Math.floor(min / (60 * 24));
        return d + '일 전';
    }

    // 8분 ~ 1일(1440분) 사이 랜덤
    function randomTimeAgo() {
        return 8 + Math.floor(Math.random() * (1440 - 8));
    }

    function buildRow(item) {
        var badgeClass = 'badge-progress';
        var badgeText = '진행중';
        if (item.status === 'done') { badgeClass = 'badge-done'; badgeText = '매입완료'; }
        else if (item.status === 'pending') { badgeClass = 'badge-pending'; badgeText = '승인중'; }
        else if (item.status === 'end') { badgeClass = 'badge-end'; badgeText = '종료'; }

        var locked = !_liveBoardLoggedIn;
        var bodyHtml;
        if (item.status === 'pending') {
            bodyHtml = '<p class="live-row-by">정가품 감정 진행중</p>';
        } else if (item.status === 'done' || item.status === 'end') {
            var bidderTxt = locked ? '<b class="live-mosaic">●●● 업체</b>' : '<b>' + item.bidder + '</b>';
            var amtTxt = locked ? '<span class="amount live-mosaic">●●●만원</span>' : '<span class="amount">' + fmt(item.amount * 10000) + '원</span>';
            bodyHtml = '<p class="live-row-by">' + bidderTxt + ' 최종 ' + amtTxt + '</p>';
        } else {
            var bidderTxt2 = locked ? '<b class="live-mosaic">●●● 업체</b>' : '<b>' + item.bidder + '</b>';
            var amtTxt2 = locked ? '<span class="amount live-mosaic">●●●만원</span>' : '<span class="amount">' + fmt(item.amount * 10000) + '원</span>';
            bodyHtml = '<p class="live-row-by">' + bidderTxt2 + '가 ' + amtTxt2 + ' 입찰</p>';
        }

        return '' +
            '<li class="live-row" data-id="' + item.id + '">' +
            '<div class="live-row-thumb"><img src="' + item.img + '" alt=""></div>' +
            '<div class="live-row-info">' +
            '<p class="live-row-model">' + item.brand + ' · ' + item.model + '</p>' +
            bodyHtml +
            '<p class="live-row-meta"><span>' + timeAgoText(item.minAgo) + '</span>' +
            (item.bidCount ? '<span>· ' + item.bidCount + '건 입찰</span>' : '') + '</p>' +
            '</div>' +
            '<span class="live-row-badge ' + badgeClass + '">' + badgeText + '</span>' +
            '</li>';
    }

    function initLiveBoard() {
        var board = $('#liveBoard');
        if (!board) return;

        // 초기 데이터 (다양한 상태)
        var items = [];
        var id = 1;
        function addItem(opts) {
            var w = WATCH_POOL[Math.floor(Math.random() * WATCH_POOL.length)];
            items.push({
                id: id++,
                brand: w.brand,
                model: w.model,
                img: w.img,
                amount: opts.amount,
                bidder: opts.bidder || pickBidder(),
                status: opts.status,
                minAgo: opts.minAgo,
                bidCount: opts.bidCount
            });
        }

        addItem({ amount: 1920, status: 'progress', minAgo: 8 + Math.floor(Math.random() * 40), bidCount: 7 });
        addItem({ amount: 5200, status: 'done', minAgo: randomTimeAgo() });
        addItem({ amount: 0, status: 'pending', minAgo: 10 + Math.floor(Math.random() * 30), bidder: '' });
        addItem({ amount: 4800, status: 'progress', minAgo: randomTimeAgo(), bidCount: 5 });
        // 시간 순으로 정렬 (최근 거래가 위로)
        items.sort(function (a, b) { return a.minAgo - b.minAgo; });

        function render() {
            board.innerHTML = items.slice(0, 4).map(buildRow).join('');
            var notice = $('#liveBoardLockNotice');
            if (notice) notice.hidden = _liveBoardLoggedIn;
        }
        _liveBoardRender = render;
        render();

        // 주기적으로 새 입찰 추가 (위에서 슬라이드 인)
        function tick() {
            var roll = Math.random();
            var w = WATCH_POOL[Math.floor(Math.random() * WATCH_POOL.length)];
            var newItem = {
                id: id++,
                brand: w.brand,
                model: w.model,
                img: w.img,
                minAgo: 8 + Math.floor(Math.random() * 60) // 8분~68분 (최근 거래)
            };

            if (roll < 0.55) {
                // 진행중 새 입찰
                newItem.amount = w.basePrice + Math.floor(Math.random() * 400) - 200;
                newItem.bidder = pickBidder();
                newItem.status = 'progress';
                newItem.bidCount = Math.floor(Math.random() * 6) + 1;
            } else if (roll < 0.8) {
                // 매입완료
                newItem.amount = w.basePrice + Math.floor(Math.random() * 200);
                newItem.bidder = pickBidder();
                newItem.status = 'done';
            } else {
                // 새 등록 (승인중)
                newItem.amount = 0;
                newItem.bidder = '';
                newItem.status = 'pending';
            }

            items.unshift(newItem);
            // 7개만 유지 (가장 마지막 = 가장 오래된 거 제거)
            items = items.slice(0, 4);

            render();
            var first = board.querySelector('.live-row');
            if (first) {
                first.classList.add('new-in', 'highlight');
                setTimeout(function () { first.classList.remove('highlight'); }, 1200);
            }
        }

        setInterval(tick, 4000);
    }

    function initLiveBoardLockLink() {
        var link = $('#liveBoardLoginLink');
        if (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                openLoginModal();
            });
        }
    }

    function updateLiveLockNotice() {
        var notice = $('#liveBoardLockNotice');
        if (!notice) return;
        var user = (window.NWBackend && NWBackend.currentUser) ? NWBackend.currentUser() : null;
        if (!user) {
            notice.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> 금액 · 업체명은 <a href="#" id="liveBoardLoginLink" style="color:var(--green-bright);text-decoration:underline">로그인</a> 후 확인할 수 있습니다';
            var lnk = $('#liveBoardLoginLink');
            if (lnk) lnk.addEventListener('click', function (e) { e.preventDefault(); var lm = $('#loginModal'); if (lm) { lm.hidden = false; document.body.style.overflow = 'hidden'; } });
        } else if (!_liveBoardLoggedIn) {
            notice.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> 금액 · 업체명은 <strong>제휴처(업체) 회원</strong>에게만 공개됩니다';
        }
        notice.hidden = _liveBoardLoggedIn;
    }

    function initCatPages() {
        var btnAi = $('#btnAiAppraisal');
        if (btnAi) btnAi.addEventListener('click', function () {
            var f = $('#aiAppraisalForm');
            if (!f) return;
            f.hidden = false;
            setTimeout(function () { f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
        });

        var btnPhoto = $('#btnPhotoAppraisal');
        if (btnPhoto) btnPhoto.addEventListener('click', function () {
            navigate('compare');
            setTimeout(function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 100);
        });

        var btnOffline = $('#btnOfflineAppraisal');
        if (btnOffline) btnOffline.addEventListener('click', function () {
            navigate('contact');
            setTimeout(function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 100);
        });

        var trigger = $('#aiPhotoTrigger');
        var input = $('#aiPhotoInput');
        var preview = $('#aiPhotoPreview');
        if (trigger && input) {
            trigger.addEventListener('click', function () { input.click(); });
            input.addEventListener('change', function () {
                var file = input.files && input.files[0];
                if (!file) return;
                var url = URL.createObjectURL(file);
                preview.src = url;
                preview.hidden = false;
                trigger.hidden = true;
            });
        }

        var form = $('#aiAppraisalFormEl');
        if (form) form.addEventListener('submit', function (e) {
            e.preventDefault();
            var submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '분석 중...'; }

            setTimeout(function () {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '감정 요청하기'; }
                var brandVal = (document.getElementById('aiBrand') || {}).value || '';
                var modelVal = (document.getElementById('aiModel') || {}).value || '';
                var label = brandVal ? (brandVal + (modelVal ? ' · ' + modelVal : '')) : '입력하신 시계';

                var result = document.getElementById('aiMockResult');
                if (!result) {
                    result = document.createElement('div');
                    result.id = 'aiMockResult';
                    result.className = 'ai-mock-result';
                    form.parentNode.insertBefore(result, form.nextSibling);
                }
                result.innerHTML =
                    '<div class="ai-result-top"><span class="ai-result-badge">AI 감정 결과</span><span class="ai-result-conf">신뢰도 91%</span></div>' +
                    '<p class="ai-result-brand">' + esc(label) + '</p>' +
                    '<div class="ai-result-rows">' +
                    '<div><span>정품 여부</span><strong class="apr-ok">✓ 정품 추정</strong></div>' +
                    '<div><span>현 매입 시세</span><strong>전문 감정사 확인 필요</strong></div>' +
                    '<div><span>다음 단계</span><strong>1:1 사진 감정 권장</strong></div>' +
                    '</div>' +
                    '<p class="ai-result-note">* 본 결과는 AI 1차 분석이며 전문 감정사의 최종 확인이 필요합니다.</p>';
                result.hidden = false;
                result.scrollIntoView({ behavior: 'smooth', block: 'center' });

                form.reset();
                var prev = $('#aiPhotoPreview');
                var tr = $('#aiPhotoTrigger');
                if (prev) { prev.hidden = true; prev.src = ''; }
                if (tr) tr.hidden = false;
            }, 2500);
        });
    }

    /* ============ 비교견적 페이지: 한 시계 입찰 진행 (자연스러운 카운트업) ============ */
    function initAuctionDetail() {
        var priceEl = $('#auctionPrice');
        var barEl = $('#auctionBar');
        var countEl = $('#auctionBidCount');
        var labelEl = $('#auctionLabel');
        var recentBy = $('#recentBy');
        var recentTime = $('#recentTime');
        var doneEl = $('#auctionDone');
        var statusEl = priceEl ? priceEl.closest('.auction-status') : null;

        if (!priceEl || !barEl || !statusEl) return;

        var BASE = 15000000;
        var TOP = 19000000;
        var steps = buildSteps(BASE, TOP);
        var idx = 0;
        var currentAmount = BASE;

        function pad(n) { return n < 10 ? '0' + n : '' + n; }
        function timeStr() {
            var d = new Date();
            return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        }

        function setBar(amount) {
            var ratio = Math.max(0, Math.min(1, (amount - BASE) / (TOP - BASE)));
            barEl.style.width = (ratio * 100).toFixed(2) + '%';
        }

        // 부드러운 카운트업 애니메이션 (가격 + 진행막대 동시에)
        function animatePrice(from, to, duration, onDone) {
            var start = performance.now();
            function step(now) {
                var elapsed = now - start;
                var p = Math.min(elapsed / duration, 1);
                // easeOutCubic: 자연스러운 감속
                var eased = 1 - Math.pow(1 - p, 3);
                var value = from + (to - from) * eased;
                // 10만 단위로 반올림하여 표시
                var rounded = Math.round(value / 100000) * 100000;
                priceEl.textContent = fmt(rounded);
                setBar(value);
                if (p < 1) {
                    requestAnimationFrame(step);
                } else {
                    priceEl.textContent = fmt(to);
                    setBar(to);
                    currentAmount = to;
                    if (onDone) onDone();
                }
            }
            requestAnimationFrame(step);
        }

        function showStep(step) {
            // 입찰자 정보 즉시 표시
            if (recentBy) recentBy.innerHTML = '<b style="color:var(--green-bright)">' + step.by + '</b>가 ' + fmt(step.amount) + '원 입찰';
            if (recentTime) recentTime.textContent = timeStr();
            if (countEl) countEl.textContent = idx + 1;

            // 가격은 부드럽게 카운트업 (1.4초)
            animatePrice(currentAmount, step.amount, 1400);
        }

        function finish() {
            statusEl.classList.add('done');
            if (labelEl) labelEl.textContent = '최종 매입가';
            if (doneEl) doneEl.hidden = false;
        }

        function tick() {
            if (idx >= steps.length) {
                finish();
                return; // 리플레이 없음
            }
            showStep(steps[idx]);
            idx++;
            // 2.5~3.5초 간격 (자연스럽게)
            setTimeout(tick, 2500 + Math.floor(Math.random() * 1000));
        }

        // 초기 상태
        priceEl.textContent = fmt(BASE);
        setBar(BASE);
        setTimeout(tick, 1000);
    }

    function buildSteps(base, top) {
        var steps = [];
        var n = 8;
        var diff = top - base;
        for (var i = 0; i < n; i++) {
            var r = i / (n - 1);
            r = 1 - Math.pow(1 - r, 1.8);
            var amount = Math.round((base + diff * r) / 100000) * 100000;
            steps.push({ amount: amount, by: pickBidder() });
        }
        steps[steps.length - 1].amount = top;
        return steps;
    }

    /* ============ 관리자 모드 ============
       관리자 인증은 Firebase 로그인(관리자 이메일)으로 처리한다.
       로그인 시 initBackendSync 가 enableAdminMode/disableAdminMode 를 호출. */
    function initAdminMode() {
        var btnPartnership = $('#btnPartnership');
        var btnAd = $('#btnAdInquiry');

        // 제휴/광고 문의 버튼
        var inquiryModal = $('#inquiryModal');
        function openInquiry(type) {
            closeLoginModal();
            if (!inquiryModal) return;
            $('#inquiryEyebrow').textContent = type === 'partner' ? 'PARTNERSHIP' : 'ADVERTISEMENT';
            $('#inquiryTitle').innerHTML = type === 'partner' ? '업체 <strong>제휴 문의</strong>' : '<strong>광고</strong> 문의';
            inquiryModal.hidden = false;
            document.body.style.overflow = 'hidden';
        }
        if (btnPartnership) btnPartnership.addEventListener('click', function () { openInquiry('partner'); });
        if (btnAd) btnAd.addEventListener('click', function () { openInquiry('ad'); });

        if (inquiryModal) {
            inquiryModal.addEventListener('click', function (e) {
                if (e.target.closest('[data-iclose]')) {
                    inquiryModal.hidden = true;
                    document.body.style.overflow = '';
                }
            });
        }

        var inquiryForm = $('#inquiryForm');
        if (inquiryForm) {
            inquiryForm.addEventListener('submit', function (e) {
                e.preventDefault();
                sendLead('제휴/광고 문의', fdToObj(new FormData(inquiryForm)));
                alert('문의가 접수되었습니다.\n빠른 시간 안에 연락드리겠습니다.');
                inquiryForm.reset();
                inquiryModal.hidden = true;
                document.body.style.overflow = '';
            });
        }

        // 관리자 매물 승인/거부/입찰
        document.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            var item = btn.closest('.admin-pending-item');
            if (!item) return;
            var action = btn.dataset.action;
            var name = item.querySelector('.admin-pending-info strong').textContent;
            var listingId = item.dataset.id; // 백엔드 매물이면 존재
            var uid = item.dataset.uid || '';
            var label = (item.dataset.brand || '') + ' ' + (item.dataset.model || '');

            function notify(text) {
                if (backendOn() && uid) {
                    NWBackend.createNotification({ uid: uid, type: 'listing', text: text }).catch(function () {});
                }
            }

            if (action === 'approve') {
                bellConfirm(name + ' 매물을 승인하시겠습니까?\n승인 후 고객 판매 마켓에 게시됩니다.').then(function (ok) {
                    if (!ok) return;
                    if (backendOn() && listingId) {
                        NWBackend.approveListing(listingId)
                            .then(function () { notify(label + ' 매물이 승인되어 마켓에 게시됐어요.'); alert('승인되었습니다.'); })
                            .catch(function (err) { alert('승인 실패: ' + (err && err.message || err)); });
                        return; // 목록은 실시간 구독으로 갱신
                    }
                    item.style.transition = 'opacity 0.4s, height 0.4s';
                    item.style.opacity = '0';
                    setTimeout(function () { item.remove(); }, 400);
                    alert('승인되었습니다.');
                });
            } else if (action === 'reject') {
                bellConfirm(name + ' 매물을 거부하시겠습니까?').then(function (ok) {
                    if (!ok) return;
                    if (backendOn() && listingId) {
                        NWBackend.rejectListing(listingId)
                            .then(function () { notify(label + ' 매물 등록이 거부되었어요. 자세한 사유는 상담을 통해 안내드려요.'); alert('거부되었습니다. 고객에게 사유가 전송됩니다.'); })
                            .catch(function (err) { alert('거부 실패: ' + (err && err.message || err)); });
                        return;
                    }
                    item.style.transition = 'opacity 0.4s';
                    item.style.opacity = '0';
                    setTimeout(function () { item.remove(); }, 400);
                    alert('거부되었습니다. 고객에게 사유가 전송됩니다.');
                });
            } else if (action === 'bid') {
                if (!backendOn() || !listingId) { alert('백엔드 연결이 필요합니다.'); return; }
                // 입찰 전 인증 확인: 휴대폰 인증 + (업체) 계좌 인증 필수. 관리자는 통과.
                if (!NWBackend.isAdmin || !NWBackend.isAdmin()) {
                    if (NWBackend.phoneVerified && !NWBackend.phoneVerified()) {
                        alert('입찰하려면 먼저 휴대폰 인증이 필요합니다.');
                        if (window.belloreVerifyPhone) window.belloreVerifyPhone({});
                        return;
                    }
                    if (NWBackend.accountVerified && !NWBackend.accountVerified()) {
                        alert('입찰하려면 업체 계좌 인증(관리자 승인)이 필요합니다.');
                        if (window.belloreVendorAccount && (!NWBackend.accountSubmitted || !NWBackend.accountSubmitted())) window.belloreVendorAccount({});
                        return;
                    }
                }
                bellPrompt(label + ' 매물 입찰가 (숫자만, 예: 15000000)').then(function (amt) {
                    if (!amt) return;
                    var amount = parseInt(String(amt).replace(/[^0-9]/g, ''), 10) || 0;
                    if (!amount) { alert('금액을 숫자로 입력해주세요.'); return; }
                    NWBackend.placeBid({ id: listingId, uid: uid, brand: item.dataset.brand, model: item.dataset.model }, amount)
                        .then(function () { alert(fmt(amount) + '원으로 입찰했습니다. 고객에게 알림이 전송됩니다.'); })
                        .catch(function (err) { alert('입찰 실패: ' + (err && err.message || err)); });
                });
            }
        });

        // 관리자 시계 등록 버튼은 bellore-features.js의 등록 폼(모달)이 처리합니다.
    }

    function enableAdminMode() {
        document.body.classList.add('admin-mode');
        $$('.admin-only').forEach(function (el) {
            el.hidden = false;
            el.classList.add('show');
        });
    }
    function disableAdminMode() {
        document.body.classList.remove('admin-mode');
        $$('.admin-only').forEach(function (el) {
            el.hidden = true;
            el.classList.remove('show');
        });
    }
    window.disableAdminMode = disableAdminMode;

    function closeLoginModal() {
        var lm = $('#loginModal');
        if (lm) { lm.hidden = true; document.body.style.overflow = ''; }
    }

    function openLoginModal() {
        var lm = $('#loginModal');
        if (lm) { lm.hidden = false; document.body.style.overflow = 'hidden'; }
        // 항상 로그인 화면부터
        if (window.BELLORE_showLoginPanel) window.BELLORE_showLoginPanel('login');
    }

    /* ============ 백엔드(Firebase) 데이터 동기화 ============
       firebase-config.js 에 키가 채워지면 자동 활성화. 키가 없으면
       backendOn() === false 라 위의 데모 동작이 그대로 유지된다. */
    function backendOn() {
        return !!(window.NWBackend && window.NWBackend.configured);
    }

    function authErrorMsg(err) {
        var code = err && err.code ? err.code : '';
        var msg = (err && err.message) ? String(err.message) : '';
        var map = {
            'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
            'auth/user-not-found': '가입되지 않은 이메일입니다.',
            'auth/wrong-password': '비밀번호가 일치하지 않습니다.',
            'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
            'auth/email-already-in-use': '이미 가입된 이메일입니다.',
            'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
            'auth/too-many-requests': '잠시 후 다시 시도해주세요.',
            'invalid_credentials': '이메일 또는 비밀번호가 올바르지 않습니다.',
            'email_not_confirmed': '이메일 인증이 필요합니다. 메일함의 인증 링크를 확인하거나 관리자에게 문의해주세요.',
            'user_already_exists': '이미 가입된 이메일입니다.',
            'email_exists': '이미 가입된 이메일입니다.',
            'weak_password': '비밀번호는 6자 이상이어야 합니다.',
            'over_email_send_rate_limit': '요청이 많습니다. 잠시 후 다시 시도해주세요.',
            'signup_disabled': '현재 회원가입이 비활성화되어 있습니다.',
            'validation_failed': '입력값을 확인해주세요.'
        };
        if (msg === 'USERNAME_TAKEN') return '이미 사용 중인 아이디입니다.';
        if (msg === 'USER_NOT_FOUND') return '존재하지 않는 아이디입니다.';
        if (map[code]) return map[code];
        var m = msg.toLowerCase();
        if (m.indexOf('invalid login') !== -1) return '이메일 또는 비밀번호가 올바르지 않습니다.';
        if (m.indexOf('email not confirmed') !== -1) return '이메일 인증이 필요합니다. 메일함의 인증 링크를 확인하거나 관리자에게 문의해주세요.';
        if (m.indexOf('already registered') !== -1 || m.indexOf('already been registered') !== -1) return '이미 가입된 이메일입니다.';
        if (m.indexOf('password should be at least') !== -1) return '비밀번호는 6자 이상이어야 합니다.';
        if (m.indexOf('rate limit') !== -1) return '요청이 많습니다. 잠시 후 다시 시도해주세요.';
        if (m.indexOf('failed to fetch') !== -1 || m.indexOf('networkerror') !== -1) return '네트워크 연결을 확인해주세요.';
        return msg || '알 수 없는 오류';
    }

    function initBackendSync() {
        if (!backendOn()) return;

        // 로그인/관리자 상태에 따라 UI 갱신
        NWBackend.onAuthChange(function (user, info) {
            var authInfo = info || arguments[1] || {};
            if (authInfo && authInfo.isAdmin) { enableAdminMode(); }
            else if (window.disableAdminMode) { disableAdminMode(); }
            updateAuthUI(user);
            // 비교견적 라이브보드 모자이크 갱신
            // 로그인한 회원(업체 포함)에게는 금액·업체명을 공개 — 로그인 후엔 안내문구 숨김
            _liveBoardLoggedIn = !!user;
            if (_liveBoardRender) _liveBoardRender();
            updateLiveLockNotice();
        });

        // SDK 로드 완료 후 실시간 구독 시작
        NWBackend.ready.then(function () {
            if (!NWBackend.enabled) return;

            // 승인된 매물은 누구나 조회 (공개 마켓)
            NWBackend.subscribeApproved(renderApprovedMarket);

            // 벨로르 판매 상품 (관리자 등록분) — 판매시계 그리드 + 홈 '판매 중인 시계'에 최신순 반영
            NWBackend.subscribeProducts(function (rows) {
                renderProducts(rows);
                renderHomeProducts(rows);
                renderCatPages(rows);
            });

            // 로그인/권한 상태에 따라 구독을 켜고 끈다
            var unsubMine = null;
            var unsubPending = null;
            NWBackend.onAuthChange(function (user, info) {
                // 본인 매물
                if (unsubMine) { unsubMine(); unsubMine = null; }
                if (user) {
                    unsubMine = NWBackend.subscribeMyListings(renderMyItemsBackend);
                } else {
                    renderMyItemsBackend([]);
                }

                // 승인 대기 매물 (관리자만 — 규칙상 비관리자는 조회 불가)
                if (info && info.isAdmin) {
                    if (!unsubPending) unsubPending = NWBackend.subscribePending(renderAdminPending);
                } else if (unsubPending) {
                    unsubPending(); unsubPending = null;
                }
            });
        });
    }

    function updateAuthUI(user) {
        var btnMy = $('#btnMy');
        if (btnMy) btnMy.classList.toggle('logged-in', !!user);
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function listingImg(it) {
        return (it.photos && it.photos[0]) ? it.photos[0] : 'assets/images.jpg';
    }

    // 깨진 카드 이미지는 깔끔한 시계 플레이스홀더로 대체(규격 유지)
    document.addEventListener('error', function (e) {
        var img = e.target;
        if (!img || img.tagName !== 'IMG' || !img.closest) return;
        var box = img.closest('.hcard-img');
        if (box && !box.classList.contains('img-broken')) {
            box.classList.add('img-broken');
            img.style.visibility = 'hidden';
        }
    }, true);

    // 매물 카드에 한눈에 보이는 정보 배지(보증서·컨디션·구성품) + TIME SALE 카운트다운
    var SALE_HOURS = 72;
    // 세일 활성 여부: 'sale' 태그가 있고, 시작 시점 기준 72시간이 아직 안 지났을 때만 true.
    // 만료되면 자동으로 정가로 복귀하고 배지/할인 표시를 끈다(관리자 체크도 해제된 것으로 취급).
    window.belloreSaleActive = function (it) {
        if (!it || !it.tags || it.tags.indexOf('sale') === -1) return false;
        var base = it.sale_started_at || it.created_at;
        if (!base) return false;
        return (Date.parse(base) + SALE_HOURS * 3600 * 1000) > Date.now();
    };
    // 가격 표시(할인 적용 시 정가 취소선 + 할인가 + 할인율)
    function priceHTML(it) {
        if (!it.price) return '가격 문의<em></em>';
        var sp = parseInt(it.sale_price, 10) || 0;
        if (sp > 0 && sp < it.price && window.belloreSaleActive(it)) {
            var rate = Math.round((1 - sp / it.price) * 100);
            return '<span class="hcard-old">' + fmt(it.price) + '원</span>' +
                '<span class="hcard-now"><b class="hcard-rate">' + rate + '%</b>' + fmt(sp) + '<em>원</em></span>';
        }
        return fmt(it.price) + '<em>원</em>';
    }
    // 카드 하단 정보: 2줄 고정(구성품·등급 / 스탬핑·미리수). 값 없으면 '미표기'.
    function cardBadgesHTML(it) {
        function v(x) {
            x = (x == null ? '' : String(x)).trim();
            return x ? '<span class="hcard-av">' + esc(x) + '</span>'
                     : '<span class="hcard-av hcard-na">미표기</span>';
        }
        var acc = it.accessories || (it.has_warranty ? '정품보증' : '');
        var grade = it.condition || it.pack || '';
        return '<div class="hcard-info">' +
            '<div class="hcard-info-row">' +
                '<span class="hcard-attr"><b>구성품</b>' + v(acc) + '</span>' +
                '<span class="hcard-attr"><b>등급</b>' + v(grade) + '</span>' +
            '</div>' +
            '<div class="hcard-info-row">' +
                '<span class="hcard-attr"><b>스탬핑</b>' + v(it.stamping) + '</span>' +
                '<span class="hcard-attr"><b>미리수</b>' + v(it.misu) + '</span>' +
            '</div>' +
        '</div>';
    }
    // 타임세일 카운트다운: 이미지 위(좌하단) 오버레이. 체크 시점(sale_started_at) 기준 72시간.
    function saleOverlayHTML(it) {
        if (window.belloreSaleActive(it)) {
            var base = it.sale_started_at || it.created_at;
            var end = Date.parse(base) + SALE_HOURS * 3600 * 1000;
            return '<div class="hcard-timesale" data-end="' + end + '"><b>TIME SALE</b><span class="hcard-timer">--:--:--</span></div>';
        }
        return '';
    }
    // 며칠 표기 없이 오로지 시간으로만(예: 68:10:23)
    function fmtCountdown(ms) {
        if (ms <= 0) return '마감';
        var s = Math.floor(ms / 1000);
        var h = Math.floor(s / 3600); s %= 3600;
        var m = Math.floor(s / 60); s %= 60;
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return p(h) + ':' + p(m) + ':' + p(s);
    }
    setInterval(function () {
        var els = document.querySelectorAll('.hcard-timesale[data-end]');
        for (var i = 0; i < els.length; i++) {
            var el = els[i], end = parseInt(el.getAttribute('data-end'), 10);
            var t = el.querySelector('.hcard-timer'), ms = end - Date.now();
            if (t) t.textContent = fmtCountdown(ms);
            if (ms <= 0) el.classList.add('ended');
        }
    }, 1000);

    // 승인된 고객 매물 → 고객 판매 마켓 그리드 상단에 표시
    function renderApprovedMarket(rows) {
        var inner = $('#panel-user .col-grid-inner');
        if (!inner) return;
        $$('.hcard-dynamic', inner).forEach(function (el) { el.remove(); });
        // DB 콘텐츠가 있으면 정적 샘플 카드는 숨김(중복 방지)
        $$('.hcard', inner).forEach(function (c) {
            if (!c.classList.contains('hcard-dynamic')) c.style.display = rows.length ? 'none' : '';
        });
        var frag = document.createDocumentFragment();
        rows.forEach(function (it) {
            var priceHtml = it.price ? (fmt(it.price) + '<em>원</em>') : '감정가 산정<em></em>';
            var card = document.createElement('article');
            card.className = 'hcard hcard-dynamic';
            card.dataset.pid = it.id;
            card.dataset.brand = it.brand;
            card.dataset.model = it.model;
            card.dataset.price = it.price || 0;
            card.dataset.pack = it.pack || '';
            card.dataset.size = it.size_mm || '';
            card.innerHTML =
                '<div class="hcard-img"><img src="' + esc(listingImg(it)) + '" alt="">' + saleOverlayHTML(it) + '</div>' +
                '<p class="hcard-brand">' + esc(it.brand) + '</p>' +
                '<p class="hcard-model">' + esc(it.model) + '</p>' +
                (it.pack ? '<p class="hcard-pack">' + esc(it.pack) + '</p>' : '') +
                '<p class="hcard-price">' + priceHtml + '</p>' + cardBadgesHTML(it) +
                '<div class="hcard-admin">' +
                '<button type="button" class="hcard-gear" aria-label="설정"><svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1l2.1-2.1M17 7l2.1-2.1\"/></svg></button>' +
                '<div class="hcard-admin-menu" hidden>' +
                '<button type="button" class="hcard-edit" data-pedit="' + esc(it.id) + '">수정</button>' +
                '<button type="button" class="hcard-del" data-pdel="' + esc(it.id) + '">삭제</button>' +
                '</div></div>';
            frag.appendChild(card);
        });
        inner.insertBefore(frag, inner.firstChild);
    }

    // 벨로르 판매 상품 → 판매시계 그리드 상단에 표시
    function renderProducts(rows) {
        var inner = $('#panel-ny .col-grid-inner');
        if (!inner) return;
        $$('.hcard-dynamic', inner).forEach(function (el) { el.remove(); });
        $$('.hcard', inner).forEach(function (c) {
            if (!c.classList.contains('hcard-dynamic')) c.style.display = rows.length ? 'none' : '';
        });
        var frag = document.createDocumentFragment();
        rows.forEach(function (it) {
            var priceHtml = priceHTML(it);
            var card = document.createElement('article');
            card.className = 'hcard hcard-dynamic';
            card.dataset.pid = it.id;
            card.dataset.brand = it.brand;
            card.dataset.model = it.model;
            card.dataset.price = it.price || 0;
            card.dataset.sprice = it.sale_price || '';
            card.dataset.pack = it.pack || '';
            card.dataset.size = it.size_mm || '';
            card.innerHTML =
                '<div class="hcard-img"><img src="' + esc(listingImg(it)) + '" alt="">' + saleOverlayHTML(it) + '</div>' +
                '<p class="hcard-brand">' + esc(it.brand) + '</p>' +
                '<p class="hcard-model">' + esc(it.model) + '</p>' +
                (it.pack ? '<p class="hcard-pack">' + esc(it.pack) + '</p>' : '') +
                '<p class="hcard-price">' + priceHtml + '</p>' + cardBadgesHTML(it) +
                '<div class="hcard-admin">' +
                '<button type="button" class="hcard-gear" aria-label="설정"><svg viewBox=\"0 0 24 24\" width=\"16\" height=\"16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1l2.1-2.1M17 7l2.1-2.1\"/></svg></button>' +
                '<div class="hcard-admin-menu" hidden>' +
                '<button type="button" class="hcard-edit" data-pedit="' + esc(it.id) + '">수정</button>' +
                '<button type="button" class="hcard-del" data-pdel="' + esc(it.id) + '">삭제</button>' +
                '</div></div>';
            frag.appendChild(card);
        });
        inner.insertBefore(frag, inner.firstChild);
    }

    // 홈 '판매 중인 시계' 그리드 — DB 상품을 최신 등록순으로 최대 12개 노출.
    // 카드 클릭 시 해당 상품 상세가 열리도록 data-pid 부여(홈 정적 데모는 fallback).
    function renderHomeProducts(rows) {
        var grid = $('#homeOnSale .home-sale-grid');
        if (!grid) return;
        $$('.hcard-dynamic', grid).forEach(function (el) { el.remove(); });
        var statics = $$('.hcard', grid).filter(function (c) { return !c.classList.contains('hcard-dynamic'); });
        if (!rows || !rows.length) { statics.forEach(function (c) { c.style.display = ''; }); return; }
        statics.forEach(function (c) { c.style.display = 'none'; });
        var frag = document.createDocumentFragment();
        rows.slice(0, 12).forEach(function (it) {
            var priceHtml = priceHTML(it);
            var card = document.createElement('article');
            card.className = 'hcard hcard-dynamic';
            card.dataset.pid = it.id;
            card.dataset.brand = it.brand;
            card.dataset.model = it.model;
            card.dataset.price = it.price || 0;
            card.dataset.sprice = it.sale_price || '';
            card.innerHTML =
                '<div class="hcard-img"><img src="' + esc(listingImg(it)) + '" alt="">' + saleOverlayHTML(it) + '</div>' +
                '<p class="hcard-brand">' + esc(it.brand) + '</p>' +
                '<p class="hcard-model">' + esc(it.model) + '</p>' +
                (it.pack ? '<p class="hcard-pack">' + esc(it.pack) + '</p>' : '') +
                '<p class="hcard-price">' + priceHtml + '</p>' + cardBadgesHTML(it);
            frag.appendChild(card);
        });
        grid.appendChild(frag);
    }

    // 상단 카테고리 탭 페이지(할인시작/미사용신품/오늘의시계/업데이트)를 DB 상품으로 채움
    function fillCatGrid(grid, rows) {
        if (!grid) return;
        $$('.hcard-dynamic', grid).forEach(function (el) { el.remove(); });
        var statics = $$('.hcard', grid).filter(function (c) { return !c.classList.contains('hcard-dynamic'); });
        if (!rows.length) { statics.forEach(function (c) { c.style.display = ''; }); return; }
        statics.forEach(function (c) { c.style.display = 'none'; });
        var frag = document.createDocumentFragment();
        rows.forEach(function (it) {
            var priceHtml = priceHTML(it);
            var card = document.createElement('article');
            card.className = 'hcard hcard-dynamic';
            card.dataset.pid = it.id;
            card.dataset.brand = it.brand;
            card.dataset.model = it.model;
            card.dataset.price = it.price || 0;
            card.dataset.sprice = it.sale_price || '';
            card.innerHTML =
                '<div class="hcard-img"><img src="' + esc(listingImg(it)) + '" alt="">' + saleOverlayHTML(it) + '</div>' +
                '<p class="hcard-brand">' + esc(it.brand) + '</p>' +
                '<p class="hcard-model">' + esc(it.model) + '</p>' +
                (it.pack ? '<p class="hcard-pack">' + esc(it.pack) + '</p>' : '') +
                '<p class="hcard-price">' + priceHtml + '</p>' + cardBadgesHTML(it);
            frag.appendChild(card);
        });
        grid.appendChild(frag);
    }
    function renderCatPages(rows) {
        rows = rows || [];
        function tagged(t) { return rows.filter(function (it) { return (it.tags || []).indexOf(t) !== -1; }); }
        fillCatGrid($('#catUpdateGrid'), rows.slice(0, 30));   // 업데이트 = 최신 등록순 전체
        fillCatGrid($('#catSaleGrid'), tagged('sale'));         // 🔥 할인시작
        fillCatGrid($('#catNewGrid'), tagged('new'));           // 미사용신품
        fillCatGrid($('#catTodayGrid'), tagged('today'));       // 오늘의시계
    }

    // 관리자: 승인 대기 매물 목록
    function renderAdminPending(rows) {
        _adminCache.pending = rows || [];
        var box = $('#adminPending');
        if (!box) return;
        if (!rows.length) {
            box.innerHTML = '<div class="empty-items"><p>승인 대기 중인 매물이 없습니다.</p></div>';
            return;
        }
        box.innerHTML = rows.map(function (it) {
            var bidLine = it.bidAmount ? '<small class="my-item-bid">입찰가 ' + fmt(it.bidAmount) + '원</small>' : '';
            return '' +
                '<div class="admin-pending-item" data-id="' + esc(it.id) + '" data-uid="' + esc(it.uid || '') + '" data-brand="' + esc(it.brand) + '" data-model="' + esc(it.model) + '">' +
                '<div class="admin-pending-img"><img src="' + esc(listingImg(it)) + '" alt=""></div>' +
                '<div class="admin-pending-info">' +
                '<strong>' + esc(it.brand) + '</strong>' +
                '<p>' + esc(it.model) + ' · ' + esc(it.name || '고객') + '</p>' +
                '<small>사진 ' + (it.photoCount || (it.photos ? it.photos.length : 0)) + '장</small>' +
                bidLine +
                '</div>' +
                '<div class="admin-pending-actions">' +
                '<button class="admin-btn approve" data-action="approve">승인</button>' +
                '<button class="admin-btn reject" data-action="reject">거부</button>' +
                '<button class="admin-bid-btn" data-action="bid">입찰가 입력</button>' +
                '</div>' +
                '</div>';
        }).join('');
    }

    // 로그인 사용자 본인의 매물 (상태 + 입찰 포함). 비교견적 페이지와 마이페이지 양쪽에 렌더.
    var myListingsCache = [];
    var CQ_STATUS = {
        pending: '승인 대기', open: '입찰 진행중', awarded: '채택 완료', closed: '종료',
        approved: '판매중', rejected: '거부됨'
    };
    function cqShopName(rank) { return '비교견적 업체 ' + String.fromCharCode(65 + (rank % 26)); }

    function renderMyItemsBackend(rows) {
        myListingsCache = rows || [];
        rows = myListingsCache;

        // 이미지3: 들어온 견적의 최저~최고 범위
        function rangeLine(it) {
            var bids = it.bids || [];
            if (!bids.length) return '';
            var amts = bids.map(function (b) { return Number(b.amount); });
            var lo = Math.min.apply(null, amts), hi = Math.max.apply(null, amts);
            var txt = (lo === hi) ? (fmt(hi) + '원') : (fmt(lo) + ' ~ ' + fmt(hi) + '원');
            return '<div class="cq-range"><span class="cq-range-label">현재 견적 범위</span>' +
                '<span class="cq-range-val">' + txt + '</span></div>';
        }

        // 이미지2: 업체 견적 순위 리스트(탭하면 상세)
        function bidsBlock(it) {
            var bids = it.bids || [];
            if (!bids.length) {
                return '<p class="cq-empty">' + (it.status === 'pending'
                    ? '관리자 승인 후 업체 견적이 시작됩니다.'
                    : '아직 들어온 견적이 없습니다.') + '</p>';
            }
            var head = '<p class="cq-bids-head">총 <b>' + bids.length + '</b>개 업체 견적 · 최고 <b>' + fmt(it.bidAmount) + '원</b></p>';
            var list = bids.map(function (b, i) {
                var awarded = it.awarded_bid === b.id;
                var flag = awarded ? '<span class="cq-bid-flag awarded">채택됨</span>'
                    : (i === 0 ? '<span class="cq-bid-flag top">최고가</span>' : '');
                return '<button type="button" class="cq-bid' + (awarded ? ' is-awarded' : '') + '"' +
                    ' data-cqdetail="' + esc(it.id) + '" data-bidid="' + esc(b.id) + '">' +
                    '<span class="cq-bid-rank">' + (i + 1) + '</span>' +
                    '<span class="cq-bid-main"><span class="cq-bid-name">' + esc(cqShopName(i)) + '</span>' +
                    (b.message ? '<span class="cq-bid-msg">' + esc(b.message) + '</span>' : '') + '</span>' +
                    '<span class="cq-bid-amt">' + fmt(b.amount) + '원</span>' + flag +
                    '<span class="cq-bid-arrow">›</span>' +
                    '</button>';
            }).join('');
            return head + '<div class="cq-bids">' + list + '</div>';
        }

        function cardHtml(it) {
            return '<div class="cq-card" data-quoteid="' + esc(it.id) + '">' +
                '<div class="cq-watch">' +
                '<div class="cq-watch-img"><img src="' + esc(listingImg(it)) + '" alt=""></div>' +
                '<div class="cq-watch-info">' +
                '<p class="cq-watch-brand">' + esc(it.brand || '시계') + '</p>' +
                '<p class="cq-watch-model">' + esc(it.model || '') + '</p>' +
                '<span class="cq-status cq-status-' + esc(it.status) + '">' + (CQ_STATUS[it.status] || it.status) + '</span>' +
                '</div></div>' +
                rangeLine(it) + bidsBlock(it) +
                '</div>';
        }

        var emptyHtml = '<div class="empty-items"><p>아직 등록한 비교견적이 없습니다.</p>' +
            '<p class="sub">내시계팔기에서 시계를 등록하면 업체 견적을 한눈에 비교할 수 있어요.</p></div>';

        var html = rows.length ? rows.map(cardHtml).join('') : emptyHtml;
        var el = $('#myItems'); if (el) el.innerHTML = html;
        var mp = $('#myPageListings'); if (mp) mp.innerHTML = html;
    }

    // 이미지1: 업체 견적 상세 카드 (탭하면 열림 → 채택 가능)
    function ensureCqModal() {
        var m = document.getElementById('cqDetailModal');
        if (m) return m;
        m = document.createElement('div');
        m.className = 'login-modal cq-modal'; m.id = 'cqDetailModal'; m.hidden = true;
        m.innerHTML = '<div class="login-backdrop" data-cqx></div>' +
            '<div class="login-content cq-detail-content">' +
            '<button class="login-close" data-cqx aria-label="닫기">×</button>' +
            '<div id="cqDetailBody"></div></div>';
        document.body.appendChild(m);
        m.addEventListener('click', function (e) {
            if (e.target.closest('[data-cqx]')) closeCqModal();
        });
        return m;
    }
    function closeCqModal() {
        var m = document.getElementById('cqDetailModal');
        if (m) { m.hidden = true; document.body.style.overflow = ''; }
    }
    function openQuoteDetail(quoteId, bidId) {
        var it = null, i;
        for (i = 0; i < myListingsCache.length; i++) {
            if (String(myListingsCache[i].id) === String(quoteId)) { it = myListingsCache[i]; break; }
        }
        if (!it) return;
        var bids = it.bids || [], bid = null, rank = 0;
        for (i = 0; i < bids.length; i++) {
            if (String(bids[i].id) === String(bidId)) { bid = bids[i]; rank = i; break; }
        }
        if (!bid) return;
        var isTop = rank === 0;
        var awarded = it.awarded_bid === bid.id;
        var canAward = it.status === 'open';

        var cta;
        if (awarded) cta = '<div class="cq-cta cq-cta-done">이 견적으로 판매 진행 중</div>';
        else if (canAward) cta = '<button type="button" class="cq-cta cq-cta-primary" data-award="' + esc(bid.id) +
            '" data-quote="' + esc(it.id) + '" data-vendor="' + esc(bid.vendor_id) + '">이 견적으로 판매하기</button>';
        else cta = '<div class="cq-cta cq-cta-done">견적이 마감되었습니다</div>';

        var body = '<div class="cq-detail">' +
            '<div class="cq-shop">' +
            '<div class="cq-shop-avatar">B</div>' +
            '<p class="cq-shop-name">' + esc(cqShopName(rank)) + '</p>' +
            '<p class="cq-shop-partner">벨로르 인증 업체</p>' +
            '<div class="cq-shop-trust">' +
            '<div><b>정품 보장</b><small>100% 정품</small></div>' +
            '<div><b>전문 감정</b><small>감정사 검수</small></div>' +
            '<div><b>안전 결제</b><small>거래 보장</small></div>' +
            '</div></div>' +
            '<div class="cq-offer">' +
            '<p class="cq-offer-label">제안 견적' + (isTop ? ' <span class="cq-bid-flag top">최고가</span>' : '') + '</p>' +
            '<p class="cq-offer-amt">' + fmt(bid.amount) + '<span>원</span></p>' +
            '<dl class="cq-offer-rows">' +
            '<div><dt>모델</dt><dd>' + esc(((it.brand ? it.brand + ' ' : '') + (it.model || '')).trim() || '시계') + '</dd></div>' +
            (bid.message ? '<div><dt>업체 메모</dt><dd>' + esc(bid.message) + '</dd></div>' : '') +
            '<div><dt>감정 방식</dt><dd>실물 감정</dd></div>' +
            '<div><dt>입금 예정</dt><dd>당일 입금</dd></div>' +
            '</dl>' + cta +
            '<button type="button" class="cq-cta cq-cta-ghost" data-cqx>다른 견적 비교하기</button>' +
            '<p class="cq-offer-foot">개인정보와 거래 내역은 안전하게 보호됩니다.</p>' +
            '</div></div>';

        var m = ensureCqModal();
        document.getElementById('cqDetailBody').innerHTML = body;
        m.hidden = false; document.body.style.overflow = 'hidden';
    }
    // 견적 행 탭 → 상세 열기 (마이페이지·비교견적 페이지 공용)
    document.addEventListener('click', function (e) {
        var row = e.target.closest('[data-cqdetail]');
        if (!row) return;
        e.preventDefault();
        openQuoteDetail(row.getAttribute('data-cqdetail'), row.getAttribute('data-bidid'));
    });

    /* ============ 제휴처 클릭 → 예약/문의 모달 ============ */
    function initPartnerModal() {
        var modal = $('#partnerModal');
        if (!modal) return;

        document.addEventListener('click', function (e) {
            var card = e.target.closest('.partner-card');
            if (card) {
                e.preventDefault();
                $('#partnerName').innerHTML = '<strong>' + card.dataset.partner + '</strong> 예약 / 문의';
                $('#partnerArea').textContent = card.dataset.area + ' 지역';
                modal.hidden = false;
                document.body.style.overflow = 'hidden';
                return;
            }
            if (e.target.closest('[data-prclose]')) {
                modal.hidden = true;
                document.body.style.overflow = '';
            }
        });

        var form = $('#partnerForm');
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                sendLead('제휴처 예약/문의', fdToObj(new FormData(form)));
                alert('예약/문의가 접수되었습니다.\n해당 제휴처에서 직접 연락드립니다.');
                form.reset();
                modal.hidden = true;
                document.body.style.overflow = '';
            });
        }
    }

    /* ============ 문의 모달 (제휴/광고 - 추가 처리는 initAdminMode에서) ============ */
    function initInquiryModal() {
        // 위에서 처리됨
    }

    /* ============ EXCLUSIVE PRICING 카드 슬라이드 ============ */
    var EXCLUSIVE_LIST = [
        {
            brand: '오데마피게 로얄오크',
            ref: '26574OR · 중고',
            img: 'assets/2026-03-18_이미지자료_193412.jpg',
            avg: 110000000,
            our: 150000000
        },
        {
            brand: '롤렉스 데이트저스트',
            ref: '126284RBR · 풀세트',
            img: 'assets/m126284rbr0011.png',
            avg: 18000000,
            our: 22800000
        },
        {
            brand: '롤렉스 데이데이트',
            ref: '128395TBR · 다이아베젤',
            img: 'assets/m128395tbr0032.png',
            avg: 62000000,
            our: 78000000
        },
        {
            brand: '롤렉스 데이트저스트 41',
            ref: '126334 · 풀세트',
            img: 'assets/m1263340002.png',
            avg: 13800000,
            our: 16500000
        },
        {
            brand: '롤렉스 데이데이트 36',
            ref: '128239 · 그린 다이얼',
            img: 'assets/m1282390005.png',
            avg: 44000000,
            our: 52000000
        },
        {
            brand: '롤렉스 데이트저스트 31',
            ref: '278381RBR · 다이아',
            img: 'assets/m278381rbr0004.png',
            avg: 22000000,
            our: 28500000
        }
    ];

    function buildExclusiveCard(item) {
        var diff = Math.round(((item.our - item.avg) / item.avg) * 100);
        return '' +
            '<div class="exclusive-slide">' +
            '<div class="exclusive-card">' +
            '<div class="exclusive-img-wrap"><img src="' + item.img + '" alt=""></div>' +
            '<p class="exclusive-name">' + item.brand + '</p>' +
            '<p class="exclusive-meta">' + item.ref + '</p>' +
            '<div class="exclusive-divider"></div>' +
            '<div class="exclusive-prices">' +
            '<div class="exclusive-price-col">' +
            '<p>평균 매입가</p>' +
            '<strong>' + fmt(item.avg) + '</strong>' +
            '</div>' +
            '<div class="exclusive-price-col target">' +
            '<p><span class="exclusive-badge">+' + diff + '%</span><span class="exclusive-target-label">벨로르 매입가</span></p>' +
            '<strong>' + fmt(item.our) + '</strong>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>';
    }

    function setupSlider(trackId, dotsId, interval) {
        var track = document.getElementById(trackId);
        var dots = document.getElementById(dotsId);
        if (!track) return;

        track.innerHTML = EXCLUSIVE_LIST.map(buildExclusiveCard).join('');

        if (dots) {
            dots.innerHTML = EXCLUSIVE_LIST.map(function (_, i) {
                return '<button class="exclusive-dot' + (i === 0 ? ' active' : '') + '" data-i="' + i + '"></button>';
            }).join('');
        }

        var current = 0;
        var total = EXCLUSIVE_LIST.length;

        function go(i) {
            current = (i + total) % total;
            track.style.transform = 'translateX(-' + (current * 100) + '%)';
            if (dots) {
                $$('.exclusive-dot', dots).forEach(function (d, k) {
                    d.classList.toggle('active', k === current);
                });
            }
        }

        if (dots) {
            dots.addEventListener('click', function (e) {
                var btn = e.target.closest('.exclusive-dot');
                if (btn) {
                    var i = parseInt(btn.dataset.i, 10);
                    if (!isNaN(i)) { go(i); resetAuto(); }
                }
            });
        }

        var auto = setInterval(function () { go(current + 1); }, interval || 2200);
        function resetAuto() {
            clearInterval(auto);
            auto = setInterval(function () { go(current + 1); }, interval || 2200);
        }
    }

    function initExclusiveSlider() {
        setupSlider('exclusiveTrack', 'exclusiveDots', 2000);
        setupSlider('exclusiveTrackCompare', 'exclusiveDotsCompare', 2000);
    }

    /* ============ 회원가입 + 로그인 폼 ============ */
    function initSignup() {
        // 패널 전환 (로그인 ↔ 유형선택 ↔ 회원가입)
        function showLoginPanel(name) {
            $$('.login-panel').forEach(function (p) { p.classList.remove('active'); });
            var panel = document.getElementById('loginPanel' + (name.charAt(0).toUpperCase() + name.slice(1)));
            if (panel) { panel.classList.add('active'); }
            var lc = document.querySelector('#loginModal .login-content'); if (lc) lc.scrollTop = 0;
            if (name === 'signup') { var sf = $('#signupForm'); if (sf && sf._gotoStep) sf._gotoStep(1); }
        }
        window.BELLORE_showLoginPanel = showLoginPanel;
        document.addEventListener('click', function (e) {
            var b = e.target.closest('[data-lpanel]');
            if (b && b.closest('#loginModal')) { e.preventDefault(); showLoginPanel(b.dataset.lpanel); }
        });
        // 비밀번호 표시/숨김 토글 (로그인·회원가입·회원정보 어디서나)
        document.addEventListener('click', function (e) {
            var eye = e.target.closest('[data-eye]'); if (!eye) return;
            e.preventDefault();
            var inp = document.getElementById(eye.dataset.eye); if (!inp) return;
            var show = inp.type === 'password';
            inp.type = show ? 'text' : 'password';
            eye.textContent = show ? '숨김' : '표시';
        });
        // 유형 카드 → 역할 지정 후 회원가입 폼으로
        $$('[data-signup-role]').forEach(function (card) {
            card.addEventListener('click', function () {
                var role = card.dataset.signupRole || 'customer';
                var rs = $('#signupRole'); if (rs) rs.value = role;
                if ($('#signupForm') && $('#signupForm')._applyRole) $('#signupForm')._applyRole(role);
                showLoginPanel('signup');
            });
        });

        // 로그인 폼
        var loginForm = $('#loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', function (e) {
                e.preventDefault();
                if (!backendOn()) { return; }
                var fd = new FormData(loginForm);
                var idOrEmail = String(fd.get('id') || '').trim();
                var pw = String(fd.get('pw') || '');
                if (!idOrEmail || !pw) {
                    alert('아이디(또는 이메일)와 비밀번호를 입력해주세요.');
                    return;
                }
                NWBackend.signIn({ idOrEmail: idOrEmail, password: pw }).then(function (user) {
                    loginForm.reset();
                    closeLoginModal();
                    alert((user.displayName || '') + '님, 로그인되었습니다.');
                }).catch(function (err) {
                    alert('로그인 실패: ' + authErrorMsg(err));
                });
            });
        }

        // 회원가입 폼
        var signupForm = $('#signupForm');
        if (signupForm) {
            // ===== 회원가입 2단계 위저드 + 4종 인라인 인증 =====
            var VERIFY = window.BELLORE_VERIFY || {};
            // 인증 상태: ok=가입 진행 가능, real=실제 인증 통과, nc=해당 인증 미배포(준비 중)
            var vSt = { phone:{ok:false,real:false,nc:false}, email:{ok:false,real:false,nc:false,sent:false},
                        biz:{ok:false,real:false,nc:false}, account:{ok:false,real:false,nc:false} };
            function isLive(k){ var c = VERIFY[k==='biz'?'business':k]; return !!(c && c.enabled); }

            function setVState(kind, cls, msg) {
                var s = signupForm.querySelector('[data-vstate="' + kind + '"]');
                if (s) { s.textContent = msg || ''; s.className = 'vrow-state' + (cls ? ' ' + cls : ''); }
            }
            function showCode(kind, on) {
                var row = signupForm.querySelector('[data-v="' + kind + '"]');
                if (row) { var c = row.querySelector('.vrow-code'); if (c) c.hidden = !on; }
            }
            function resetV(kind) { vSt[kind] = {ok:false,real:false,nc:false,sent:false}; setVState(kind,'',''); if(kind==='phone'||kind==='email') showCode(kind,false); }
            var SOFT = '준비 중 — 입력만으로 가입 진행됩니다.';

            // 입력이 바뀌면 해당 인증 무효화
            var fieldKind = { suPhone:'phone', suEmail:'email', suCompany:'biz', suBizNo:'biz', suCeo:'biz', suBizOpen:'biz', suBank:'account', suAccount:'account', suHolder:'account' };
            Object.keys(fieldKind).forEach(function (id) {
                var el = $('#' + id);
                if (el) el.addEventListener('input', function () {
                    var k = fieldKind[id];
                    if (vSt[k] && (vSt[k].ok || vSt[k].real)) resetV(k);
                });
            });

            // 인증 버튼(발송/인증)
            function vSend(kind, btn) {
                var fd = new FormData(signupForm);
                btn.disabled = true;
                var done = function () { btn.disabled = false; };
                if (kind === 'phone') {
                    var phone = String(fd.get('phone') || '').replace(/[^0-9]/g, '');
                    if (phone.length < 10) { setVState('phone','err','휴대폰 번호를 정확히 입력해주세요.'); done(); return; }
                    if (isLive('phone') && NWBackend.verifyIdentityPortone) {
                        setVState('phone','','본인인증 진행 중…');
                        NWBackend.verifyIdentityPortone({ phone: phone })
                            .then(function(){ vSt.phone={ok:true,real:true,nc:false}; setVState('phone','ok','✓ 본인인증 완료'); })
                            .catch(function(err){ if((err&&err.message)==='NOT_CONFIGURED'){ vSt.phone={ok:true,real:false,nc:true}; setVState('phone','ok',SOFT);} else { setVState('phone','err','본인인증에 실패했습니다. 다시 시도해주세요.'); } })
                            .then(done);
                    } else { vSt.phone={ok:true,real:false,nc:true}; setVState('phone','ok',SOFT); done(); }
                    return;
                }
                if (kind === 'email') {
                    var email = String(fd.get('email') || '').trim();
                    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setVState('email','err','이메일 형식을 확인해주세요.'); done(); return; }
                    if (isLive('email') && NWBackend.sendEmailOtp) {
                        setVState('email','','인증번호 발송 중…');
                        NWBackend.sendEmailOtp(email)
                            .then(function(){ vSt.email.sent=true; showCode('email',true); setVState('email','','메일로 받은 인증번호를 입력하세요.'); })
                            .catch(function(){ setVState('email','err','발송에 실패했습니다. 잠시 후 다시 시도해주세요.'); })
                            .then(done);
                    } else { vSt.email={ok:true,real:false,nc:true,sent:false}; setVState('email','ok',SOFT); done(); }
                    return;
                }
                if (kind === 'biz') {
                    var bno = String(fd.get('businessNo') || '').replace(/[^0-9]/g, '');
                    var ceo = String(fd.get('ceoName') || '').trim();
                    var open = String(fd.get('bizOpenDate') || '').replace(/[^0-9]/g, '');
                    if (!String(fd.get('company')||'').trim()) { setVState('biz','err','상호를 입력해주세요.'); done(); return; }
                    if (bno.length !== 10) { setVState('biz','err','사업자등록번호 10자리를 입력해주세요.'); done(); return; }
                    if (!ceo) { setVState('biz','err','대표자명을 입력해주세요.'); done(); return; }
                    if (open.length !== 8) { setVState('biz','err','개업일을 YYYYMMDD로 입력해주세요.'); done(); return; }
                    if (!NWBackend.verifyBusinessData) { vSt.biz={ok:true,real:false,nc:true}; setVState('biz','ok',SOFT); done(); return; }
                    setVState('biz','','국세청 진위확인 중…');
                    NWBackend.verifyBusinessData({ businessNo: bno, ceoName: ceo, bizOpenDate: open })
                        .then(function(){ vSt.biz={ok:true,real:true,nc:false}; setVState('biz','ok','✓ 사업자 인증 완료'); })
                        .catch(function(err){ var c=(err&&err.message)||''; if(c==='NOT_CONFIGURED'){ vSt.biz={ok:true,real:false,nc:true}; setVState('biz','ok','확인 접수 — 가입 후 관리자 승인으로 처리됩니다.'); } else { setVState('biz','err','인증 실패 — 상호·사업자번호·대표자·개업일을 확인해주세요.'); } })
                        .then(done);
                    return;
                }
                if (kind === 'account') {
                    var bank = String(fd.get('bank')||'').trim();
                    var acc = String(fd.get('account')||'').replace(/[^0-9]/g,'');
                    var holder = String(fd.get('holder')||'').trim();
                    if (!bank || !acc || !holder) { setVState('account','err','은행·계좌번호·예금주를 입력해주세요.'); done(); return; }
                    if (isLive('account') && NWBackend.verifyAccountData) {
                        setVState('account','','계좌 실명조회 중…');
                        NWBackend.verifyAccountData({ bank: bank, account: acc, holder: holder })
                            .then(function(){ vSt.account={ok:true,real:true,nc:false}; setVState('account','ok','✓ 계좌 인증 완료'); })
                            .catch(function(err){ if((err&&err.message)==='NOT_CONFIGURED'){ vSt.account={ok:true,real:false,nc:true}; setVState('account','ok',SOFT);} else { setVState('account','err','예금주가 일치하지 않습니다. 다시 확인해주세요.'); } })
                            .then(done);
                    } else { vSt.account={ok:true,real:false,nc:true}; setVState('account','ok',SOFT); done(); }
                    return;
                }
            }
            function vConfirm(kind, btn) {
                if (kind === 'email') {
                    var fd = new FormData(signupForm);
                    var email = String(fd.get('email') || '').trim();
                    var code = String(($('#suEmailCode')||{}).value || '').trim();
                    if (!code) { setVState('email','err','인증번호를 입력해주세요.'); return; }
                    if (!NWBackend.verifyEmailOtp) { setVState('email','err','인증을 사용할 수 없습니다.'); return; }
                    btn.disabled = true;
                    setVState('email','','인증번호 확인 중…');
                    NWBackend.verifyEmailOtp(email, code)
                        .then(function(){ vSt.email={ok:true,real:true,nc:false,sent:true}; showCode('email',false); setVState('email','ok','✓ 이메일 인증 완료'); })
                        .catch(function(){ setVState('email','err','인증번호가 올바르지 않습니다.'); })
                        .then(function(){ btn.disabled=false; });
                }
            }
            signupForm.addEventListener('click', function (e) {
                var s = e.target.closest('[data-vsend]'), c = e.target.closest('[data-vconfirm]');
                if (s) { e.preventDefault(); vSend(s.getAttribute('data-vsend'), s); }
                else if (c) { e.preventDefault(); vConfirm(c.getAttribute('data-vconfirm'), c); }
            });

            // 단계 전환
            var step1 = $('#signupStep1'), step2 = $('#signupStep2');
            function gotoStep(n) {
                if (step1) { step1.hidden = n !== 1; step1.classList.toggle('active', n === 1); }
                if (step2) { step2.hidden = n !== 2; step2.classList.toggle('active', n === 2); }
                var panel = $('#loginPanelSignup'); if (panel) panel.scrollTop = 0;
            }
            signupForm._gotoStep = gotoStep;
            signupForm._resetVerify = function () { ['phone','email','biz','account'].forEach(resetV); };
            // 유형(일반/업체/제휴사)에 맞춰 사업자·계좌 블록·문구·버튼 라벨 조정
            signupForm._applyRole = function (role) {
                var biz = role === 'vendor' || role === 'partner';
                var blk = $('#suBizBlock'); if (blk) blk.hidden = !biz;
                var hint = $('#signupStep2Hint');
                if (hint) hint.textContent = biz
                    ? '휴대폰·사업자·계좌 인증은 필수, 이메일은 선택입니다.'
                    : '휴대폰 인증은 필수, 이메일 인증은 선택입니다.';
                var sub = $('#signupSubmitBtn'); if (sub) sub.textContent = biz ? '가입 신청' : '가입 완료';
                var ttl = $('#signupStep1Title');
                if (ttl) ttl.innerHTML = (role === 'vendor' ? '업체 회원' : role === 'partner' ? '제휴사' : '기본 정보를') + '<br>입력해 주세요.';
            };
            var nextBtn = $('#signupNext');
            if (nextBtn) nextBtn.addEventListener('click', function () {
                var fd = new FormData(signupForm);
                var name = String(fd.get('name') || '').trim();
                var username = String(fd.get('username') || '').trim();
                var pw = String(fd.get('pw') || ''), pw2 = String(fd.get('pw2') || '');
                var postcode = String(fd.get('postcode') || '').trim(), addr1 = String(fd.get('addr1') || '').trim();
                if (!name) { alert('이름을 입력해주세요.'); return; }
                if (!/^[A-Za-z0-9_]{4,}$/.test(username)) { alert('아이디는 영문·숫자·밑줄(_) 4자 이상으로 입력해주세요.'); return; }
                if (!postcode || !addr1) { alert('주소를 입력해주세요. ("주소 찾기" 버튼)'); return; }
                if (pw.length < 8) { alert('비밀번호는 8자 이상이어야 합니다.'); return; }
                if (pw !== pw2) { alert('비밀번호가 일치하지 않습니다.'); return; }
                var ag = $('#signupAgree'); if (ag && !ag.checked) { alert('이용약관·개인정보처리방침에 동의해주세요.'); return; }
                gotoStep(2);
            });
            var prevBtn = $('#signupPrev');
            if (prevBtn) prevBtn.addEventListener('click', function () { gotoStep(1); });

            // 주소 검색(다음 우편번호)
            var addrBtn = $('#signupFindAddr');
            if (addrBtn) addrBtn.addEventListener('click', function () {
                if (!(window.daum && window.daum.Postcode)) {
                    alert('주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
                    return;
                }
                new window.daum.Postcode({
                    oncomplete: function (data) {
                        var addr = data.roadAddress || data.jibunAddress || '';
                        var pc = $('#signupPostcode'); if (pc) pc.value = data.zonecode || '';
                        var a1 = $('#signupAddr1'); if (a1) a1.value = addr;
                        var a2 = $('#signupAddr2'); if (a2) a2.focus();
                    }
                }).open();
            });

            signupForm.addEventListener('submit', function (e) {
                e.preventDefault();
                // 1단계에서 엔터로 제출되면 '다음'으로 처리
                if (step2 && step2.hidden) { if (nextBtn) nextBtn.click(); return; }
                var fd = new FormData(signupForm);
                var role = fd.get('role') || 'customer';
                var bizRole = (role === 'vendor' || role === 'partner');
                var d = {
                    name: String(fd.get('name') || '').trim(),
                    username: String(fd.get('username') || '').trim(),
                    phone: String(fd.get('phone') || '').trim(),
                    email: String(fd.get('email') || '').trim(),
                    password: String(fd.get('pw') || ''),
                    role: role,
                    postcode: String(fd.get('postcode') || '').trim(),
                    addr1: String(fd.get('addr1') || '').trim(),
                    addr2: String(fd.get('addr2') || '').trim(),
                    company: String(fd.get('company') || '').trim(),
                    businessNo: String(fd.get('businessNo') || '').replace(/[^0-9]/g, ''),
                    ceoName: String(fd.get('ceoName') || '').trim(),
                    bizOpenDate: String(fd.get('bizOpenDate') || '').replace(/[^0-9]/g, ''),
                    bank: String(fd.get('bank') || '').trim(),
                    account: String(fd.get('account') || '').replace(/[^0-9]/g, ''),
                    holder: String(fd.get('holder') || '').trim()
                };
                d.bizName = d.company;

                // 2단계 필수: 휴대폰(필수) / 이메일(선택)
                if (!d.phone) { alert('휴대폰 번호를 입력해주세요. (필수)'); return; }
                // "라이브"로 켜진 인증은 실제 통과해야 가입. 준비 중(소프트)은 입력만으로 진행.
                if (isLive('phone') && !vSt.phone.real && !vSt.phone.nc) { alert('휴대폰 본인인증을 완료해주세요.'); return; }
                // 이메일은 선택 — 입력했고 라이브 인증이 켜져 있으면 통과 필요
                if (d.email && isLive('email') && !vSt.email.real && !vSt.email.nc) { alert('이메일 인증을 완료하거나 이메일을 비워주세요.'); return; }

                if (bizRole) {
                    if (!d.company) { alert('상호(회사명)를 입력해주세요.'); return; }
                    if (d.businessNo.length !== 10) { alert('사업자등록번호 10자리를 입력해주세요.'); return; }
                    if (!d.ceoName) { alert('대표자명을 입력해주세요.'); return; }
                    if (!d.bank || !d.account || !d.holder) { alert('정산 계좌(은행·계좌번호·예금주)를 입력해주세요.'); return; }
                    if (isLive('business') && !vSt.biz.real && !vSt.biz.nc) { alert('사업자 인증을 완료해주세요.'); return; }
                    if (isLive('account') && !vSt.account.real && !vSt.account.nc) { alert('계좌 인증을 완료해주세요.'); return; }
                }

                if (!backendOn()) { alert('백엔드 연결이 필요합니다.'); return; }
                var sub = $('#signupSubmitBtn');
                if (sub) { sub.disabled = true; sub.textContent = '처리 중...'; }
                NWBackend.signUp(d)
                    .then(function () {
                        signupForm.reset();
                        signupForm._resetVerify();
                        var blk = $('#suBizBlock'); if (blk) blk.hidden = true;
                        gotoStep(1);
                        closeLoginModal();
                        if (bizRole) {
                            alert(d.name + '님, 가입 신청이 접수되었습니다.\n관리자 승인 후 ' + (role === 'partner' ? '상품 등록·판매' : '입찰 기능') + '을 이용하실 수 있습니다.');
                        } else {
                            alert(d.name + '님, 회원가입이 완료되었습니다. 바로 이용하실 수 있어요.');
                        }
                    })
                    .catch(function (err) { alert('회원가입 실패: ' + authErrorMsg(err)); })
                    .then(function () { if (sub) { sub.disabled = false; sub.textContent = bizRole ? '가입 신청' : '가입 완료'; } });
            });
        }
    }

    /* ============ 가로 스와이프 (드래그 + 자동 슬라이드) ============ */
    function initHScroll() {
        $$('[data-hscroll]').forEach(function (el) {
            var isDown = false;
            var startX, scrollLeft;
            var moved = false;
            var autoTimer = null;
            var pausedUntil = 0;

            // 드래그
            el.addEventListener('mousedown', function (e) {
                isDown = true;
                moved = false;
                el.classList.add('dragging');
                startX = e.pageX - el.offsetLeft;
                scrollLeft = el.scrollLeft;
                pausedUntil = Date.now() + 5000;
            });
            el.addEventListener('mouseleave', function () { isDown = false; el.classList.remove('dragging'); });
            el.addEventListener('mouseup', function () { isDown = false; el.classList.remove('dragging'); });
            el.addEventListener('mousemove', function (e) {
                if (!isDown) return;
                e.preventDefault();
                var x = e.pageX - el.offsetLeft;
                var walk = (x - startX) * 1.2;
                if (Math.abs(walk) > 4) moved = true;
                el.scrollLeft = scrollLeft - walk;
            });

            // 드래그 중 카드 클릭 방지
            el.addEventListener('click', function (e) {
                if (moved) {
                    e.preventDefault();
                    e.stopPropagation();
                    moved = false;
                }
            }, true);

            // 터치 (사용자 액션)
            el.addEventListener('touchstart', function () {
                pausedUntil = Date.now() + 5000;
            }, { passive: true });
            el.addEventListener('touchmove', function () {
                pausedUntil = Date.now() + 5000;
            }, { passive: true });

            // 휠은 가로/세로 변환하지 않음 - 페이지 스크롤 그대로
            // (사용자가 "스크롤 말고 스와이프로" 요청)

            // 자동 슬라이드 (3초마다 다음 카드)
            function autoSlide() {
                if (Date.now() < pausedUntil) return;

                var firstCard = el.querySelector('.hcard');
                if (!firstCard) return;
                var cardWidth = firstCard.offsetWidth + 14; // gap 14
                var maxScroll = el.scrollWidth - el.clientWidth;

                if (el.scrollLeft + cardWidth + 5 > maxScroll) {
                    // 끝에 도달 → 처음으로 부드럽게
                    el.scrollTo({ left: 0, behavior: 'smooth' });
                } else {
                    el.scrollBy({ left: cardWidth, behavior: 'smooth' });
                }
            }
            autoTimer = setInterval(autoSlide, 3000);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* ============ 1. 라우팅 ============ */
    var VALID = ['home', 'compare', 'collection', 'insight', 'brand', 'about', 'contact', 'sell', 'buy', 'repair', 'cat-update', 'cat-sale', 'cat-new', 'cat-today', 'appraisal', 'wishlist'];

    function applyPage(target) {
        if (VALID.indexOf(target) === -1) target = 'home';

        $$('.page').forEach(function (p) {
            p.classList.toggle('active', p.id === target);
        });
        $$('.tab-item').forEach(function (t) {
            t.classList.toggle('active', t.dataset.nav === target);
        });

        var header = $('#header');
        if (header) {
            if (target === 'home') header.classList.remove('light-page');
            else header.classList.add('light-page');
        }
        window.scrollTo(0, 0);
        setTimeout(refreshReveals, 50);
        logPageView('#' + target);
    }

    // 방문 추적(누가/언제/어떤 화면) — analytics.sql 미설치 시 자동 무시
    var _lastLoggedPath = '', _pvTimer = null;
    function logPageView(path) {
        if (path === _lastLoggedPath) return;
        _lastLoggedPath = path;
        clearTimeout(_pvTimer);
        _pvTimer = setTimeout(function () {
            if (window.NWBackend && NWBackend.logPageView) NWBackend.logPageView(path);
        }, 300);
    }

    function navigate(target) {
        if (!target) return;
        if (location.hash !== '#' + target) {
            history.pushState({ page: target }, '', '#' + target);
        }
        applyPage(target);
    }

    function initRouter() {
        var initial = (location.hash || '#home').slice(1) || 'home';
        applyPage(initial);

        document.addEventListener('click', function (e) {
            var el = e.target.closest('[data-nav]');
            if (!el) return;
            var target = el.dataset.nav;
            if (!target || VALID.indexOf(target) === -1) return;
            e.preventDefault();
            navigate(target);
        });

        window.addEventListener('popstate', function () {
            var t = (location.hash || '#home').slice(1) || 'home';
            applyPage(t);
        });
    }

    /* ============ 2. 헤더 스크롤 ============ */
    function initHeaderHeight() {
        var header = $('#header');
        if (!header) return;
        function sync() {
            var h = header.getBoundingClientRect().height;
            document.documentElement.style.setProperty('--header-real-h', h + 'px');
        }
        sync();
        if (window.ResizeObserver) new ResizeObserver(sync).observe(header);
    }

    /* ============ 타임세일 카운트다운 (초 단위 실시간) ============ */
    var _countdownTimer = null;
    function initCountdowns() {
        if (_countdownTimer) clearInterval(_countdownTimer);
        function tick() {
            var now = Date.now();
            $$('.hcard-countdown[data-end]').forEach(function (el) {
                var end = parseInt(el.dataset.end, 10);
                if (!end) return;
                var diff = end - now;
                if (diff <= 0) { el.textContent = '⏱ 종료됨'; el.style.color = '#999'; return; }
                var h = Math.floor(diff / 3600000);
                var m = Math.floor((diff % 3600000) / 60000);
                var s = Math.floor((diff % 60000) / 1000);
                var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
                el.textContent = '⏱ 종료까지 ' + pad(h) + ':' + pad(m) + ':' + pad(s);
            });
        }
        tick();
        _countdownTimer = setInterval(tick, 1000);
    }

    function initHeaderScroll() {
        var header = $('#header');
        if (!header) return;
        window.addEventListener('scroll', function () {
            if (window.scrollY > 30) header.classList.add('scrolled');
            else header.classList.remove('scrolled');
        }, { passive: true });
    }

    /* ============ 3. 컬렉션 탭 ============ */
    function initCollectionTabs() {
        $$('.col-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                var t = tab.dataset.coltab;
                $$('.col-tab').forEach(function (x) { x.classList.remove('active'); });
                $$('.col-panel').forEach(function (x) { x.classList.remove('active'); });
                tab.classList.add('active');
                var panel = $('#panel-' + t);
                if (panel) panel.classList.add('active');
                clearSearchFilter(); // 탭 전환 시 검색 필터 해제
            });
        });
    }

    /* ============ 4. 필터 칩 ============ */
    function initFilterChips() {
        $$('.filter-chip').forEach(function (chip) {
            chip.addEventListener('click', function () {
                var p = chip.parentElement;
                if (!p) return;
                $$('.filter-chip', p).forEach(function (c) { c.classList.remove('active'); });
                chip.classList.add('active');
            });
        });
    }

    /* ============ 5. 인사이트 카테고리 필터 ============ */
    function initInsightFilter() {
        var tabs = $$('.insight-tab');
        var partnerGrid = $('#partnerGrid');

        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                var cat = tab.dataset.cat;
                // 동적으로 추가된 글/후기도 포함하도록 매 클릭 시 재조회
                var rows = $$('.insight-row[data-cat]');
                tabs.forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');

                if (cat === 'partner') {
                    // 제휴처 탭: 제휴처 그리드만 표시, 글 리스트 숨김
                    rows.forEach(function (row) { row.style.display = 'none'; });
                    if (partnerGrid) partnerGrid.style.display = 'block';
                } else {
                    if (partnerGrid) partnerGrid.style.display = 'none';
                    rows.forEach(function (row) {
                        row.style.display = (cat === 'all' || row.dataset.cat === cat) ? '' : 'none';
                    });
                }
            });
        });
    }

    /* ============ 6. 인사이트 게시글 모달 ============ */
    var DUMMY_BODIES = {
        'price': '본 글에서는 최근 6개월간의 시세 흐름을 모델별로 분석합니다.\n\n주요 모델의 매입 시세는 글로벌 옥션 결과를 바탕으로 집계되었으며, 분기별 변동을 함께 살펴봅니다.\n\n향후 6개월간의 시세 전망과 함께, 매입을 고려하시는 분들이 참고하실 수 있는 핵심 포인트를 정리했습니다.',
        'guide': '명품시계를 매입하실 때 매입가에 영향을 미치는 핵심 요소들을 알아봅니다.\n\n보증서, 박스, 풀세트 보관 상태, 컨디션, 진품 여부, 시리얼 번호 매칭 등 각 요소별로 매입가가 최대 30%까지 차이날 수 있으니 사전 체크가 중요합니다.\n\n40년 경력 감정사가 직접 알려드리는 실전 노하우를 정리했습니다.',
        'brand': '브랜드의 역사와 함께 현재 매입 시장에서의 가치를 짚어봅니다.\n\n탄생 배경, 대표 모델, 시장에서의 위상까지 - 매입을 고려하시는 분이라면 알아두면 좋을 브랜드 정보를 깊이 있게 다룹니다.\n\n각 브랜드별 핵심 모델과 매입 시 평가 포인트를 함께 안내드립니다.',
        'wiki': '시계의 무브먼트와 메커니즘에 대한 전문 지식을 정리합니다.\n\n칼럼 휠과 캠 방식의 차이, 인하우스 무브먼트와 외주 무브먼트, 매입 시 무브먼트 상태를 평가하는 방법까지.\n\n시계 애호가뿐 아니라 매입을 고려하시는 분도 꼭 알아야 할 기초 지식입니다.',
        'review': '실제 고객님이 남겨주신 매입 후기입니다.\n\n벨로르를 선택하신 이유, 거래 진행 과정, 그리고 만족하셨던 부분들을 진솔하게 공유해주셨습니다.\n\n매입을 고려하시는 분들께 참고가 되었으면 좋겠습니다. 항상 신뢰로 보답하겠습니다.'
    };

    function initInsightModal() {
        var modal = $('#postModal');
        if (!modal) return;

        document.addEventListener('click', function (e) {
            var row = e.target.closest('.insight-row');
            if (row) {
                e.preventDefault();
                openPost(row);
                return;
            }
            if (e.target.closest('[data-close]')) {
                e.preventDefault();
                closePost();
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closePost();
        });

        function openPost(row) {
            var imgEl = row.querySelector('img');
            var titleEl = row.querySelector('h3');
            var tagEl = row.querySelector('.tag-mini');
            var metaEl = row.querySelector('.insight-meta');
            var pEl = row.querySelector('p');
            var cat = row.dataset.cat;

            $('#postModalImg').src = imgEl ? imgEl.src : '';
            $('#postModalTitle').textContent = titleEl ? titleEl.textContent : '';
            $('#postModalTag').textContent = tagEl ? tagEl.textContent : '';
            $('#postModalMeta').innerHTML = metaEl ? metaEl.innerHTML : '';

            var body = row.dataset.body ? row.dataset.body : (DUMMY_BODIES[cat] || '본문 내용 준비 중입니다.');
            var lead = pEl ? '<p><strong>' + esc(pEl.textContent) + '</strong></p>' : '';
            var paragraphs = body.split('\n\n').map(function (t) { return '<p>' + esc(t).replace(/\n/g, '<br>') + '</p>'; }).join('');
            $('#postModalText').innerHTML = lead + paragraphs;

            modal.hidden = false;
            document.body.style.overflow = 'hidden';
        }

        function closePost() {
            modal.hidden = true;
            document.body.style.overflow = '';
        }
    }

    /* ============ 7. 사진 업로드 ============ */
    var uploadedPhotos = [];

    function initPhotoUpload() {
        var input = $('#photoInput');
        var grid = $('#uploadGrid');
        if (!input || !grid) return;

        input.addEventListener('change', function (e) {
            var files = Array.from(e.target.files || []);
            if (files.length === 0) return;

            files.forEach(function (file) {
                var reader = new FileReader();
                reader.onload = function (ev) {
                    uploadedPhotos.push(ev.target.result);
                    renderUploadGrid();
                };
                reader.readAsDataURL(file);
            });

            input.value = '';
        });

        grid.addEventListener('click', function (e) {
            var btn = e.target.closest('.remove-btn');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            var idx = parseInt(btn.dataset.idx, 10);
            if (!isNaN(idx)) {
                uploadedPhotos.splice(idx, 1);
                renderUploadGrid();
            }
        });

        enablePhotoReorder(grid, function () { return uploadedPhotos; }, renderUploadGrid);
    }

    function renderUploadGrid() {
        var grid = $('#uploadGrid');
        if (!grid) return;
        $$('.upload-cell.has-img', grid).forEach(function (c) { c.remove(); });
        var addCell = $('.upload-add', grid);

        uploadedPhotos.forEach(function (src, idx) {
            var cell = document.createElement('div');
            cell.className = 'upload-cell has-img';
            cell.dataset.idx = idx;
            cell.innerHTML =
                '<img src="' + src + '" alt="" draggable="false">' +
                '<button type="button" class="remove-btn" data-idx="' + idx + '" aria-label="삭제">×</button>';
            if (addCell) grid.insertBefore(cell, addCell);
            else grid.appendChild(cell);
        });
    }

    /* 사진 셀 드래그 순서변경 (마우스 + 터치 공용 / 첫 사진이 대표 이미지)
       · 손가락/커서를 그대로 따라오는 떠다니는 클론(ghost)
       · 지나가는 칸은 부드럽게 밀려남(FLIP 애니메이션)
       grid: 업로드 그리드 · getPhotos: 현재 사진 배열 반환 · render: 다시 그리기 */
    function enablePhotoReorder(grid, getPhotos, render) {
        if (!grid || grid._reorderOn) return;
        grid._reorderOn = true;
        var pid = null, sx = 0, sy = 0, ox = 0, oy = 0;
        var src = null, ghost = null, gw = 0, gh = 0, moving = false;

        function cells() {
            return $$('.upload-cell.has-img', grid).filter(function (c) { return c !== src; });
        }
        // 커서 위치에 가장 가까운 칸 앞/뒤를 찾아 src 를 그 자리로 이동(FLIP)
        function reflow(x, y) {
            var list = cells();
            var target = null, after = false;
            for (var i = 0; i < list.length; i++) {
                var r = list[i].getBoundingClientRect();
                var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                // 같은 줄(세로 근접)에서 좌우, 아니면 위/아래로 판정
                if (y < r.top - 4) continue;
                if (y > r.bottom + 4) { target = list[i]; after = true; continue; }
                target = list[i];
                after = x > cx;
                break;
            }
            if (!target) return;
            // FLIP: 이동 전 위치 기록
            var all = $$('.upload-cell.has-img', grid);
            var first = all.map(function (c) { return c.getBoundingClientRect(); });
            if (after) {
                if (target.nextSibling !== src) grid.insertBefore(src, target.nextSibling);
            } else {
                if (target.previousSibling !== src) grid.insertBefore(src, target);
            }
            // 이동 후 위치 → 역변환 후 0으로 트랜지션
            all.forEach(function (c, i) {
                if (c === src) return;
                var last = c.getBoundingClientRect();
                var fx = first[i].left - last.left, fy = first[i].top - last.top;
                if (!fx && !fy) return;
                c.style.transition = 'none';
                c.style.transform = 'translate(' + fx + 'px,' + fy + 'px)';
                requestAnimationFrame(function () {
                    c.style.transition = 'transform .18s ease';
                    c.style.transform = '';
                });
            });
        }
        function moveGhost(x, y) {
            if (ghost) ghost.style.transform = 'translate(' + (x - ox) + 'px,' + (y - oy) + 'px) scale(1.03)';
        }
        grid.addEventListener('pointerdown', function (e) {
            var cell = e.target.closest('.upload-cell.has-img');
            if (!cell || e.target.closest('.remove-btn')) return;
            pid = e.pointerId; src = cell;
            sx = e.clientX; sy = e.clientY; moving = false;
        });
        grid.addEventListener('pointermove', function (e) {
            if (pid === null || e.pointerId !== pid) return;
            var dx = e.clientX - sx, dy = e.clientY - sy;
            if (!moving) {
                if (dx * dx + dy * dy < 36) return;   // 6px 이상 움직이면 드래그 시작
                moving = true;
                try { grid.setPointerCapture(pid); } catch (err) {}
                var r = src.getBoundingClientRect();
                gw = r.width; gh = r.height;
                ox = e.clientX - r.left; oy = e.clientY - r.top;   // 잡은 지점 유지
                ghost = src.cloneNode(true);
                ghost.className = 'upload-cell has-img reorder-ghost';
                ghost.style.width = gw + 'px';
                ghost.style.height = gh + 'px';
                ghost.style.left = '0';
                ghost.style.top = '0';
                document.body.appendChild(ghost);
                moveGhost(e.clientX, e.clientY);
                src.classList.add('reorder-src');
            }
            e.preventDefault();
            moveGhost(e.clientX, e.clientY);
            reflow(e.clientX, e.clientY);
        });
        function end() {
            if (pid === null) return;
            if (moving) {
                // 현재 DOM 순서대로 사진 배열 재구성
                var photos = getPhotos();
                if (photos) {
                    var order = $$('.upload-cell.has-img', grid).map(function (c) {
                        return parseInt(c.dataset.idx, 10);
                    });
                    var next = order.map(function (i) { return photos[i]; })
                                    .filter(function (v) { return v != null; });
                    if (next.length === photos.length) {
                        photos.length = 0;
                        Array.prototype.push.apply(photos, next);
                    }
                }
                if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
                ghost = null;
                if (src) src.classList.remove('reorder-src');
                $$('.upload-cell.has-img', grid).forEach(function (c) {
                    c.style.transition = ''; c.style.transform = '';
                });
                render();
            }
            try { grid.releasePointerCapture(pid); } catch (err) {}
            pid = null; src = null; moving = false;
        }
        grid.addEventListener('pointerup', end);
        grid.addEventListener('pointercancel', end);
    }

    /* ============ 8. 비교견적 폼 ============ */
    var submittedItems = [];

    // 회원가입 후 이어서 신청할 견적 데이터(세션 메모리에 보관)
    var pendingCompare = null;

    function initCompareForm() {
        var form = $('#compareForm');
        if (!form) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var fd = new FormData(form);
            var brand = fd.get('brand');
            var model = fd.get('model');
            var name = fd.get('name');
            var phone = fd.get('phone');
            var memo = fd.get('memo') || '';

            if (!brand || !model || !name || !phone) {
                alert('필수 항목(*)을 모두 입력해주세요.');
                return;
            }
            if (uploadedPhotos.length === 0) {
                alert('시계 사진을 1장 이상 등록해주세요.');
                return;
            }

            var payload = {
                brand: brand, model: model, name: name, phone: phone, memo: memo,
                year: fd.get('year') || '', ref: fd.get('ref') || '',
                parts: (fd.getAll ? fd.getAll('parts') : []),
                photos: uploadedPhotos.slice(0), photoCount: uploadedPhotos.length
            };

            // 이미 로그인한 회원 → 바로 신청
            if (backendOn() && NWBackend.currentUser()) {
                doCompareSubmit(payload, 'member');
                return;
            }

            // 비회원 → 안내 팝업 (비회원 신청 / 회원가입 후 신청)
            if (window.belloreModal) {
                window.belloreModal(
                    '비회원도 비교견적을 신청할 수 있어요.\n\n회원으로 신청하시면 입찰 현황을 실시간으로 확인하고, 최고가가 들어올 때 금액 알림을 받을 수 있습니다.',
                    [
                        { label: '비회원으로 신청', cls: 'bl-cancel', cb: function () { doCompareSubmit(payload, 'guest'); } },
                        { label: '회원가입하고 신청', cls: 'bl-ok', cb: function () { startSignupThenSubmit(payload); } }
                    ]
                );
            } else {
                doCompareSubmit(payload, 'guest');
            }
        });

        // 회원가입/로그인이 완료되면, 대기 중인 견적을 자동으로 이어서 신청 + 메일 발송
        if (backendOn() && NWBackend.onAuthChange) {
            NWBackend.onAuthChange(function (user) {
                if (user && pendingCompare) {
                    var p = pendingCompare; pendingCompare = null;
                    closeLoginModal();
                    setTimeout(function () { doCompareSubmit(p, 'member'); }, 400);
                }
            });
        }
    }

    // 실제 신청 처리 — 메일은 폼서밋으로 벨로르(관리자)에게만 발송
    function doCompareSubmit(p, mode) {
        var form = $('#compareForm');
        sendLead('비교견적 신청' + (mode === 'guest' ? ' (비회원)' : ''), {
            브랜드: p.brand, 모델: p.model, 구입시기: p.year || '-',
            구성품: (p.parts && p.parts.length ? p.parts.join(', ') : '-'),
            이름: p.name, 연락처: p.phone, 메모: p.memo || '-',
            사진수: p.photoCount + '장', 회원여부: (mode === 'member' ? '회원' : '비회원')
        });

        function finishLocal() {
            var item = {
                id: Date.now(), brand: p.brand, model: p.model,
                photo: p.photos[0], photoCount: p.photoCount, memo: p.memo,
                submittedAt: new Date().toLocaleString('ko-KR', { hour12: false })
            };
            submittedItems.unshift(item);
            renderMyItems();
            if (form) {
                showSubmitSuccess(form);
                form.reset();
            }
            uploadedPhotos.length = 0;
            renderUploadGrid();
            setTimeout(function () {
                var myItems = $('#myItems');
                if (myItems) myItems.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 600);
        }

        // 회원이면 DB에 매물 등록(실시간 입찰 대상), 비회원이면 로컬 목록만
        if (mode === 'member' && backendOn() && NWBackend.currentUser()) {
            var btn = form && form.querySelector('[type="submit"]');
            if (btn) btn.disabled = true;
            NWBackend.addListing({
                brand: p.brand, model: p.model, name: p.name, phone: p.phone, memo: p.memo,
                ref: p.ref || '', year: p.year || '',
                parts: (p.parts && p.parts.length ? p.parts.join(', ') : ''),
                photos: p.photos, photoCount: p.photoCount
            }).then(function () {
                if (form) { showSubmitSuccess(form); form.reset(); }
                uploadedPhotos.length = 0;
                renderUploadGrid();
            }).catch(function (err) {
                alert('매물 등록 실패: ' + (err && err.message ? err.message : err));
            }).then(function () {
                if (btn) btn.disabled = false;
            });
        } else {
            finishLocal();
        }
    }

    // 회원가입하고 신청 — 입력값/사진을 보관한 뒤 회원가입 탭을 연다
    function startSignupThenSubmit(p) {
        pendingCompare = p;
        try {
            localStorage.setItem('bellore_compare_pending', JSON.stringify({ brand: p.brand, model: p.model, at: Date.now() }));
        } catch (e) {}
        openLoginModal();
        if (window.BELLORE_showLoginPanel) window.BELLORE_showLoginPanel('type');
    }

    function renderMyItems() {
        var el = $('#myItems');
        if (!el) return;
        if (submittedItems.length === 0) {
            el.innerHTML =
                '<div class="empty-items">' +
                '<p>아직 등록한 매물이 없습니다.</p>' +
                '<p class="sub">위에서 시계 정보를 등록해보세요.</p>' +
                '</div>';
            return;
        }
        el.innerHTML = submittedItems.map(function (it) {
            return '' +
                '<div class="my-item">' +
                '<div class="my-item-img"><img src="' + it.photo + '" alt=""></div>' +
                '<div class="my-item-info">' +
                '<strong>' + it.brand + ' · ' + it.model + '</strong>' +
                '<p>사진 ' + it.photoCount + '장 · ' + it.submittedAt + '</p>' +
                '</div>' +
                '<div class="my-item-status">승인 중</div>' +
                '</div>';
        }).join('');
    }

    function showSubmitSuccess(form) {
        var old = $('.submit-success');
        if (old) old.remove();
        var box = document.createElement('div');
        box.className = 'submit-success';
        box.innerHTML =
            '<strong>✓ 등록이 완료되었습니다</strong>' +
            '<p>정가품 구별 및 감정 승인 대기중 입니다.<br>승인 완료 시 카카오톡으로 안내드립니다.</p>';
        form.parentNode.appendChild(box);
        setTimeout(function () {
            box.style.transition = 'opacity 0.5s';
            box.style.opacity = '0';
            setTimeout(function () { if (box.parentNode) box.remove(); }, 500);
        }, 6000);
    }

    /* ============ 9. 비교견적 페이지 - 실시간 경매 ============ */
    // 시계가 바뀌면서 사진과 금액이 동시에 변함. 8회 입찰 후 마지막 가격 잠시 유지 → 다음 시계
    var BIDDERS = ['S', 'T', 'H', 'D', 'M', 'G', 'C', 'N', 'K', 'P', 'Y', 'J'];
    var SUFFIX = ['워치', '딜러', '시계'];

    var WATCH_LIST = [
        {
            brand: 'ROLEX',
            model: '서브마리너 데이트 풀세트',
            img: 'assets/2026-03-18_이미지자료_193209.jpg',
            base: 12000000,
            top: 19000000
        },
        {
            brand: 'PATEK PHILIPPE',
            model: '노틸러스 5711/1A',
            img: 'assets/KakaoTalk_20250502_221302124_02.jpg',
            base: 42000000,
            top: 52000000
        },
        {
            brand: 'AUDEMARS PIGUET',
            model: '로열오크 15500ST 블루',
            img: 'assets/KakaoTalk_20250513_003812408_03.jpg',
            base: 38000000,
            top: 48000000
        },
        {
            brand: 'VACHERON CONSTANTIN',
            model: '오버시즈 퍼페추얼',
            img: 'assets/KakaoTalk_20250428_224216035.jpg',
            base: 32000000,
            top: 42000000
        },
        {
            brand: 'ROLEX',
            model: 'GMT 마스터 II 펩시',
            img: 'assets/KakaoTalk_20250506_211755713_02.jpg',
            base: 17000000,
            top: 22000000
        },
        {
            brand: 'FRANCK MULLER',
            model: '뱅가드 V45 다이아',
            img: 'assets/1(487).jpg',
            base: 26000000,
            top: 32000000
        }
    ];

    function buildSteps(base, top) {
        var steps = [];
        var n = 8;
        var diff = top - base;
        // 8회 입찰. 점진적 상승, 약간의 변동 포함
        for (var i = 0; i < n; i++) {
            var ratio = i / (n - 1); // 0 ~ 1
            // 비선형(처음엔 빠르게, 후반엔 천천히)
            ratio = 1 - Math.pow(1 - ratio, 1.8);
            var amount = Math.round((base + diff * ratio) / 100000) * 100000;
            var bidder = BIDDERS[Math.floor(Math.random() * BIDDERS.length)]
                + '■■ ' + SUFFIX[Math.floor(Math.random() * SUFFIX.length)];
            steps.push({ amount: amount, by: bidder });
        }
        steps[steps.length - 1].amount = top; // 정확히 top에서 마무리
        return steps;
    }

    function initAuction() {
        var imgEl = $('#auctionImg');
        var brandEl = $('#auctionBrand');
        var modelEl = $('#auctionModel');
        var priceEl = $('#auctionPrice');
        var barEl = $('#auctionBar');
        var minEl = $('#auctionMin');
        var maxEl = $('#auctionMax');
        var feedEl = $('#auctionFeed');

        if (!priceEl || !barEl) return;

        var watchIdx = 0;
        var bidIdx = 0;
        var steps = [];

        function fmtMan(n) {
            return (n / 10000).toLocaleString('ko-KR') + '만';
        }

        function showWatch(watch) {
            var wrap = imgEl ? imgEl.parentElement : null;
            if (wrap) wrap.classList.add('fading');
            setTimeout(function () {
                if (imgEl) imgEl.src = watch.img;
                if (brandEl) brandEl.textContent = watch.brand;
                if (modelEl) modelEl.textContent = watch.model;
                if (minEl) minEl.textContent = fmtMan(watch.base);
                if (maxEl) maxEl.textContent = fmtMan(watch.top);
                if (wrap) wrap.classList.remove('fading');
            }, 400);

            if (priceEl) priceEl.textContent = fmt(watch.base);
            updateBar(watch.base, watch.base, watch.top);
            if (feedEl) feedEl.innerHTML = '';
        }

        function updateBar(amount, base, top) {
            var ratio = Math.max(0, Math.min(1, (amount - base) / (top - base)));
            if (barEl) barEl.style.width = (ratio * 100).toFixed(1) + '%';
        }

        function showBid(step, watch) {
            if (priceEl) {
                priceEl.textContent = fmt(step.amount);
                var pw = priceEl.parentElement;
                if (pw) {
                    pw.classList.add('flash');
                    setTimeout(function () { pw.classList.remove('flash'); }, 350);
                }
            }
            updateBar(step.amount, watch.base, watch.top);

            if (feedEl) {
                var row = document.createElement('div');
                row.className = 'auction-feed-row';
                row.innerHTML =
                    '<span class="auction-feed-bidder">' + step.by + '</span>' +
                    '<span class="auction-feed-amount">' + fmt(step.amount) + '<em>원</em></span>';
                feedEl.insertBefore(row, feedEl.firstChild);
                while (feedEl.children.length > 8) feedEl.removeChild(feedEl.lastChild);
            }
        }

        function startWatch() {
            var watch = WATCH_LIST[watchIdx];
            steps = buildSteps(watch.base, watch.top);
            bidIdx = 0;
            showWatch(watch);
            setTimeout(function () { tick(watch); }, 900);
        }

        function tick(watch) {
            if (bidIdx >= steps.length) {
                setTimeout(function () {
                    watchIdx = (watchIdx + 1) % WATCH_LIST.length;
                    startWatch();
                }, 2800);
                return;
            }
            showBid(steps[bidIdx], watch);
            bidIdx++;
            setTimeout(function () { tick(watch); }, 1400);
        }

        setTimeout(startWatch, 500);
        return; // 이하 구버전 코드 비활성화

        // (구버전 - 사용 안함)
        var stage = $('#liveStage');
        var watchStage = $('#liveWatchStage');
        var bestEl = $('#liveBestPrice');
        if (!stage && !bestEl) return;

        var watchIdx = 0;
        var bidIdx = 0;
        var currentBid = null;
        var currentWatch = null;
        var steps = [];

        function showWatch(watch) {
            if (!watchStage) return;

            // 이전 시계 카드 슬라이드 아웃
            if (currentWatch) {
                var prev = currentWatch;
                prev.classList.remove('in');
                prev.classList.add('out');
                setTimeout(function () {
                    if (prev.parentNode) prev.parentNode.removeChild(prev);
                }, 450);
            }

            var card = document.createElement('div');
            card.className = 'live-watch-card';
            card.innerHTML =
                '<div class="watch-thumb"><img src="' + watch.img + '" alt=""></div>' +
                '<div class="watch-meta">' +
                '<strong>' + watch.brand + '</strong>' +
                '<span>' + watch.model + '</span>' +
                '</div>';
            watchStage.appendChild(card);
            requestAnimationFrame(function () { card.classList.add('in'); });
            currentWatch = card;
        }

        function showBid(step) {
            if (!stage) return;
            var card = document.createElement('div');
            card.className = 'live-bid-card';
            card.innerHTML =
                '<span class="bid-bidder">' + step.by + '</span>' +
                '<span class="bid-amount">' + fmt(step.amount) + '<em>원</em></span>';
            stage.appendChild(card);
            requestAnimationFrame(function () { card.classList.add('in'); });

            if (currentBid && currentBid !== card) {
                var prev = currentBid;
                prev.classList.remove('in');
                prev.classList.add('out');
                setTimeout(function () {
                    if (prev.parentNode) prev.parentNode.removeChild(prev);
                }, 600);
            }
            currentBid = card;

            if (bestEl) {
                bestEl.innerHTML = fmt(step.amount) + '<em>원</em>';
                if (bestEl.parentElement) {
                    bestEl.parentElement.classList.add('flash');
                    setTimeout(function () {
                        if (bestEl.parentElement) bestEl.parentElement.classList.remove('flash');
                    }, 250);
                }
            }
        }

        function startWatch() {
            var watch = WATCH_LIST[watchIdx];
            steps = buildSteps(watch.base, watch.top);
            bidIdx = 0;
            showWatch(watch);
            // 시계 슬라이드 후 첫 입찰
            setTimeout(tickBid, 700);
        }

        function tickBid() {
            if (bidIdx >= steps.length) {
                // 마지막 가격 잠시 유지 후 다음 시계
                setTimeout(function () {
                    watchIdx = (watchIdx + 1) % WATCH_LIST.length;
                    startWatch();
                }, 2200);
                return;
            }
            showBid(steps[bidIdx]);
            bidIdx++;
            setTimeout(tickBid, 1600);
        }

        // 시작
        setTimeout(startWatch, 400);
    }

    /* ============ 10. 이벤트 슬라이드 (컬렉션) ============ */
    function initEventSlider() {
        var track = $('#eventTrack');
        var dots = $$('.event-dot');
        if (!track) return;

        var current = 0;
        var total = $$('.event-slide', track).length;

        function go(i) {
            current = (i + total) % total;
            track.style.transform = 'translateX(-' + (current * 100) + '%)';
            dots.forEach(function (d, k) {
                d.classList.toggle('active', k === current);
            });
        }

        dots.forEach(function (d, i) {
            d.addEventListener('click', function () { go(i); resetAuto(); });
        });

        // 터치 스와이프
        var startX = 0;
        track.addEventListener('touchstart', function (e) {
            startX = e.touches[0].clientX;
        }, { passive: true });
        track.addEventListener('touchend', function (e) {
            var diff = startX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) {
                go(current + (diff > 0 ? 1 : -1));
                resetAuto();
            }
        }, { passive: true });

        var auto = setInterval(function () { go(current + 1); }, 4500);
        function resetAuto() {
            clearInterval(auto);
            auto = setInterval(function () { go(current + 1); }, 4500);
        }
    }

    /* ============ 로그인 모달 ============ */
    function initLoginModal() {
        var modal = $('#loginModal');
        var btnMy = $('#btnMy');
        if (!modal) return;

        function openMyOrLogin() {
            // 로그인 상태면 마이페이지, 아니면 로그인 모달
            if (backendOn() && NWBackend.currentUser()) { openMyPage(); return; }
            modal.hidden = false;
            document.body.style.overflow = 'hidden';
        }
        if (btnMy) btnMy.addEventListener('click', openMyOrLogin);
        var tabMy = $('#tabMy');
        if (tabMy) tabMy.addEventListener('click', openMyOrLogin);

        modal.addEventListener('click', function (e) {
            if (e.target.closest('[data-mclose]')) {
                modal.hidden = true;
                document.body.style.overflow = '';
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !modal.hidden) {
                modal.hidden = true;
                document.body.style.overflow = '';
            }
        });

        // (카카오 버튼은 initAccountUI 에서 실제 카카오 로그인으로 연결됨 — 상담 오픈채팅 핸들러 제거)

        // 헤더 검색 → search.js가 전용 검색 페이지를 엽니다(여기서는 처리하지 않음).
    }

    // 브랜드 한글↔영문 별칭 (카드는 영문 표기라 한글 검색도 매칭)
    var BRAND_ALIASES = [
        ['rolex', '롤렉스'],
        ['patek', '파텍', '파텍필립'],
        ['audemars', 'ap', '오데마', '오데마피게'],
        ['vacheron', '바쉐론', '바쉐론콘스탄틴'],
        ['richard', '리차드밀', '리차드 밀'],
        ['franck', '프랭크', '프랭크뮬러'],
        ['cartier', '까르띠에', '카르티에']
    ];

    // 한 토큰이 카드와 매칭되는지 (브랜드 별칭 또는 부분일치)
    function tokenMatches(cardText, token) {
        if (!token) return true;
        if (cardText.indexOf(token) !== -1) return true;
        for (var i = 0; i < BRAND_ALIASES.length; i++) {
            var g = BRAND_ALIASES[i];
            var isBrandTok = g.some(function (t) { return t === token || token.indexOf(t) !== -1 || t.indexOf(token) !== -1; });
            if (isBrandTok && g.some(function (t) { return cardText.indexOf(t) !== -1; })) return true;
        }
        return false;
    }
    // "롤렉스 데이트저스트"처럼 여러 토큰이면 모두 만족해야 매칭(브랜드 AND 모델)
    function cardMatches(cardText, ql) {
        var tokens = ql.split(/\s+/).filter(Boolean);
        if (!tokens.length) return false;
        for (var i = 0; i < tokens.length; i++) { if (!tokenMatches(cardText, tokens[i])) return false; }
        return true;
    }

    // 검색 결과 없음: 팝업 대신 벨로르 로고 + 안내 문구를 그리드 안에 노출
    var BELL_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
    function searchEmptyEl() {
        var el = document.getElementById('searchEmpty');
        if (!el) {
            el = document.createElement('div');
            el.id = 'searchEmpty';
            el.className = 'col-empty';
            el.hidden = true;
            el.innerHTML =
                '<img class="col-empty-logo" src="assets/logo-bellore.png" alt="BELLORE">' +
                '<p class="col-empty-q"></p>' +
                '<p class="col-empty-title">곧 만나보실 수 있도록 준비하고 있습니다</p>' +
                '<p class="col-empty-desc">현재 <b class="col-empty-watch">찾으시는 시계</b> 상품을 업로드 중입니다.<br>' +
                '조금만 기다려 주시면 원하시는 제품을 가장 좋은 컨디션으로 소개해 드리겠습니다.</p>' +
                '<button type="button" class="col-empty-alert js-alert-add" data-brand="" data-model="" data-q="">' + BELL_SVG + '<span>소식받기 — 입고되면 알려드릴게요</span></button>';
            var col = document.getElementById('collection');
            if (col) col.appendChild(el);
        }
        return el;
    }
    // 0건 안내: 해당 브랜드·모델(또는 검색어)을 기본값으로 노출 + 소식받기
    function showCollectionEmpty(brand, model, q) {
        var el = searchEmptyEl();
        brand = (brand && brand !== 'all') ? brand : '';
        model = model || '';
        var name = [brand, model].filter(Boolean).join(' ').trim();
        if (!name && q) name = q;
        var qn = el.querySelector('.col-empty-q');
        if (qn) qn.textContent = q ? '‘' + q + '’ 검색 결과' : (name ? '‘' + name + '’' : '');
        var wn = el.querySelector('.col-empty-watch');
        if (wn) wn.textContent = name || '찾으시는 시계';
        var btn = el.querySelector('.col-empty-alert');
        if (btn) {
            btn.dataset.brand = brand; btn.dataset.model = model; btn.dataset.q = q || name;
            var A = window.BELLOREAlerts;
            var done = !!(A && A.has(A.idOf({ brand: brand, model: model, q: q || name })));
            btn.classList.toggle('done', done);
            btn.disabled = done;
            btn.innerHTML = done ? '✓ 소식받기 신청 완료' : (BELL_SVG + '<span>소식받기 — 입고되면 알려드릴게요</span>');
        }
        el.hidden = false;
    }
    function showSearchEmpty(q) { showCollectionEmpty('', '', q); }
    function hideSearchEmpty() {
        var el = document.getElementById('searchEmpty');
        if (el) el.hidden = true;
    }
    window.BELLORE_hideSearchEmpty = hideSearchEmpty;
    window.BELLORE_showCollectionEmpty = showCollectionEmpty;

    function runSearch(q) {
        var ql = q.toLowerCase();
        navigate('collection');
        setTimeout(function () {
            hideSearchEmpty();
            var cards = $$('#collection .hcard');
            var hits = 0;
            cards.forEach(function (c) {
                var hit = cardMatches((c.textContent || '').toLowerCase(), ql);
                c.style.display = hit ? '' : 'none';
                if (hit) hits++;
            });
            // 브랜드 원형 활성 표시를 검색어에 맞춰 동기화(모델 칩은 닫음)
            try {
                var matchBrandBtn = null;
                $$('#collection .cat-brand').forEach(function (b) {
                    var bn = (b.dataset.brand || '').toLowerCase();
                    if (bn && bn !== 'all' && tokenMatches(ql, bn)) matchBrandBtn = b;
                });
                $$('#collection .cat-brand').forEach(function (b) { b.classList.remove('active'); });
                var actBtn = matchBrandBtn || $('#collection .cat-brand[data-brand="all"]');
                if (actBtn) actBtn.classList.add('active');
                var cm = $('#catModels'); if (cm) { cm.hidden = true; cm.innerHTML = ''; }
            } catch (e) {}
            if (!hits) {
                // 없는 모델: 결과 0건 → 안내 문구 노출(엉뚱한 브랜드로 보내지 않음)
                showSearchEmpty(q);
                var head0 = $('#collection');
                if (head0) head0.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
            // 검색 결과가 있는 패널로 전환 (탭 click 핸들러를 거치지 않고 직접 전환)
            var firstHit = cards.filter(function (c) { return c.style.display !== 'none'; })[0];
            var panel = firstHit && firstHit.closest('.col-panel');
            if (panel) {
                var tabKey = panel.id.replace('panel-', '');
                $$('.col-tab').forEach(function (x) { x.classList.remove('active'); });
                $$('.col-panel').forEach(function (x) { x.classList.remove('active'); });
                panel.classList.add('active');
                var tab = $('.col-tab[data-coltab="' + tabKey + '"]');
                if (tab) tab.classList.add('active');
            }
            var head = $('#collection');
            if (head) head.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
    }

    function clearSearchFilter() {
        hideSearchEmpty();
        $$('#collection .hcard').forEach(function (c) { c.style.display = ''; });
    }
    // 검색 페이지(search.js)에서 호출
    window.BELLORE_runSearch = runSearch;
    // 판매시계 브랜드→모델 필터는 index.html의 단일 필터 파이프라인에서 처리합니다.

    /* ============ 상품 상세 모달 ============ */
    function initProductModal() {
        var modal = $('#productModal');
        if (!modal) return;

        document.addEventListener('click', function (e) {
            // 관리자 수정/삭제 버튼 클릭은 상세 모달을 열지 않음
            if (e.target.closest('.hcard-admin, .hcard-gear, .hcard-admin-menu, .hcard-wish, .hcard-cart, .wish-card-acts')) return;
            // hcard 클릭 시 모달 오픈 (단, 드래그 중이면 cancel됨)
            var card = e.target.closest('.hcard');
            if (card && !e.defaultPrevented) {
                e.preventDefault();
                openProduct(card);
                return;
            }
            if (e.target.closest('[data-pclose]')) {
                e.preventDefault();
                closeProduct();
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !modal.hidden) closeProduct();
        });

        // 탭 클릭 → 해당 섹션으로 부드럽게 스크롤
        modal.addEventListener('click', function (e) {
            var tab = e.target.closest('[data-ppscroll]');
            if (tab) {
                var t = tab.dataset.ppscroll;
                $$('.pp-tab', modal).forEach(function (x) { x.classList.toggle('active', x.dataset.ppscroll === t); });
                var sc = modal.querySelector('.pp-scroll');
                var target = (t === 'ask') ? $('#ppAsk') : (t === 'notice') ? $('#ppNotice') : $('.pp-panel', modal);
                if (target && sc) {
                    var tabsH = (modal.querySelector('.pp-tabs') || {}).offsetHeight || 0;
                    var delta = target.getBoundingClientRect().top - sc.getBoundingClientRect().top;
                    sc.scrollTo({ top: sc.scrollTop + delta - tabsH - 4, behavior: 'smooth' });
                }
                return;
            }
            // 찜 토글은 wishlist.js 가 처리(localStorage 연동)
            // 썸네일 선택
            var th = e.target.closest('.pp-thumb');
            if (th) selectPhoto(parseInt(th.dataset.i, 10));
        });

        // 상품 공유 (상단/하단 공유 버튼 공용) — 현재 보고 있는 상품 정보 공유
        function shareCurrentProduct() {
            var p = window.BELLORE_currentProduct || {};
            var title = [p.brand, p.model].filter(Boolean).join(' ') || '벨로르 시계';
            var url = (function () {
                try {
                    var base = location.origin + location.pathname;
                    return p.listingId ? (base + '#p=' + encodeURIComponent(p.listingId)) : base;
                } catch (e) { return 'https://bellore.co.kr'; }
            })();
            var data = { title: title + ' · 벨로르', text: title + ' — 벨로르에서 확인해 보세요.', url: url };
            if (navigator.share) { navigator.share(data).catch(function () {}); return; }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(function () { alert('상품 링크를 복사했습니다.'); }, function () {});
            } else { alert(url); }
        }
        var shareTop = $('#pmShareTop'), shareBot = $('#pmShare');
        if (shareTop) shareTop.addEventListener('click', shareCurrentProduct);
        if (shareBot) shareBot.addEventListener('click', shareCurrentProduct);

        // 대표 이미지에 커서가 1초 이상 머무르면 돋보기 확대(데스크톱) / 클릭 시 라이트박스
        (function initMagnify() {
            var main = modal.querySelector('.pp-main');
            var img = $('#pmImg');
            if (!main || !img) return;
            var lens = null, hoverT = null, active = false;
            function ensureLens() {
                if (lens) return lens;
                lens = document.createElement('div');
                lens.className = 'pp-zoom-lens';
                main.appendChild(lens);
                return lens;
            }
            function move(e) {
                if (!active) return;
                var r = main.getBoundingClientRect();
                var x = (e.clientX - r.left) / r.width;
                var y = (e.clientY - r.top) / r.height;
                x = Math.max(0, Math.min(1, x)); y = Math.max(0, Math.min(1, y));
                lens.style.backgroundImage = 'url("' + img.src + '")';
                lens.style.backgroundSize = (r.width * 2.2) + 'px ' + (r.height * 2.2) + 'px';
                lens.style.backgroundPosition = (x * 100) + '% ' + (y * 100) + '%';
                lens.style.left = (e.clientX - r.left) + 'px';
                lens.style.top = (e.clientY - r.top) + 'px';
            }
            main.addEventListener('mouseenter', function () {
                clearTimeout(hoverT);
                hoverT = setTimeout(function () { active = true; ensureLens().classList.add('on'); }, 1000);
            });
            main.addEventListener('mousemove', move);
            main.addEventListener('mouseleave', function () {
                clearTimeout(hoverT); active = false;
                if (lens) lens.classList.remove('on');
            });
        })();

        var buyBtn = $('#pmBuy');
        var askBtn = $('#pmAsk');
        if (buyBtn) buyBtn.addEventListener('click', function () {
            if (window.BELLORE_openCheckout) {
                window.BELLORE_openCheckout(window.BELLORE_currentProduct);
            } else {
                window.open('https://open.kakao.com/o/sMuCaAFh', '_blank');
            }
        });
        if (askBtn) askBtn.addEventListener('click', function () {
            closeProduct();
            navigate('contact');
        });

        var curPhotos = [];
        var curIdx = 0;
        function selectPhoto(i) {
            if (!curPhotos.length) return;
            i = Math.max(0, Math.min(i, curPhotos.length - 1));
            curIdx = i;
            $('#pmImg').src = curPhotos[i];
            $('#pmIdx').textContent = (i + 1);
            $$('.pp-thumb', modal).forEach(function (t) {
                t.classList.toggle('on', parseInt(t.dataset.i, 10) === i);
            });
            // 라이트박스가 열려 있으면 함께 갱신
            if (lb && !lb.hidden) paintLightbox();
        }

        /* ===== 대표 이미지: 좌우 스와이프로 사진 넘기기 (req6) ===== */
        var ppMain = $('.pp-main', modal);
        if (ppMain) {
            var sx = 0, sy = 0, sMoved = false, sActive = false;
            ppMain.addEventListener('touchstart', function (e) {
                var t = e.touches[0]; sx = t.clientX; sy = t.clientY; sMoved = false; sActive = true;
            }, { passive: true });
            ppMain.addEventListener('touchmove', function (e) {
                if (!sActive) return;
                var t = e.touches[0];
                if (Math.abs(t.clientX - sx) > 8 || Math.abs(t.clientY - sy) > 8) sMoved = true;
            }, { passive: true });
            ppMain.addEventListener('touchend', function (e) {
                if (!sActive) return; sActive = false;
                var t = (e.changedTouches && e.changedTouches[0]) || null; if (!t) return;
                var dx = t.clientX - sx, dy = t.clientY - sy;
                if (sMoved && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
                    selectPhoto(curIdx + (dx < 0 ? 1 : -1));   // 왼쪽으로 밀면 다음
                } else if (!sMoved) {
                    openLightbox(curIdx);                       // 탭하면 확대 (req7)
                }
            });
            // 데스크톱: 클릭하면 확대
            ppMain.addEventListener('click', function (e) {
                if (e.target.closest('#pmImg')) openLightbox(curIdx);
            });
        }

        /* ===== 사진 확대 라이트박스 (req7) ===== */
        var lb = null, lbImg = null, lbCount = null;
        function ensureLightbox() {
            if (lb) return;
            lb = document.createElement('div');
            lb.className = 'pp-lightbox';
            lb.hidden = true;
            lb.innerHTML =
                '<button type="button" class="pp-lb-close" aria-label="닫기">' +
                    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                '</button>' +
                '<button type="button" class="pp-lb-nav prev" aria-label="이전"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>' +
                '<div class="pp-lb-stage"><img class="pp-lb-img" src="" alt=""></div>' +
                '<button type="button" class="pp-lb-nav next" aria-label="다음"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>' +
                '<span class="pp-lb-count"></span>';
            document.body.appendChild(lb);
            lbImg = lb.querySelector('.pp-lb-img');
            lbCount = lb.querySelector('.pp-lb-count');
            lb.addEventListener('click', function (e) {
                if (e.target.closest('.pp-lb-close')) { closeLightbox(); return; }
                if (e.target.closest('.pp-lb-nav.prev')) { selectPhoto(curIdx - 1); return; }
                if (e.target.closest('.pp-lb-nav.next')) { selectPhoto(curIdx + 1); return; }
                if (!e.target.closest('.pp-lb-img')) closeLightbox();   // 배경 탭하면 닫힘
            });
            // 라이트박스 안에서도 좌우 스와이프
            var lx = 0, lmoved = false;
            var stage = lb.querySelector('.pp-lb-stage');
            stage.addEventListener('touchstart', function (e) { lx = e.touches[0].clientX; lmoved = false; }, { passive: true });
            stage.addEventListener('touchmove', function (e) { if (Math.abs(e.touches[0].clientX - lx) > 8) lmoved = true; }, { passive: true });
            stage.addEventListener('touchend', function (e) {
                var t = e.changedTouches && e.changedTouches[0]; if (!t) return;
                var dx = t.clientX - lx;
                if (lmoved && Math.abs(dx) > 40) selectPhoto(curIdx + (dx < 0 ? 1 : -1));
            });
        }
        function paintLightbox() {
            if (!lbImg || !curPhotos.length) return;
            lbImg.src = curPhotos[curIdx];
            lbCount.textContent = (curIdx + 1) + ' / ' + curPhotos.length;
            var single = curPhotos.length <= 1;
            $$('.pp-lb-nav', lb).forEach(function (b) { b.style.display = single ? 'none' : ''; });
        }
        function openLightbox(i) {
            if (!curPhotos.length) return;
            ensureLightbox();
            if (typeof i === 'number') curIdx = Math.max(0, Math.min(i, curPhotos.length - 1));
            paintLightbox();
            lb.hidden = false;
            document.body.classList.add('pp-lb-open');
        }
        function closeLightbox() {
            if (lb) lb.hidden = true;
            document.body.classList.remove('pp-lb-open');
        }
        // 하단 상세 큰 이미지 클릭 시에도 확대
        var detailWrap = $('#pmDetailImgs');
        if (detailWrap) detailWrap.addEventListener('click', function (e) {
            var img = e.target.closest('img'); if (!img) return;
            var imgs = $$('#pmDetailImgs img');
            var di = Array.prototype.indexOf.call(imgs, img);
            // 상세 이미지는 대표 사진과 동일 배열이므로 그대로 인덱스 사용
            openLightbox(di >= 0 && di < curPhotos.length ? di : 0);
        });
        document.addEventListener('keydown', function (e) {
            if (!lb || lb.hidden) return;
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowLeft') selectPhoto(curIdx - 1);
            else if (e.key === 'ArrowRight') selectPhoto(curIdx + 1);
        });

        function ppPriceHTML(d) {
            if (!d.price) return d.priceHtml || '가격 문의';
            var sp = parseInt(d.sale_price, 10) || 0;
            if (sp > 0 && sp < d.price) {
                var rate = Math.round((1 - sp / d.price) * 100);
                return '<span class="pp-price-old">' + fmt(d.price) + '원</span>' +
                    '<span class="pp-price-now"><b class="pp-rate">' + rate + '%</b>' + fmt(sp) + '<span class="won">원</span></span>';
            }
            return fmt(d.price) + '<span class="won">원</span>';
        }
        function paintAcc(d) {
            // 구성품: 등록 시 직접 체크한 값(components)을 우선 사용, 없으면 구성 등급으로 추정
            var comp = String(d.components || '').trim();
            var state;
            if (comp) {
                var set = comp.split(',');
                state = {
                    box: set.indexOf('box') !== -1,
                    case: set.indexOf('case') !== -1,
                    card: set.indexOf('card') !== -1,
                    warranty: !!d.has_warranty
                };
            } else {
                var pack = String(d.pack || '');
                var full = (pack.indexOf('풀세트') !== -1);
                var solo = (pack.indexOf('단품') !== -1);
                state = {
                    box: full || (!solo),
                    case: true,
                    card: !!d.has_warranty || full,
                    warranty: !!d.has_warranty
                };
            }
            $$('#pmAcc .pp-acc-item').forEach(function (el) {
                var on = !!state[el.dataset.acc];
                el.classList.toggle('on', on);
                el.classList.toggle('off', !on);
            });
        }
        // 핵심 스펙 칩 (보증서 / 스탬핑 / 정품박스 / 특이사항)
        function paintChips(d) {
            var box = $('#pmChips');
            if (!box) return;
            var pack = String(d.pack || '');
            var hasBox = String(d.components || '').split(',').indexOf('box') !== -1 ||
                pack.indexOf('풀세트') !== -1 ||
                (String(d.accessories || '').indexOf('박스') !== -1);
            var rows = [
                ['보증서', d.has_warranty ? '있음' : '미표기', !!d.has_warranty],
                ['스탬핑', String(d.stamping || '').trim() || '미표기', !!String(d.stamping || '').trim()],
                ['정품 박스', hasBox ? '있음' : '미표기', hasBox],
                ['특이사항', String(d.special_note || '').trim() ? '있음' : '없음', !!String(d.special_note || '').trim()]
            ];
            box.innerHTML = rows.map(function (r) {
                return '<div class="pp-chip">' +
                    '<span class="pp-chip-l">' + r[0] + '</span>' +
                    '<span class="pp-chip-v' + (r[2] ? '' : ' off') + '">' + esc(r[1]) + '</span>' +
                    '</div>';
            }).join('');
        }
        // 상품 기본정보 표 (값 있는 항목만 노출)
        function paintSpec(d) {
            var box = $('#pmSpec');
            if (!box) return;
            function row(label, val) {
                val = (val == null ? '' : String(val)).trim();
                if (!val) return '';
                return '<div class="pp-spec-row"><span>' + label + '</span><strong>' + esc(val) + '</strong></div>';
            }
            var html = row('브랜드', d.brand) +
                row('모델', d.model) +
                row('컨디션', d.condition) +
                row('구성품', d.accessories || d.pack) +
                row('스탬핑 / 연식', d.stamping || d.purchase_year) +
                row('미리수', d.misu);
            box.innerHTML = html || '<div class="pp-spec-row"><span>정보</span><strong>등록된 상세 정보가 없습니다.</strong></div>';
        }
        // 제품 상태 (신품/중고 배지 + 설명글)
        function paintState(d) {
            var badge = $('#pmStateBadge'), desc = $('#pmStateDesc');
            if (!badge || !desc) return;
            var cond = String(d.condition || '');
            var isNew = cond.indexOf('미착용') !== -1 || cond.indexOf('신품') !== -1;
            badge.textContent = isNew ? '미착용 (신품급) 상품입니다.' : '착용 이력이 있는 중고 상품입니다.';
            badge.classList.toggle('is-new', isNew);
            // 연식·구성품은 위 '상품 기본정보' 표에 이미 있으므로 여기서는 중복 표기하지 않음
            var lines = [];
            if (String(d.detail_desc || '').trim()) lines.push(esc(String(d.detail_desc).trim()).replace(/\n/g, '<br>'));
            if (String(d.special_note || '').trim()) lines.push('<b>특이사항</b> : ' + esc(String(d.special_note).trim()));
            lines.push('<span class="pp-state-note">본 상품은 판매자가 입력한 정보이며, 구매 완료 시 벨로르 정밀 검수 후 출고됩니다. 중고 상품 특성상 스크래치·찍힘 및 사용감이 있을 수 있는 점 참고 부탁드립니다.</span>');
            desc.innerHTML = lines.map(function (l) { return '<p>' + l + '</p>'; }).join('');
        }
        function paint(d) {
            var photos = (d.photos && d.photos.length) ? d.photos : (d.img ? [d.img] : []);
            if (!photos.length) photos = ['assets/images.jpg'];
            curPhotos = photos;
            curIdx = 0;

            $('#pmBrand').textContent = d.brand || '';
            $('#pmModel').textContent = d.model || '';
            $('#pmPrice').innerHTML = ppPriceHTML(d);
            var pno = d.product_no || d.no || '-';
            $('#pmNo').textContent = pno;
            var no2 = $('#pmNo2'); if (no2) no2.textContent = pno;
            var sm = $('#pmSaleMethod'); if (sm) sm.textContent = d.sale_method || '벨로르 직접 검수 판매';
            var ship = $('#pmShip'); if (ship) ship.textContent = d.ship_info || '결제 후 2~4일 이내 발송';
            $('#pmPoint').textContent = d.price ? (fmt(Math.round(d.price * 0.01)) + 'P 적립 (1%)') : '-';
            paintAcc(d);
            paintChips(d);
            paintSpec(d);
            paintState(d);

            // 썸네일
            var thumbs = $('#pmThumbs');
            thumbs.innerHTML = photos.map(function (p, i) {
                return '<button type="button" class="pp-thumb' + (i === 0 ? ' on' : '') + '" data-i="' + i + '"><img src="' + esc(p) + '" alt=""></button>';
            }).join('');
            $('#pmTotal').textContent = photos.length;
            $('#pmIdx').textContent = '1';
            $('#pmImg').src = photos[0];

            // 하단 상세 큰 이미지
            $('#pmDetailImgs').innerHTML = photos.map(function (p) {
                return '<img src="' + esc(p) + '" alt="" loading="lazy">';
            }).join('');
        }

        function openProduct(card) {
            // 정적/동적 카드 공통: DOM 값으로 우선 렌더
            var img = card.querySelector('.hcard-img img');
            var brand = card.querySelector('.hcard-brand');
            var model = card.querySelector('.hcard-model');
            var price = card.querySelector('.hcard-price');
            var pid = card.dataset.pid || '';

            paint({
                brand: brand ? brand.textContent : (card.dataset.brand || ''),
                model: model ? model.textContent : (card.dataset.model || ''),
                priceHtml: price ? price.innerHTML.replace(/<em>/g, '<span class="won">').replace(/<\/em>/g, '</span>') : '',
                price: parseInt(card.dataset.price, 10) || 0,
                sale_price: parseInt(card.dataset.sprice, 10) || 0,
                img: img ? img.src : '',
                no: pid ? pid.slice(0, 8).toUpperCase() : '-'
            });

            // 결제용 현재 상품 정보 노출
            window.BELLORE_currentProduct = {
                listingId: pid || null,
                brand: brand ? brand.textContent : (card.dataset.brand || ''),
                model: model ? model.textContent : (card.dataset.model || ''),
                price: parseInt(card.dataset.price, 10) || 0,
                image: img ? img.src : ''
            };

            // 최근 확인한 상품 기록(검색 페이지에서 사용)
            if (window.BELLORE_recordView) window.BELLORE_recordView({
                id: pid || (card.dataset.brand + '|' + card.dataset.model),
                brand: brand ? brand.textContent : (card.dataset.brand || ''),
                model: model ? model.textContent : (card.dataset.model || ''),
                price: parseInt(card.dataset.price, 10) || 0,
                sale_price: parseInt(card.dataset.sprice, 10) || 0,
                img: img ? img.src : ''
            });

            modal.hidden = false;
            modal.querySelector('.pp-scroll').scrollTop = 0;
            $$('.pp-tab', modal).forEach(function (x, i) { x.classList.toggle('active', i === 0); });
            $$('.pp-panel', modal).forEach(function (p) { p.hidden = p.dataset.pppanel !== 'info'; });
            document.body.style.overflow = 'hidden';
            // 새로고침해도 보던 상품이 유지되도록 기록(DB 매물만)
            try { if (pid) sessionStorage.setItem('bellore_view_product', pid); } catch (e) {}
            // 조회 추적(누가 어떤 시계를 봤는지) — analytics.sql 미설치 시 자동 무시
            if (window.NWBackend && NWBackend.logProductView) {
                NWBackend.logProductView(pid || null, {
                    brand: brand ? brand.textContent : (card.dataset.brand || ''),
                    model: model ? model.textContent : (card.dataset.model || '')
                });
            }

            // DB 매물이면 전체 사진/상세 보강
            if (pid && backendOn() && NWBackend.getListing) {
                NWBackend.getListing(pid).then(function (it) {
                    if (modal.hidden) return;
                    paint({
                        brand: it.brand, model: it.model, price: it.price,
                        sale_price: it.sale_price || 0,
                        photos: it.photos, category: it.category,
                        pack: it.pack || '', has_warranty: !!it.has_warranty,
                        accessories: it.accessories || '',
                        condition: it.condition || '', size_mm: it.size_mm || 0,
                        stamping: it.stamping || '', misu: it.misu || '',
                        purchase_year: it.purchase_year || '',
                        special_note: it.special_note || '',
                        detail_desc: it.detail_desc || '',
                        components: it.components || '',
                        sale_method: it.sale_method || '',
                        product_no: it.product_no || '',
                        ship_info: it.ship_info || '',
                        no: String(it.id).slice(0, 8).toUpperCase()
                    });
                    window.BELLORE_currentProduct = {
                        listingId: it.id,
                        brand: it.brand,
                        model: it.model,
                        price: it.price || 0,
                        image: (it.photos && it.photos[0]) || ''
                    };
                }).catch(function () {});
            }
        }

        function closeProduct() {
            closeLightbox();
            modal.hidden = true;
            document.body.style.overflow = '';
            try { sessionStorage.removeItem('bellore_view_product'); } catch (e) {}
        }

        // id만으로 상세 열기(새로고침 복원 / 공유 링크)
        function openProductById(pid) {
            if (!pid || !backendOn() || !NWBackend.getListing) return;
            NWBackend.getListing(pid).then(function (it) {
                if (!it) return;
                paint({
                    brand: it.brand, model: it.model, price: it.price,
                    sale_price: it.sale_price || 0, photos: it.photos, category: it.category,
                    pack: it.pack || '', has_warranty: !!it.has_warranty, accessories: it.accessories || '',
                    condition: it.condition || '', size_mm: it.size_mm || 0, stamping: it.stamping || '',
                    misu: it.misu || '', purchase_year: it.purchase_year || '', special_note: it.special_note || '',
                    detail_desc: it.detail_desc || '', components: it.components || '', sale_method: it.sale_method || '',
                    product_no: it.product_no || '', ship_info: it.ship_info || '',
                    no: String(it.id).slice(0, 8).toUpperCase()
                });
                window.BELLORE_currentProduct = {
                    listingId: it.id, brand: it.brand, model: it.model,
                    price: it.price || 0, image: (it.photos && it.photos[0]) || ''
                };
                modal.hidden = false;
                modal.querySelector('.pp-scroll').scrollTop = 0;
                $$('.pp-tab', modal).forEach(function (x, i) { x.classList.toggle('active', i === 0); });
                $$('.pp-panel', modal).forEach(function (p) { p.hidden = p.dataset.pppanel !== 'info'; });
                document.body.style.overflow = 'hidden';
                try { sessionStorage.setItem('bellore_view_product', it.id); } catch (e) {}
                if (window.NWBackend && NWBackend.logProductView) {
                    NWBackend.logProductView(it.id, { brand: it.brand, model: it.model });
                }
            }).catch(function () {});
        }

        // 검색 페이지(최근 본 상품)에서 상세 열기
        window.BELLORE_openProductCard = openProduct;
        window.BELLORE_openProductById = openProductById;

        // 새로고침/공유 링크 복원: #p=<id> 우선, 없으면 직전에 보던 상품
        (function restoreProductView() {
            var pid = '';
            try {
                var m = (location.hash || '').match(/^#p=(.+)$/);
                if (m) pid = decodeURIComponent(m[1]);
                if (!pid) pid = sessionStorage.getItem('bellore_view_product') || '';
            } catch (e) {}
            if (pid) setTimeout(function () { openProductById(pid); }, 400);
        })();
    }

    /* ============ 11. 리빌 ============ */
    var REVEAL_SEL = '.section-title, .eyebrow, .recent-card, .option-card, .product-card, .insight-row, .brand-card, .promise-card, .brand-prev, .two-col-img, .two-col-text, .store-card, .contact-quick-card, .repair-card, .partner-stat, .ach-card, .method-row';
    var revealObserver = null;

    function initReveal() {
        if (!('IntersectionObserver' in window)) return;
        revealObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry, i) {
                if (entry.isIntersecting) {
                    setTimeout(function () { entry.target.classList.add('in'); }, i * 35);
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
        refreshReveals();
    }

    function refreshReveals() {
        if (!revealObserver) return;
        $$(REVEAL_SEL).forEach(function (el) {
            if (!el.classList.contains('reveal')) el.classList.add('reveal');
            if (!el.classList.contains('in')) revealObserver.observe(el);
        });
    }
    window.refreshReveals = refreshReveals;

    /* ============ 12. 패럴랙스 ============ */
    function initParallax() {
        var heroImage = $('.hero-image');
        if (!heroImage) return;
        window.addEventListener('scroll', function () {
            var sc = window.scrollY;
            if (sc < window.innerHeight) {
                heroImage.style.transform = 'translateY(' + (sc * 0.3) + 'px) scale(1.05)';
            }
        }, { passive: true });
    }

})();
