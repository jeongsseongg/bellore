if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js?v=20260826-hero-layout-v10').catch(function (err) {
            console.warn('서비스워커 등록 실패:', err);
        });
    });
}

/* ===== 화면 설정: 와이드(꽉찬) 모드 토글 ===== */
(function () {
    var root = document.documentElement;
    var wide = document.getElementById('toggleWide');
    if (!wide) return;
    function sync() { wide.setAttribute('aria-checked', root.getAttribute('data-width') === 'full' ? 'true' : 'false'); }
    wide.addEventListener('click', function () {
        if (root.getAttribute('data-width') === 'full') { root.removeAttribute('data-width'); try { localStorage.setItem('bellore_width', 'app'); } catch (e) {} }
        else { root.setAttribute('data-width', 'full'); try { localStorage.setItem('bellore_width', 'full'); } catch (e) {} }
        sync();
    });
    sync();
})();

/* ===== 판매시계: 검색 + 브랜드 + 빠른칩 + 정렬 + 필터검색(바이버식) ===== */
(function () {
    var grid = document.querySelector('#panel-ny .col-grid-inner');
    if (!grid) return;
    var countEl = document.getElementById('catCount');
    var brands = document.querySelectorAll('#collection .cat-brand');
    var catModels = document.getElementById('catModels');
    function esc2(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function num(v) { var n = parseInt(String(v == null ? '' : v).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? null : n; }
    function modelsForBrand(name) {
        var list = window.BELLORE_BRANDS || [];
        for (var i = 0; i < list.length; i++) { if (list[i].name === name) return list[i].models || []; }
        return [];
    }
    function renderModelChips(brand) {
        if (!catModels) return;
        if (!brand || brand === 'all') { catModels.hidden = true; catModels.innerHTML = ''; return; }
        var ms = modelsForBrand(brand);
        if (!ms.length) { catModels.hidden = true; catModels.innerHTML = ''; return; }
        var chips = '<button type="button" class="cat-model active" data-model="">전체</button>' +
            ms.map(function (m) { return '<button type="button" class="cat-model" data-model="' + esc2(m) + '">' + esc2(m) + '</button>'; }).join('');
        catModels.innerHTML = '<div class="cat-model-row">' + chips + '</div>';
        catModels.hidden = false;
    }

    /* ---- 필터 상태 ---- */
    var fBrand = 'all', fModel = '', fQuery = '', fNew = false, fGrade = '', fSort = 'latest';
    var cf = { sizeMin: null, sizeMax: null, priceMin: null, priceMax: null, yearMin: null, yearMax: null, warranty: '', diamond: '', colors: [], materials: [], grades: [] };
    var PAGE_SIZE = 10, visibleLimit = PAGE_SIZE, matchedTotal = 0, pageLoadLocked = false, pageUnlockTimer = 0;
    var pageSentinel = document.createElement('div');
    pageSentinel.id = 'catPageSentinel';
    pageSentinel.className = 'cat-page-sentinel';
    pageSentinel.setAttribute('aria-live', 'polite');
    pageSentinel.style.cssText = 'padding:28px 16px 34px;text-align:center;color:#8d8b86;font-size:13px;letter-spacing:-.2px;';
    pageSentinel.hidden = true;
    grid.parentNode.insertBefore(pageSentinel, grid.nextSibling);

    function paintPage() {
        var matched = [];
        grid.querySelectorAll('.hcard').forEach(function (c) {
            var ok = c.dataset.colMatch === '1';
            if (ok) matched.push(c);
            c.style.display = ok && matched.length <= visibleLimit ? '' : 'none';
        });
        matchedTotal = matched.length;
        if (countEl) countEl.textContent = matchedTotal;
        pageSentinel.hidden = matchedTotal === 0 || visibleLimit >= matchedTotal;
        pageSentinel.textContent = pageSentinel.hidden ? '' :
            Math.min(visibleLimit, matchedTotal).toLocaleString('ko-KR') + ' / ' + matchedTotal.toLocaleString('ko-KR') + '개 · 아래로 내려 더 보기';
    }

    function showNextPage() {
        if (pageLoadLocked || visibleLimit >= matchedTotal) return;
        pageLoadLocked = true;
        visibleLimit += PAGE_SIZE;
        paintPage();
    }

    function finishPageScroll() {
        pageLoadLocked = false;
        if (!pageSentinel.hidden && pageSentinel.getBoundingClientRect().top < window.innerHeight + 120) showNextPage();
    }
    window.addEventListener('scroll', function () {
        if (!('onscrollend' in window)) {
            clearTimeout(pageUnlockTimer);
            pageUnlockTimer = setTimeout(finishPageScroll, 250);
        }
    }, { passive: true });
    if ('onscrollend' in window) window.addEventListener('scrollend', finishPageScroll);

    function matchCard(c) {
        var el = c.querySelector('.hcard-brand');
        var bd = (c.dataset.brand || (el ? el.textContent : '')).toUpperCase();
        var mel = c.querySelector('.hcard-model');
        var md = ((c.dataset.model || (mel ? mel.textContent : '')) + '').toLowerCase();
        var no = (c.getAttribute('data-no') || '').toLowerCase();
        var pk = c.dataset.pack || '';
        var sz = parseInt(c.dataset.size, 10) || 0;
        var pr = parseInt(c.dataset.price, 10) || 0;
        var yr = parseInt(c.getAttribute('data-stampyear'), 10) || 0;
        var color = c.dataset.color || '';
        var mat = c.dataset.material || '';
        var dia = c.dataset.diamond === '1';
        var war = c.dataset.warranty === '1';
        var isNew = c.getAttribute('data-new') === '1';
        if (fBrand && fBrand !== 'all' && bd.indexOf(fBrand.toUpperCase()) === -1) return false;
        if (fModel && md.indexOf(fModel.toLowerCase()) === -1) return false;
        if (fQuery) { var q = fQuery.toLowerCase(); var hay = (bd + ' ' + md + ' ' + no + ' ' + color + ' ' + mat + ' ' + pk).toLowerCase(); if (hay.indexOf(q) === -1) return false; }
        if (fNew && !isNew) return false;
        if (fGrade && pk !== fGrade) return false;
        if (cf.sizeMin != null && !(sz >= cf.sizeMin)) return false;
        if (cf.sizeMax != null && !(sz > 0 && sz <= cf.sizeMax)) return false;
        if (cf.priceMin != null && !(pr >= cf.priceMin)) return false;
        if (cf.priceMax != null && !(pr > 0 && pr <= cf.priceMax)) return false;
        if (cf.yearMin != null && !(yr >= cf.yearMin)) return false;
        if (cf.yearMax != null && !(yr > 0 && yr <= cf.yearMax)) return false;
        if (cf.warranty === '1' && !war) return false;
        if (cf.diamond === '1' && !dia) return false;
        if (cf.diamond === '0' && dia) return false;
        if (cf.colors.length && cf.colors.indexOf(color) === -1) return false;
        if (cf.materials.length && cf.materials.indexOf(mat) === -1) return false;
        if (cf.grades.length && cf.grades.indexOf(pk) === -1) return false;
        return true;
    }
    function effPrice(c) { var sp = parseInt(c.dataset.sprice, 10) || 0, p = parseInt(c.dataset.price, 10) || 0; return (sp > 0 && sp < p) ? sp : p; }
    function discRate(c) { var sp = parseInt(c.dataset.sprice, 10) || 0, p = parseInt(c.dataset.price, 10) || 0; return (sp > 0 && sp < p) ? (1 - sp / p) : 0; }
    function createdMs(c) { return parseInt(c.getAttribute('data-created'), 10) || 0; }
    function sortCards() {
        var cards = Array.prototype.slice.call(grid.querySelectorAll('.hcard'));
        if (fSort === 'price_desc') cards.sort(function (a, b) { return effPrice(b) - effPrice(a); });
        else if (fSort === 'price_asc') cards.sort(function (a, b) { return (effPrice(a) || 9e15) - (effPrice(b) || 9e15); });
        else if (fSort === 'discount') cards.sort(function (a, b) { return discRate(b) - discRate(a); });
        else cards.sort(function (a, b) { return createdMs(b) - createdMs(a); }); // latest / popular(데이터 없어 최신순)
        cards.forEach(function (c) { grid.appendChild(c); });
    }
    function applyFilters(keepPage) {
        if (window.BELLORE_hideSearchEmpty) window.BELLORE_hideSearchEmpty();
        var shown = 0;
        grid.querySelectorAll('.hcard').forEach(function (c) { var ok = matchCard(c); c.dataset.colMatch = ok ? '1' : '0'; if (ok) shown++; });
        sortCards();
        if (!keepPage) { visibleLimit = PAGE_SIZE; pageLoadLocked = false; }
        paintPage();
        if (shown === 0 && (fQuery || (fBrand && fBrand !== 'all') || fModel) && window.BELLORE_showCollectionEmpty) {
            window.BELLORE_showCollectionEmpty(fBrand, fModel || fQuery, '');
        }
    }
    window.BELLORE_applyColFilters = applyFilters;
    window.BELLORE_paginateSearchCards = function (cards) {
        var selected = cards || [];
        var selectedSet = typeof Set === 'function' ? new Set(selected) : null;
        grid.querySelectorAll('.hcard').forEach(function (c) {
            var ok = selectedSet ? selectedSet.has(c) : selected.indexOf(c) !== -1;
            c.dataset.colMatch = ok ? '1' : '0';
        });
        visibleLimit = PAGE_SIZE;
        pageLoadLocked = false;
        paintPage();
        return matchedTotal;
    };

    /* ---- 브랜드 원형 ---- */
    brands.forEach(function (btn) {
        btn.addEventListener('click', function () {
            if (window.BELLORE_hideSearchEmpty) window.BELLORE_hideSearchEmpty();
            brands.forEach(function (x) { x.classList.remove('active'); });
            btn.classList.add('active');
            fBrand = btn.dataset.brand; fModel = '';
            renderModelChips(fBrand);
            applyFilters();
            hideSuggest();
            // 선택한 브랜드의 결과(모델칩 + 그리드)가 하단에 보이도록 스크롤
            if (fBrand && fBrand !== 'all') scrollToResults();
        });
    });
    function scrollToResults() {
        var anchor = document.getElementById('catModels');
        if (!anchor || anchor.hidden) anchor = document.querySelector('#collection .cat-listhead') || document.getElementById('panel-ny');
        if (anchor) setTimeout(function () { anchor.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
    }
    var brandWrap = document.querySelector('#collection .cat-brands');
    function setBrandOpen(on) {
        if (!brandWrap) return;
        brandWrap.classList.toggle('is-collapsed', !on);
        brandWrap.classList.toggle('show-all', on);
        var more = document.getElementById('catBrandMore');
        if (more) { more.classList.toggle('on', on); more.childNodes[0].nodeValue = on ? '접기' : '브랜드 더보기'; }
    }
    /* ---- 검색 별칭(슬랭) · 인기검색어 · 연관검색어 제안 ---- */
    // 흔한 줄임말/속어 → 실제 검색어(모델·소재·다이얼 컬러). 그리드는 모델·소재·컬러까지 매칭.
    var SEARCH_ALIAS = {
        '금통': '골드', '콤비': '골드', '로골': '로즈골드', '로즈콤비': '로즈골드',
        '깡통': '스틸', '스틸': '스틸', '백판': '화이트', '화이트판': '화이트',
        '흑판': '블랙', '블랙판': '블랙', '청판': '블루', '블루판': '블루',
        '녹판': '그린', '그린판': '그린', '서브': '서브마리너', '서마': '서브마리너',
        '데저': '데이트저스트', '디데이': '데이데이트', '데토나': '데이토나', '콤스텔': '컨스텔레이션',
        '스피드': '스피드마스터', '씨마': '씨마스터', '노티': '노틸러스', '로크': '로얄오크',
        '지엠티': 'GMT마스터', '짐티': 'GMT마스터', '오퍼': '오이스터 퍼페추얼'
    };
    var POPULAR_KEYS = ['서브마리너', '데이트저스트', '데이토나', 'GMT마스터', '노틸러스', '로얄오크', '스피드마스터', '콤비', '다이아', '미착용'];
    function aliasExpand(v) { var k = String(v || '').trim().toLowerCase(); return SEARCH_ALIAS[k] || v; }
    var suggestBox = document.getElementById('catSuggest');
    function hideSuggest() { if (suggestBox) { suggestBox.hidden = true; suggestBox.innerHTML = ''; } }
    function buildSuggest(v) {
        var ql = String(v || '').trim().toLowerCase();
        var eq = aliasExpand(v); var eql = eq.toLowerCase();
        var bl = window.BELLORE_BRANDS || [], out = [], seen = {};
        function push(label, q) { var key = label + '|' + q; if (seen[key]) return; seen[key] = 1; out.push({ label: label, q: q }); }
        bl.forEach(function (b) {
            if (b.name.toLowerCase().indexOf(ql) > -1 || b.name.toLowerCase().indexOf(eql) > -1) push(b.name, b.name);
            (b.models || []).forEach(function (m) {
                var ml = m.toLowerCase();
                if (ml.indexOf(ql) > -1 || ml.indexOf(eql) > -1) push(b.name + ' ' + m, m);
            });
        });
        return out.slice(0, 8);
    }
    function renderSuggest(items, heading) {
        if (!suggestBox) return;
        if (!items.length) { hideSuggest(); return; }
        suggestBox.innerHTML = (heading ? '<p class="cat-suggest-h">' + heading + '</p>' : '') +
            items.map(function (it) {
                return '<button type="button" class="cat-suggest-item" data-q="' + esc2(it.q) + '">' +
                    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b3ada1" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4-4"/></svg>' +
                    '<span>' + esc2(it.label) + '</span></button>';
            }).join('');
        suggestBox.hidden = false;
    }
    (function () {
        if (!brandWrap) return;
        var circles = brandWrap.querySelectorAll('.cat-brand:not([data-brand="all"])');
        var cnt = document.getElementById('catBrandCount'); if (cnt) cnt.textContent = circles.length;
        var more = document.getElementById('catBrandMore');
        var bq = document.getElementById('catBrandQ');
        var clearBtn = document.getElementById('catSearchClear');
        window.__catFilterBrands = function (v) {
            v = (v || '').trim().toLowerCase();
            brandWrap.querySelectorAll('.cat-brand').forEach(function (b) {
                if ((b.dataset.brand || '') === 'all') { b.style.display = ''; return; }
                b.style.display = (!v || (b.dataset.brand || '').toLowerCase().indexOf(v) > -1) ? '' : 'none';
            });
        };
        function runSearch(raw) {
            var v = (raw == null ? bq.value : raw).trim();
            window.__catFilterBrands(v);
            fQuery = v ? aliasExpand(v) : '';   // 그리드: 별칭 확장(금통→골드 등)
            if (clearBtn) clearBtn.hidden = !v;
            applyFilters();
        }
        if (more) more.addEventListener('click', function () { setBrandOpen(brandWrap.classList.contains('is-collapsed')); });
        if (bq) {
            bq.addEventListener('input', function () {
                var v = bq.value.trim();
                runSearch(v);
                if (suggestBox) suggestBox.dataset.kind = 'assoc';
                if (v) renderSuggest(buildSuggest(v), '연관 검색어'); else hideSuggest();
            });
            bq.addEventListener('focus', function () { if (bq.value.trim()) renderSuggest(buildSuggest(bq.value), '연관 검색어'); });
        }
        if (clearBtn) clearBtn.addEventListener('click', function () { bq.value = ''; runSearch(''); hideSuggest(); bq.focus(); });
        // 제안 클릭 → 검색어 적용
        if (suggestBox) suggestBox.addEventListener('click', function (e) {
            var it = e.target.closest('.cat-suggest-item'); if (!it) return;
            var q = it.getAttribute('data-q') || '';
            bq.value = q; runSearch(q); hideSuggest(); scrollToResults();
        });
        // 인기검색어 버튼
        var popBtn = document.getElementById('catPopular');
        if (popBtn) popBtn.addEventListener('click', function () {
            if (suggestBox && !suggestBox.hidden && suggestBox.dataset.kind === 'popular') { hideSuggest(); return; }
            renderSuggest(POPULAR_KEYS.map(function (k) { return { label: k, q: k }; }), '인기 검색어');
            if (suggestBox) suggestBox.dataset.kind = 'popular';
            var wrap = document.getElementById('catSearchWrap'); if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        if (bq) bq.addEventListener('input', function () { if (suggestBox) suggestBox.dataset.kind = 'assoc'; });
        document.addEventListener('click', function (e) {
            if (!e.target.closest('#catSearchWrap') && !e.target.closest('#catPopular')) hideSuggest();
        });
    })();
    if (catModels) catModels.addEventListener('click', function (e) {
        var cm = e.target.closest('.cat-model'); if (!cm) return;
        catModels.querySelectorAll('.cat-model').forEach(function (x) { x.classList.toggle('active', x === cm); });
        fModel = cm.dataset.model || '';
        applyFilters();
    });

    /* ---- 빠른 칩 + 등급/정렬 메뉴 ---- */
    /* 메뉴는 .qf-chips(가로 overflow:auto)에 잘리므로 position:fixed로 띄워 화면 위에 표시 */
    function closeMenus() { ['catGradeMenu', 'catSortMenu'].forEach(function (m) { var el = document.getElementById(m); if (el) { el.hidden = true; el.classList.remove('cf-menu-open'); } }); }
    function positionMenu(menu, anchor) {
        var r = anchor.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (r.bottom + 6) + 'px';
        menu.style.left = r.left + 'px';
        menu.style.right = 'auto';
        requestAnimationFrame(function () {
            var mr = menu.getBoundingClientRect();
            if (mr.right > window.innerWidth - 8) menu.style.left = Math.max(8, window.innerWidth - 8 - mr.width) + 'px';
            if (mr.bottom > window.innerHeight - 8) menu.style.top = Math.max(8, r.top - mr.height - 6) + 'px';
        });
    }
    function toggleMenu(id, anchor) {
        var target = document.getElementById(id), willOpen = target && target.hidden;
        closeMenus();
        if (willOpen) { target.hidden = false; target.classList.add('cf-menu-open'); positionMenu(target, anchor); }
    }
    /* '전체' 칩은 다른 빠른필터(미착용·등급)와 동시에 켜질 수 없음 */
    function syncAllChip() {
        var allChip = document.querySelector('#catChips .qf-chip[data-chip="all"]');
        if (allChip) allChip.classList.toggle('active', !fNew && !fGrade);
    }
    function resetQuick() {
        fNew = false; fGrade = '';
        document.querySelectorAll('#catChips .qf-chip').forEach(function (c) { c.classList.remove('active'); });
        var nc = document.querySelector('#catChips .qf-chip[data-chip="new"]'); if (nc) nc.classList.remove('active');
        var gc = document.querySelector('.qf-chip-grade'); if (gc) { gc.classList.remove('active'); gc.childNodes[0].nodeValue = '등급 '; }
        syncAllChip();
    }
    var chips = document.getElementById('catChips');
    if (chips) chips.addEventListener('click', function (e) {
        var menuBtn = e.target.closest('.qf-chip-menu button');
        if (menuBtn) {
            if (menuBtn.hasAttribute('data-grade')) {
                fGrade = menuBtn.getAttribute('data-grade') || '';
                var gc = document.querySelector('.qf-chip-grade');
                if (gc) { gc.classList.toggle('active', !!fGrade); gc.childNodes[0].nodeValue = (fGrade ? menuBtn.textContent : '등급') + ' '; }
                syncAllChip(); closeMenus(); applyFilters(); return;
            }
            if (menuBtn.hasAttribute('data-sort')) {
                fSort = menuBtn.getAttribute('data-sort') || 'latest';
                document.querySelectorAll('#catSortMenu button').forEach(function (b) { b.classList.toggle('on', b === menuBtn); });
                var sc = document.querySelector('.qf-chip-sort'); if (sc) sc.childNodes[0].nodeValue = menuBtn.textContent + ' ';
                closeMenus(); applyFilters(); return;
            }
        }
        var chip = e.target.closest('.qf-chip'); if (!chip) return;
        var k = chip.dataset.chip;
        if (k === 'grade') { toggleMenu('catGradeMenu', chip); return; }
        if (k === 'sort') { toggleMenu('catSortMenu', chip); return; }
        if (k === 'all') { resetQuick(); applyFilters(); return; }
        if (k === 'new') { fNew = !fNew; chip.classList.toggle('active', fNew); syncAllChip(); applyFilters(); return; }
    });
    // 무신사식 '브랜드' 토글 스위치 — 켜면 원형 브랜드 패널이 펼쳐지고, 다시 누르면 닫힘
    var brandToggle = document.getElementById('catBrandToggle');
    if (brandToggle) brandToggle.addEventListener('click', function () {
        var panel = document.getElementById('catBrandPanel');
        if (!panel) return;
        panel.hidden = !panel.hidden;
        var on = !panel.hidden;
        brandToggle.classList.toggle('on', on);
        brandToggle.setAttribute('aria-pressed', String(on));
        if (on) { setBrandOpen(false); panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.qf-chip')) closeMenus(); });
    window.addEventListener('scroll', closeMenus, true);
    window.addEventListener('resize', closeMenus);

    /* ---- 액션: 인기검색어(위 IIFE에서 바인딩) / 내시계팔기 / 필터검색 ---- */
    var sBtn = document.getElementById('catSellMine');
    if (sBtn) sBtn.addEventListener('click', function () {
        var nav = document.querySelector('.tab-item[data-sell-method-open]') || document.querySelector('[data-sell-method-open]');
        if (nav) nav.click(); else location.hash = '#compare';
    });
    var fBtn = document.getElementById('catFilterOpen');
    if (fBtn) fBtn.addEventListener('click', openFilterPage);

    /* ---- 필터검색 모달 ---- */
    var fpInit = false;
    function gid(id) { return document.getElementById(id); }
    function val(id) { var e = gid(id); return e ? e.value : ''; }
    function setv(id, v) { var e = gid(id); if (e) e.value = (v == null ? '' : v); }
    function radio(name) { var e = document.querySelector('input[name="' + name + '"]:checked'); return e ? e.value : ''; }
    function checks(boxId) { var out = [], box = gid(boxId); if (box) box.querySelectorAll('.cf-pill.on').forEach(function (i) { out.push(i.dataset.val); }); return out; }
    function buildChecks(boxId, list) {
        var box = gid(boxId); if (!box) return;
        box.innerHTML = (list || []).map(function (v) { return '<button type="button" class="cf-pill" data-val="' + esc2(v) + '">' + esc2(v) + '</button>'; }).join('');
    }
    function readFilterUI() {
        cf.sizeMin = num(val('cfSizeMin')); cf.sizeMax = num(val('cfSizeMax'));
        cf.priceMin = num(val('cfPriceMin')); cf.priceMax = num(val('cfPriceMax'));
        cf.yearMin = num(val('cfYearMin')); cf.yearMax = num(val('cfYearMax'));
        cf.warranty = radio('cf_warranty'); cf.diamond = radio('cf_diamond');
        cf.colors = checks('cfColors'); cf.materials = checks('cfMaterials'); cf.grades = checks('cfGrades');
    }
    function countMatches() { var n = 0; grid.querySelectorAll('.hcard').forEach(function (c) { if (matchCard(c)) n++; }); return n; }
    function updateFilterCount() { readFilterUI(); var cta = gid('cfApply'); if (cta) cta.textContent = countMatches().toLocaleString('ko-KR') + '개 상품 보기'; }
    function chipPick(chip, sel) { var box = chip.closest('[' + sel + ']'); if (box) box.querySelectorAll('.cf-chip').forEach(function (x) { x.classList.toggle('on', x === chip); }); }
    function resetFilterModal() {
        cf = { sizeMin: null, sizeMax: null, priceMin: null, priceMax: null, yearMin: null, yearMax: null, warranty: '', diamond: '', colors: [], materials: [], grades: [] };
        ['cfSizeMin', 'cfSizeMax', 'cfPriceMin', 'cfPriceMax', 'cfYearMin', 'cfYearMax'].forEach(function (id) { setv(id, ''); });
        var pg = gid('filterPage');
        pg.querySelectorAll('.cf-pill.on').forEach(function (i) { i.classList.remove('on'); });
        var w = pg.querySelector('input[name="cf_warranty"]'); if (w) w.checked = true;
        var d = pg.querySelector('input[name="cf_diamond"]'); if (d) d.checked = true;
        ['data-cf-sizechips', 'data-cf-pricechips', 'data-cf-yearchips'].forEach(function (s) {
            var box = pg.querySelector('[' + s + ']'); if (box) box.querySelectorAll('.cf-chip').forEach(function (x, i) { x.classList.toggle('on', i === 0); });
        });
        updateFilterCount();
    }
    function wireFilterPage() {
        var pg = gid('filterPage');
        pg.addEventListener('click', function (e) {
            if (e.target.closest('[data-cfclose]')) { closeFilterPage(); return; }
            if (e.target.closest('#cfReset')) { resetFilterModal(); return; }
            if (e.target.closest('#cfApply')) { readFilterUI(); applyFilters(); closeFilterPage(); return; }
            var sc = e.target.closest('[data-cf-sizechips] .cf-chip');
            if (sc) { chipPick(sc, 'data-cf-sizechips'); setv('cfSizeMin', sc.dataset.smin); setv('cfSizeMax', sc.dataset.smax); updateFilterCount(); return; }
            var pc = e.target.closest('[data-cf-pricechips] .cf-chip');
            if (pc) { chipPick(pc, 'data-cf-pricechips'); setv('cfPriceMin', pc.dataset.pmin ? Number(pc.dataset.pmin).toLocaleString('ko-KR') : ''); setv('cfPriceMax', pc.dataset.pmax ? Number(pc.dataset.pmax).toLocaleString('ko-KR') : ''); updateFilterCount(); return; }
            var yc = e.target.closest('[data-cf-yearchips] .cf-chip');
            if (yc) { chipPick(yc, 'data-cf-yearchips'); setv('cfYearMin', yc.dataset.ymin); setv('cfYearMax', yc.dataset.ymax); updateFilterCount(); return; }
            var pl = e.target.closest('.cf-pill');
            if (pl) { pl.classList.toggle('on'); updateFilterCount(); return; }
        });
        pg.addEventListener('input', function (e) {
            if (e.target.classList.contains('cf-money')) { var dd = e.target.value.replace(/[^0-9]/g, ''); e.target.value = dd ? Number(dd).toLocaleString('ko-KR') : ''; }
            updateFilterCount();
        });
        pg.addEventListener('change', function () { updateFilterCount(); });
    }
    function openFilterPage() {
        var pg = gid('filterPage'); if (!pg) return;
        if (!fpInit) { buildChecks('cfColors', window.BELLORE_DIAL_COLORS); buildChecks('cfMaterials', window.BELLORE_MATERIALS); wireFilterPage(); fpInit = true; }
        updateFilterCount();
        pg.hidden = false; document.body.style.overflow = 'hidden';
    }
    function closeFilterPage() { var pg = gid('filterPage'); if (pg) pg.hidden = true; document.body.style.overflow = ''; }

    setTimeout(applyFilters, 1500);
    setTimeout(applyFilters, 4000);
})();

/* 관리자 카드 톱니바퀴 메뉴 토글 */
document.addEventListener('click', function (e) {
    var g = e.target.closest('.hcard-gear');
    document.querySelectorAll('.hcard-admin-menu').forEach(function (m) {
        if (!g || m.parentElement !== g.parentElement) m.hidden = true;
    });
    if (g) { e.preventDefault(); e.stopPropagation(); var mn = g.parentElement.querySelector('.hcard-admin-menu'); if (mn) mn.hidden = !mn.hidden; }
});
/* 판매시계: 모든 브랜드 보기 토글 */
document.addEventListener('click', function (e) {
    var t = e.target.closest('.brand-more-toggle'); if (!t) return;
    var wrap = t.closest('.cat-brands'); if (!wrap) return;
    var on = wrap.classList.toggle('show-all');
    var nm = t.querySelector('.brand-circle-name'); if (nm) nm.textContent = on ? '접기' : '모든 브랜드';
});

/* 가로 원형 카테고리: 마우스 드래그로도 스크롤(PC 좁은 화면 대응) */
(function () {
    document.querySelectorAll('.cat-brands.brand-circle-scroll').forEach(function (row) {
        var down = false, sx = 0, sl = 0, moved = false;
        row.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'touch') return; // 터치는 네이티브 스와이프
            down = true; moved = false; sx = e.clientX; sl = row.scrollLeft; row.classList.add('dragging');
        });
        window.addEventListener('pointermove', function (e) {
            if (!down) return; var dx = e.clientX - sx; if (Math.abs(dx) > 4) moved = true; row.scrollLeft = sl - dx;
        });
        window.addEventListener('pointerup', function () { down = false; row.classList.remove('dragging'); });
        row.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
    });
})();

/* 좌상단 뒤로가기 + 기기/브라우저 back 연동 (오버레이는 back으로 닫힘) */
(function () {
    var OV = '#productModal, #listingPage, #checkoutModal, #ordersModal, #myPageModal, #loginModal, #notiModal, #pwaInstallModal, #postModal, #partnerModal, #inquiryModal';
    var back = document.getElementById('headerBack');
    function visibleOverlay() {
        var els = document.querySelectorAll(OV);
        for (var i = 0; i < els.length; i++) { if (!els[i].hidden) return els[i]; }
        return null;
    }
    function closeOverlay(ov) {
        var c = ov.querySelector('.pp-back, [data-pclose], [data-lpclose], .co-back, [data-myclose], [data-mclose], [data-noticlose], [data-pwa-close], [data-close], .login-close');
        if (c) c.click(); else { ov.hidden = true; document.body.style.overflow = ''; }
    }
    function onHome() { return (!location.hash || location.hash === '#home'); }
    function update() { if (back) back.hidden = (onHome() && !visibleOverlay()); }
    if (back) back.addEventListener('click', function () {
        var ov = visibleOverlay();
        if (ov) { closeOverlay(ov); setTimeout(update, 30); return; }
        history.back();
    });
    var pushed = false;
    try {
        var obs = new MutationObserver(function () {
            var ov = visibleOverlay();
            if (ov && !pushed) { pushed = true; history.pushState({ ov: 1 }, ''); }
            if (!ov) pushed = false;
            update();
        });
        document.querySelectorAll(OV).forEach(function (el) { obs.observe(el, { attributes: true, attributeFilter: ['hidden'] }); });
    } catch (e) {}
    window.addEventListener('popstate', function () {
        var ov = visibleOverlay();
        if (ov) { pushed = false; closeOverlay(ov); }
        setTimeout(update, 30);
    });
    window.addEventListener('hashchange', update);
    update();
})();
