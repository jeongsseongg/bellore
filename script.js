/* ============================================
   벨로르 - 메인 스크립트
   ============================================ */

(function () {
    'use strict';

    function $(s, ctx) { return (ctx || document).querySelector(s); }
    function $$(s, ctx) { return Array.from((ctx || document).querySelectorAll(s)); }
    function fmt(n) { return n.toLocaleString('ko-KR'); }

    function init() {
        initRouter();
        initHeaderScroll();
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
        initBackendSync();
        initInstallPrompt();
        initAccountUI();
    }

    /* ============ 계정 UI: 구글 로그인 · 마이페이지 · 알림 · 관리자 관리 · 상품 수정 ============ */
    function openMyPage() {
        var m = $('#myPageModal');
        if (!m) return;
        m.hidden = false;
        document.body.style.overflow = 'hidden';
        renderMyItemsBackend(myListingsCache); // 현재 캐시로 즉시 렌더
    }
    function closeMyPage() {
        var m = $('#myPageModal');
        if (m) { m.hidden = true; document.body.style.overflow = ''; }
    }

    var notiCache = [];
    function initAccountUI() {
        if (!backendOn()) return;

        // 구글 로그인
        var g = $('#loginGoogle');
        if (g) {
            g.addEventListener('click', function () {
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
            if (!confirm('이 입찰을 채택하시겠어요? 채택하면 견적이 마감됩니다.')) return;
            NWBackend.awardBid(aw.dataset.quote, aw.dataset.award, aw.dataset.vendor)
                .then(function () { alert('입찰을 채택했습니다.'); })
                .catch(function (err) { alert('채택 실패: ' + (err && err.message || err)); });
        });

        // 마이페이지 모달 닫기
        var myModal = $('#myPageModal');
        if (myModal) {
            myModal.addEventListener('click', function (e) {
                if (e.target.closest('[data-myclose]')) closeMyPage();
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
                if (confirm('이 업체의 승인을 취소할까요?')) {
                    NWBackend.setVendorApproved(cn.dataset.vcancel, false)
                        .catch(function (err) { alert('취소 실패: ' + (err && err.message || err)); });
                }
            }
        });

        // 회원가입: 업체 선택 시 상호 입력칸 표시
        var roleSel = $('#signupRole');
        var companyField = $('#signupCompanyField');
        if (roleSel && companyField) {
            roleSel.addEventListener('change', function () {
                companyField.style.display = roleSel.value === 'vendor' ? '' : 'none';
            });
        }

        // 알림 모달
        var btnNoti = $('#btnNoti');
        var notiModal = $('#notiModal');
        if (btnNoti && notiModal) {
            btnNoti.addEventListener('click', function () {
                notiModal.hidden = false;
                document.body.style.overflow = 'hidden';
                renderNotiList(notiCache);
                // 열람 시 읽지 않은 알림 읽음 처리
                notiCache.forEach(function (n) {
                    if (!n.read) NWBackend.markNotificationRead(n.id).catch(function () {});
                });
            });
            notiModal.addEventListener('click', function (e) {
                if (e.target.closest('[data-noticlose]')) {
                    notiModal.hidden = true;
                    document.body.style.overflow = '';
                }
            });
        }

        // 상품 수정/삭제 (관리자)
        document.addEventListener('click', function (e) {
            var ed = e.target.closest('[data-pedit]');
            var dl = e.target.closest('[data-pdel]');
            if (ed) {
                e.preventDefault(); e.stopPropagation();
                var card = ed.closest('.hcard-dynamic');
                var brand = prompt('브랜드', card ? card.dataset.brand : '');
                if (brand === null) return;
                var model = prompt('모델명', card ? card.dataset.model : '');
                if (model === null) return;
                var price = prompt('판매가 (숫자만)', card ? card.dataset.price : '0');
                if (price === null) return;
                var priceNum = parseInt(String(price).replace(/[^0-9]/g, ''), 10) || 0;
                NWBackend.updateProduct(ed.dataset.pedit, { brand: brand, model: model, price: priceNum })
                    .then(function () { alert('수정되었습니다.'); })
                    .catch(function (err) { alert('수정 실패: ' + (err && err.message || err)); });
            } else if (dl) {
                e.preventDefault(); e.stopPropagation();
                if (confirm('이 상품을 삭제할까요?')) {
                    NWBackend.deleteProduct(dl.dataset.pdel)
                        .catch(function (err) { alert('삭제 실패: ' + (err && err.message || err)); });
                }
            }
        });

        // 로그인/권한 상태에 따라 벨·관리자 박스·구독 갱신
        var unsubNoti = null;
        var unsubAdmins = null;
        NWBackend.onAuthChange(function (user, info) {
            // 마이페이지 헤더
            var nameEl = $('#myPageName');
            var emailEl = $('#myPageEmail');
            if (nameEl) nameEl.textContent = user ? ((user.displayName || '회원') + '님') : '마이페이지';
            if (emailEl) emailEl.textContent = user ? (user.email || '') : '';

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
        });
    }

    function updateNotiBadge(n) {
        var badge = $('#notiBadge');
        if (!badge) return;
        if (n > 0) { badge.textContent = n > 99 ? '99+' : n; badge.hidden = false; }
        else badge.hidden = true;
    }

    function renderNotiList(rows) {
        var el = $('#notiList');
        if (!el) return;
        if (!rows.length) { el.innerHTML = '<div class="noti-empty">알림이 없습니다.</div>'; return; }
        el.innerHTML = rows.map(function (n) {
            return '<div class="noti-item' + (n.read ? '' : ' unread') + '">' + esc(n.text) +
                '<time>' + relTime(n.createdAt) + '</time></div>';
        }).join('');
    }

    function renderVendorList(vendors) {
        var el = $('#adminList');
        if (!el) return;
        if (!vendors || !vendors.length) {
            el.innerHTML = '<div class="admin-list-item"><span>가입한 업체가 없습니다.</span></div>';
            return;
        }
        el.innerHTML = vendors.map(function (v) {
            var nm = esc(v.company_name || v.display_name || '(이름 없음)');
            return '<div class="admin-list-item"><span>' + nm + (v.approved ? ' · 승인됨' : ' · 대기') + '</span>' +
                (v.approved
                    ? '<button type="button" data-vcancel="' + esc(v.id) + '">승인취소</button>'
                    : '<button type="button" data-vapprove="' + esc(v.id) + '">승인</button>') +
                '</div>';
        }).join('');
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

    function initInstallPrompt() {
        var btn = $('#installBtn');

        // 설치 가능 신호를 잡아 두었다가 버튼 클릭 시 즉시 네이티브 창을 띄움
        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            deferredInstallPrompt = e;
        });

        // 이미 설치되어 전체화면으로 실행 중이거나 설치 완료되면 버튼 숨김
        var standalone = window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true;
        if (btn && standalone) btn.hidden = true;

        window.addEventListener('appinstalled', function () {
            deferredInstallPrompt = null;
            if (btn) btn.hidden = true;
        });

        if (btn) {
            btn.addEventListener('click', function () {
                if (deferredInstallPrompt) {
                    deferredInstallPrompt.prompt();
                    deferredInstallPrompt.userChoice.then(function () {
                        deferredInstallPrompt = null;
                    });
                } else {
                    showInstallHelp();
                }
            });
        }
    }

    function showInstallHelp() {
        var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        if (isIOS) {
            alert('홈 화면에 추가하기 (아이폰)\n\n1) 사파리 하단의 공유 버튼(□↑)을 누르세요\n2) "홈 화면에 추가"를 선택하세요\n\n(아이폰은 사파리에서만 설치할 수 있어요)');
        } else {
            alert('홈 화면에 추가하기\n\n• 크롬 오른쪽 위 ⋮ 메뉴 → "앱 설치" 또는 "홈 화면에 추가"\n   → 확인하면 홈에 아이콘이 생겨요.\n\n• 홈 화면에 이미 "NW" 아이콘이 있다면 이미 설치된 거예요.');
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
        }

        function renderSellGrid() {
            if (!sellGrid) return;
            $$('.upload-cell.has-img', sellGrid).forEach(function (c) { c.remove(); });
            var addCell = $('.upload-add', sellGrid);
            sellPhotos.forEach(function (src, idx) {
                var cell = document.createElement('div');
                cell.className = 'upload-cell has-img';
                cell.innerHTML =
                    '<img src="' + src + '" alt="">' +
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
                alert(fd.get('name') + '님, 수리 문의가 접수되었습니다.\n1시간 이내 ' + fd.get('phone') + '으로 견적 회신드립니다.');
                repairForm.reset();
                navigate('home');
            });
        }
    }

    /* ============ 홈: LIVE 비교견적 진행 현황 보드 ============ */
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

        var bodyHtml;
        if (item.status === 'pending') {
            bodyHtml = '<p class="live-row-by">정가품 감정 진행중</p>';
        } else if (item.status === 'done' || item.status === 'end') {
            bodyHtml = '<p class="live-row-by"><b>' + item.bidder + '</b> 최종 <span class="amount">' + fmt(item.amount * 10000) + '원</span></p>';
        } else {
            bodyHtml = '<p class="live-row-by"><b>' + item.bidder + '</b>가 <span class="amount">' + fmt(item.amount * 10000) + '원</span> 입찰</p>';
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
        }
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
                if (confirm(name + ' 매물을 승인하시겠습니까?\n승인 후 고객 판매 마켓에 게시됩니다.')) {
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
                }
            } else if (action === 'reject') {
                if (confirm(name + ' 매물을 거부하시겠습니까?')) {
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
                }
            } else if (action === 'bid') {
                if (!backendOn() || !listingId) { alert('백엔드 연결이 필요합니다.'); return; }
                var amt = prompt(label + ' 매물 입찰가 (숫자만, 예: 15000000)');
                if (!amt) return;
                var amount = parseInt(String(amt).replace(/[^0-9]/g, ''), 10) || 0;
                if (!amount) { alert('금액을 숫자로 입력해주세요.'); return; }
                NWBackend.placeBid({ id: listingId, uid: uid, brand: item.dataset.brand, model: item.dataset.model }, amount)
                    .then(function () { alert(fmt(amount) + '원으로 입찰했습니다. 고객에게 알림이 전송됩니다.'); })
                    .catch(function (err) { alert('입찰 실패: ' + (err && err.message || err)); });
            }
        });

        // 관리자 시계 등록 버튼
        document.addEventListener('click', function (e) {
            if (e.target.closest('#adminAddProduct')) {
                e.preventDefault();
                var brand = prompt('브랜드 (예: ROLEX)');
                if (!brand) return;
                var model = prompt('모델명 (예: 데이트저스트 36)');
                if (!model) return;
                var price = prompt('판매가 (숫자만, 예: 15000000)');
                if (!price) return;
                var priceNum = parseInt(String(price).replace(/[^0-9]/g, ''), 10) || 0;
                if (backendOn()) {
                    NWBackend.addProduct({ brand: brand, model: model, price: priceNum })
                        .then(function () { alert(brand + ' ' + model + ' (' + fmt(priceNum) + '원) 등록 완료.'); })
                        .catch(function (err) { alert('등록 실패: ' + (err && err.message || err)); });
                } else {
                    alert(brand + ' ' + model + ' (' + fmt(priceNum) + '원) 등록 완료.');
                }
            }
        });
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
    }

    /* ============ 백엔드(Firebase) 데이터 동기화 ============
       firebase-config.js 에 키가 채워지면 자동 활성화. 키가 없으면
       backendOn() === false 라 위의 데모 동작이 그대로 유지된다. */
    function backendOn() {
        return !!(window.NWBackend && window.NWBackend.configured);
    }

    function authErrorMsg(err) {
        var code = err && err.code ? err.code : '';
        var map = {
            'auth/invalid-email': '이메일 형식이 올바르지 않습니다.',
            'auth/user-not-found': '가입되지 않은 이메일입니다.',
            'auth/wrong-password': '비밀번호가 일치하지 않습니다.',
            'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
            'auth/email-already-in-use': '이미 가입된 이메일입니다.',
            'auth/weak-password': '비밀번호는 6자 이상이어야 합니다.',
            'auth/too-many-requests': '잠시 후 다시 시도해주세요.'
        };
        return map[code] || (err && err.message) || '알 수 없는 오류';
    }

    function initBackendSync() {
        if (!backendOn()) return;

        // 로그인/관리자 상태에 따라 UI 갱신
        NWBackend.onAuthChange(function (user, info) {
            if (info && info.isAdmin) { enableAdminMode(); }
            else if (window.disableAdminMode) { disableAdminMode(); }
            updateAuthUI(user);
        });

        // SDK 로드 완료 후 실시간 구독 시작
        NWBackend.ready.then(function () {
            if (!NWBackend.enabled) return;

            // 승인된 매물은 누구나 조회 (공개 마켓)
            NWBackend.subscribeApproved(renderApprovedMarket);

            // 벨로르 판매 상품 (관리자 등록분)
            NWBackend.subscribeProducts(renderProducts);

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

    // 승인된 고객 매물 → 고객 판매 마켓 그리드 상단에 표시
    function renderApprovedMarket(rows) {
        var inner = $('#panel-user .col-grid-inner');
        if (!inner) return;
        $$('.hcard-dynamic', inner).forEach(function (el) { el.remove(); });
        var frag = document.createDocumentFragment();
        rows.forEach(function (it) {
            var card = document.createElement('article');
            card.className = 'hcard hcard-dynamic';
            card.innerHTML =
                '<div class="hcard-img"><img src="' + esc(listingImg(it)) + '" alt=""></div>' +
                '<span class="hcard-tag user">개인 판매</span>' +
                '<p class="hcard-brand">' + esc(it.brand) + '</p>' +
                '<p class="hcard-model">' + esc(it.model) + '</p>' +
                '<p class="hcard-price">감정가 산정<em></em></p>';
            frag.appendChild(card);
        });
        inner.insertBefore(frag, inner.firstChild);
    }

    // 벨로르 판매 상품 → 판매시계 그리드 상단에 표시
    function renderProducts(rows) {
        var inner = $('#panel-ny .col-grid-inner');
        if (!inner) return;
        $$('.hcard-dynamic', inner).forEach(function (el) { el.remove(); });
        var frag = document.createDocumentFragment();
        rows.forEach(function (it) {
            var priceHtml = it.price
                ? (fmt(it.price) + '<em>원</em>')
                : '가격 문의<em></em>';
            var card = document.createElement('article');
            card.className = 'hcard hcard-dynamic';
            card.dataset.pid = it.id;
            card.dataset.brand = it.brand;
            card.dataset.model = it.model;
            card.dataset.price = it.price || 0;
            card.innerHTML =
                '<div class="hcard-img"><img src="' + esc(listingImg(it)) + '" alt=""></div>' +
                '<span class="hcard-tag ny">벨로르</span>' +
                '<p class="hcard-brand">' + esc(it.brand) + '</p>' +
                '<p class="hcard-model">' + esc(it.model) + '</p>' +
                '<p class="hcard-price">' + priceHtml + '</p>' +
                '<div class="hcard-admin">' +
                '<button type="button" class="hcard-edit" data-pedit="' + esc(it.id) + '">수정</button>' +
                '<button type="button" class="hcard-del" data-pdel="' + esc(it.id) + '">삭제</button>' +
                '</div>';
            frag.appendChild(card);
        });
        inner.insertBefore(frag, inner.firstChild);
    }

    // 관리자: 승인 대기 매물 목록
    function renderAdminPending(rows) {
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
    function renderMyItemsBackend(rows) {
        myListingsCache = rows || [];
        // 비교견적 상태(quote_requests) 한글 표기
        var label = {
            pending: '승인 대기', open: '입찰 진행중', awarded: '채택 완료', closed: '종료',
            approved: '판매중', rejected: '거부됨'
        };

        function bidsHtml(it) {
            var bids = it.bids || [];
            if (!bids.length) {
                return '<p class="my-item-sub">' +
                    (it.status === 'pending'
                        ? '관리자 승인 후 업체 입찰이 시작됩니다.'
                        : '아직 들어온 입찰이 없습니다.') + '</p>';
            }
            return '<div class="my-item-bids">' + bids.map(function (b) {
                var awarded = it.awarded_bid === b.id;
                var action = (it.status === 'open')
                    ? '<button type="button" class="admin-bid-btn" data-award="' + esc(b.id) +
                      '" data-quote="' + esc(it.id) + '" data-vendor="' + esc(b.vendor_id) + '">채택</button>'
                    : (awarded ? '<span class="my-item-bid">채택됨</span>' : '');
                return '<div class="bid-row"><strong>' + fmt(b.amount) + '원</strong>' +
                    (b.message ? ' <span>' + esc(b.message) + '</span>' : '') + ' ' + action + '</div>';
            }).join('') + '</div>';
        }

        function itemHtml(it) {
            return '' +
                '<div class="my-item">' +
                '<div class="my-item-img"><img src="' + esc(listingImg(it)) + '" alt=""></div>' +
                '<div class="my-item-info">' +
                '<strong>' + esc(it.brand) + ' · ' + esc(it.model) + '</strong>' +
                '<p>사진 ' + (it.photoCount || (it.photos ? it.photos.length : 0)) + '장</p>' +
                bidsHtml(it) +
                '</div>' +
                '<div class="my-item-status">' + (label[it.status] || it.status) + '</div>' +
                '</div>';
        }

        var emptyHtml = '<div class="empty-items"><p>아직 등록한 매물이 없습니다.</p>' +
            '<p class="sub">비교견적 페이지에서 시계를 등록해보세요.</p></div>';

        var el = $('#myItems');
        if (el) el.innerHTML = rows.length ? rows.map(itemHtml).join('') : emptyHtml;

        var mp = $('#myPageListings');
        if (mp) mp.innerHTML = rows.length ? rows.map(itemHtml).join('') : emptyHtml;
    }

    /* ============ 제휴처 클릭 → 예약/문의 모달 ============ */
    function initPartnerModal() {
        var modal = $('#partnerModal');
        if (!modal) return;

        document.addEventListener('click', function (e) {
            var card = e.target.closest('.partner-card');
            if (card) {
                e.preventDefault();
                $('#partnerName').innerHTML = '<strong>' + card.dataset.partner + '</strong> 예약 / 문의';
                $('#partnerArea').textContent = '📍 ' + card.dataset.area + ' 지역';
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
        // 탭 전환
        $$('[data-ltab]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var t = btn.dataset.ltab;
                $$('.login-tab').forEach(function (x) {
                    x.classList.toggle('active', x.dataset.ltab === t);
                });
                $$('.login-panel').forEach(function (p) { p.classList.remove('active'); });
                var panel = document.getElementById('loginPanel' + (t.charAt(0).toUpperCase() + t.slice(1)));
                if (panel) panel.classList.add('active');
            });
        });

        // 로그인 폼
        var loginForm = $('#loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', function (e) {
                e.preventDefault();
                if (!backendOn()) { return; }
                var fd = new FormData(loginForm);
                var email = String(fd.get('id') || '').trim();
                var pw = String(fd.get('pw') || '');
                if (email.indexOf('@') === -1) {
                    alert('이메일 주소로 로그인해주세요.');
                    return;
                }
                NWBackend.signIn({ email: email, password: pw }).then(function (user) {
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
            signupForm.addEventListener('submit', function (e) {
                e.preventDefault();
                var fd = new FormData(signupForm);
                var name = fd.get('name');
                var phone = fd.get('phone');
                var email = fd.get('email');
                var pw = fd.get('pw');
                var role = fd.get('role') || 'customer';
                var company = fd.get('company') || '';
                if (!name || !phone || !email || !pw) {
                    alert('필수 항목을 모두 입력해주세요.');
                    return;
                }
                if (role === 'vendor' && !company) {
                    alert('업체 회원은 업체 상호를 입력해주세요.');
                    return;
                }
                if (pw.length < 8) {
                    alert('비밀번호는 8자 이상이어야 합니다.');
                    return;
                }

                if (backendOn()) {
                    NWBackend.signUp({ name: name, phone: phone, email: email, password: pw, role: role, company: company })
                        .then(function () {
                            signupForm.reset();
                            var cf = $('#signupCompanyField'); if (cf) cf.style.display = 'none';
                            closeLoginModal();
                            if (role === 'vendor') {
                                alert(name + '님, 업체 회원가입이 접수되었습니다.\n관리자 승인 후 입찰 기능을 이용하실 수 있습니다.');
                            } else {
                                alert(name + '님, 회원가입이 완료되었습니다.\n이메일 인증이 필요한 경우 메일을 확인해주세요.');
                            }
                        })
                        .catch(function (err) {
                            alert('회원가입 실패: ' + authErrorMsg(err));
                        });
                    return;
                }
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
    var VALID = ['home', 'compare', 'collection', 'insight', 'brand', 'about', 'contact', 'sell', 'buy', 'repair'];

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
            var lead = pEl ? '<p><strong>' + pEl.textContent + '</strong></p>' : '';
            var paragraphs = body.split('\n\n').map(function (t) { return '<p>' + t + '</p>'; }).join('');
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
    }

    function renderUploadGrid() {
        var grid = $('#uploadGrid');
        if (!grid) return;
        $$('.upload-cell.has-img', grid).forEach(function (c) { c.remove(); });
        var addCell = $('.upload-add', grid);

        uploadedPhotos.forEach(function (src, idx) {
            var cell = document.createElement('div');
            cell.className = 'upload-cell has-img';
            cell.innerHTML =
                '<img src="' + src + '" alt="">' +
                '<button type="button" class="remove-btn" data-idx="' + idx + '" aria-label="삭제">×</button>';
            if (addCell) grid.insertBefore(cell, addCell);
            else grid.appendChild(cell);
        });
    }

    /* ============ 8. 비교견적 폼 ============ */
    var submittedItems = [];

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

            if (backendOn()) {
                if (!NWBackend.currentUser()) {
                    alert('매물 등록은 로그인 후 가능합니다.');
                    openLoginModal();
                    return;
                }
                var submitBtn = form.querySelector('[type="submit"]');
                if (submitBtn) submitBtn.disabled = true;
                NWBackend.addListing({
                    brand: brand, model: model, name: name, phone: phone, memo: memo,
                    photos: uploadedPhotos.slice(0), photoCount: uploadedPhotos.length
                }).then(function () {
                    showSubmitSuccess(form);
                    form.reset();
                    uploadedPhotos.length = 0;
                    renderUploadGrid();
                    // 내 매물 목록은 실시간 구독으로 자동 갱신됨
                }).catch(function (err) {
                    alert('매물 등록 실패: ' + (err && err.message ? err.message : err));
                }).then(function () {
                    if (submitBtn) submitBtn.disabled = false;
                });
                return;
            }

            var item = {
                id: Date.now(),
                brand: brand,
                model: model,
                photo: uploadedPhotos[0],
                photoCount: uploadedPhotos.length,
                memo: memo,
                submittedAt: new Date().toLocaleString('ko-KR', { hour12: false })
            };
            submittedItems.unshift(item);
            renderMyItems();
            showSubmitSuccess(form);

            form.reset();
            uploadedPhotos.length = 0;
            renderUploadGrid();

            setTimeout(function () {
                var myItems = $('#myItems');
                if (myItems) myItems.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 600);
        });
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
        if (!modal || !btnMy) return;

        btnMy.addEventListener('click', function () {
            // 로그인 상태면 마이페이지, 아니면 로그인 모달
            if (backendOn() && NWBackend.currentUser()) {
                openMyPage();
                return;
            }
            modal.hidden = false;
            document.body.style.overflow = 'hidden';
        });

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

        var kakaoBtn = $('#loginKakao');
        if (kakaoBtn) {
            kakaoBtn.addEventListener('click', function () {
                window.open('https://open.kakao.com/o/sMuCaAFh', '_blank');
            });
        }

        // 검색 버튼 → 판매시계 컬렉션에서 브랜드/모델 검색
        var btnSearch = $('#btnSearch');
        if (btnSearch) {
            btnSearch.addEventListener('click', function () {
                var q = prompt('검색어를 입력하세요 (예: 롤렉스, 데이토나)');
                if (q && q.trim()) runSearch(q.trim());
            });
        }
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

    function cardMatches(cardText, ql) {
        if (cardText.indexOf(ql) !== -1) return true;
        for (var i = 0; i < BRAND_ALIASES.length; i++) {
            var g = BRAND_ALIASES[i];
            var qInGroup = g.some(function (t) { return ql.indexOf(t) !== -1 || t.indexOf(ql) !== -1; });
            if (qInGroup && g.some(function (t) { return cardText.indexOf(t) !== -1; })) return true;
        }
        return false;
    }

    function runSearch(q) {
        var ql = q.toLowerCase();
        navigate('collection');
        setTimeout(function () {
            var cards = $$('#collection .hcard');
            var hits = 0;
            cards.forEach(function (c) {
                var hit = cardMatches((c.textContent || '').toLowerCase(), ql);
                c.style.display = hit ? '' : 'none';
                if (hit) hits++;
            });
            if (!hits) {
                clearSearchFilter();
                alert('"' + q + '" 검색 결과가 없습니다.');
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
        $$('#collection .hcard').forEach(function (c) { c.style.display = ''; });
    }

    /* ============ 상품 상세 모달 ============ */
    function initProductModal() {
        var modal = $('#productModal');
        if (!modal) return;

        document.addEventListener('click', function (e) {
            // 관리자 수정/삭제 버튼 클릭은 상세 모달을 열지 않음
            if (e.target.closest('.hcard-admin')) return;
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

        var buyBtn = $('#pmBuy');
        var askBtn = $('#pmAsk');
        if (buyBtn) buyBtn.addEventListener('click', function () {
            window.open('https://open.kakao.com/o/sMuCaAFh', '_blank');
        });
        if (askBtn) askBtn.addEventListener('click', function () {
            closeProduct();
            navigate('contact');
        });

        function openProduct(card) {
            var img = card.querySelector('.hcard-img img');
            var brand = card.querySelector('.hcard-brand');
            var model = card.querySelector('.hcard-model');
            var price = card.querySelector('.hcard-price');

            $('#pmImg').src = img ? img.src : '';
            $('#pmBrand').textContent = brand ? brand.textContent : '';
            $('#pmModel').textContent = model ? model.textContent : '';
            $('#pmPrice').innerHTML = price ? price.innerHTML : '';

            modal.hidden = false;
            document.body.style.overflow = 'hidden';
        }

        function closeProduct() {
            modal.hidden = true;
            document.body.style.overflow = '';
        }
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
