/* ============================================================
   벨로르(BELLORE) · 결제(포트원 PortOne V2) 연동
   ------------------------------------------------------------
   - 상품 상세의 "바로구매" → 체크아웃 모달 → 결제수단 선택 → 포트원 결제
   - 전액 결제만 제공하며 구매자·배송지 정보와 주문을 DB에 기록
   - PG 계약이 완료되어 채널 키가 등록된 결제수단만 노출
   - 결제 후 Edge Function(confirm-payment)이 포트원 API로 금액·상태 검증
   ============================================================ */
(function () {
  'use strict';

  var PAY = window.BELLORE_PAYMENTS || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function fmt(n) { return (n || 0).toLocaleString('ko-KR'); }
  function backendOn() {
    return !!(window.NWBackend && window.NWBackend.enabled);
  }
  function currentUser() {
    return backendOn() && window.NWBackend.currentUser
      ? window.NWBackend.currentUser() : null;
  }

  // 배송비: 기본 전국 무료. 단, 프리미엄배송 기준액(기본 500만원) 이상 고가 상품은
  //          안전·보험 프리미엄배송(기본 35,000원) 필수 가산. (약관/배송정책 특약)
  function shipFee(price) {
    var th = PAY.premiumShipThreshold || 5000000;
    return (Number(price) || 0) >= th ? (PAY.shippingFee || 0) : 0;
  }
  function calcFull(price) {
    return price + shipFee(price);
  }

  /* ---------------- 체크아웃 모달 ---------------- */
  var modal, product;
  var selectedChannel = null;   // 선택된 결제수단(config.channels 의 한 항목)

  function getModal() { return $('#checkoutModal'); }
  function paymentCustomerMessage(value, context, provider) { var f = window.BELLORE_CUSTOMER_FEEDBACK; return f && provider && f.paymentProviderFeedback ? f.paymentProviderFeedback(value) : f && f.message ? f.message(value, context) : context === 'confirmation' || provider ? '결제 결과를 확인하지 못했습니다. 다시 결제하지 말고 고객센터로 문의해 주세요.' : '결제를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.'; }
  function testPaymentsEnabled() {
    var host = (location.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
    try {
      var params = new URLSearchParams(location.search);
      return params.get('paymentTest') === '1' || params.get('naverPayTest') === '1';
    } catch (_e) {
      return false;
    }
  }

  // 설정에 채워진 채널만 사용하며 테스트 채널은 명시적인 테스트 주소로 제한한다.
  function activeChannels() {
    var allowTest = testPaymentsEnabled();
    var list = (PAY.channels || []).filter(function (c) {
      return c && c.channelKey && (!c.test || allowTest);
    });
    return list;
  }
  function naverOrderChannel() {
    var npay = window.BELLORE_NAVERPAY || {};
    if (!npay.enabled || !npay.endpoint) return null;
    if (npay.testOnly && !testPaymentsEnabled()) return null;
    return {
      id: 'naver-order',
      label: '네이버페이',
      kind: 'naver-order'
    };
  }
  function availableChannels() {
    var list = activeChannels().slice();
    var naver = naverOrderChannel();
    if (naver) list.push(naver);
    return list;
  }
  function portoneReady() {
    return !!(
      window.PortOne &&
      PAY.storeId &&
      activeChannels().length &&
      backendOn() &&
      window.NWBackend.createOrder &&
      window.NWBackend.confirmOrder &&
      PAY.checkoutUrl && PAY.confirmUrl
    );
  }

  // 결제수단 버튼 렌더
  function renderMethods() {
    var box = $('#coMethods');
    if (!box) return;
    var chans = availableChannels();
    if (!chans.length) {
      box.innerHTML = '<p class="co-methods-empty">현재 이용 가능한 결제 수단이 없습니다. 잠시 후 다시 확인해 주세요.</p>';
      selectedChannel = null;
      return;
    }
    var selected = null;
    for (var i = 0; i < chans.length; i++) {
      if (selectedChannel && chans[i].id === selectedChannel.id) selected = chans[i];
    }
    selectedChannel = selected || chans[0];
    box.innerHTML = chans.map(function (c) {
      var on = (c === selectedChannel);
      return '<button type="button" class="co-method' + (on ? ' active' : '') +
        '" data-ch="' + escLite(c.id) + '">' + escLite(c.label) + '</button>';
    }).join('');
  }
  function selectChannel(id) {
    var chans = availableChannels();
    for (var i = 0; i < chans.length; i++) {
      if (chans[i].id === id) { selectedChannel = chans[i]; break; }
    }
    renderMethods();
  }

  function enableShippingAddress() {
    var ship = $('#coShipSec');
    if (ship) ship.hidden = false;
    updateAmount();
  }

  function openPostcode() {
    if (!window.daum || !window.daum.Postcode) {
      alert('주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    new window.daum.Postcode({
      oncomplete: function (data) {
        var addr = data.roadAddress || data.jibunAddress || '';
        if ($('#coPostcode')) $('#coPostcode').value = data.zonecode || '';
        if ($('#coAddr1')) $('#coAddr1').value = addr;
        var d = $('#coAddr2'); if (d) d.focus();
      }
    }).open();
  }

  /* ---------------- 쿠폰 ---------------- */
  var myCoupons = [];
  function escLite(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function couponValTxt(c) {
    if (!c) return '';
    return c.discount_type === 'percent' ? (c.discount_value + '%') : (fmt(c.discount_value) + '원');
  }
  function getSelectedCoupon() {
    var sel = $('#coCouponSelect');
    if (!sel || !sel.value) return null;
    for (var i = 0; i < myCoupons.length; i++) if (myCoupons[i].id === sel.value) return myCoupons[i];
    return null;
  }
  function couponUi() { return window.BELLORE_CHECKOUT_COUPON_UI; }
  function currentDiscount(base) {
    var uc = getSelectedCoupon();
    if (!uc || !window.NWBackend || !window.NWBackend.couponDiscount) return 0;
    return window.NWBackend.couponDiscount(uc.coupon, base);
  }
  function baseAmount() {
    if (!product) return 0;
    return calcFull(product.price);
  }
  // 구매결제에 쓸 수 있는 내 쿠폰을 셀렉트에 채운다
  function loadCoupons() {
    var sec = $('#coCouponSec'), sel = $('#coCouponSelect');
    if (!sel) return Promise.resolve();
    if (!(backendOn() && window.NWBackend.myCoupons)) { if (sec) sec.hidden = true; return Promise.resolve(); }
    return window.NWBackend.myCoupons().then(function (list) {
      myCoupons = (list || []).filter(function (u) {
        var c = u.coupon;
        return u.status === 'active' && c && (c.apply_to === 'order' || c.apply_to === 'both') &&
          !(c.expires_at && new Date(c.expires_at).getTime() < Date.now());
      });
      sel.innerHTML = '<option value="">쿠폰 사용 안 함</option>' + myCoupons.map(function (u) {
        return '<option value="' + u.id + '">' + escLite(u.coupon.title) + ' (' + couponValTxt(u.coupon) + ')</option>';
      }).join('');
      if (sec) sec.hidden = false;
      updateAmount();
    }).catch(function () {});
  }
  function setCouponMsg(text, ok) {
    var el = $('#coCouponMsg');
    if (!el) return;
    el.textContent = text; el.hidden = !text;
    el.className = 'co-coupon-msg' + (ok ? ' ok' : ' err');
  }
  function couponErrText(e) {
    var m = (e && (e.message || e.code)) || '';
    if (/NOT_FOUND/.test(m)) return '존재하지 않는 코드입니다.';
    if (/ALREADY_OWNED/.test(m)) return '이미 보유한 쿠폰입니다.';
    if (/EXPIRED/.test(m)) return '만료된 쿠폰입니다.';
    if (/NOT_STARTED/.test(m)) return '아직 사용할 수 없는 쿠폰입니다.';
    if (/SOLD_OUT/.test(m)) return '발급이 마감된 쿠폰입니다.';
    if (/LOGGED_IN/.test(m)) return '로그인이 필요합니다.';
    return '쿠폰을 등록할 수 없습니다.';
  }

  function updateAmount() {
    var ui = couponUi(); if (ui) ui.sync();
    var b = baseAmount();
    var disc = currentDiscount(b);
    var amt = Math.max(0, b - disc);
    var row = $('#coDiscountRow'), dEl = $('#coDiscount');
    if (row) row.hidden = !(disc > 0);
    if (dEl) dEl.textContent = '-' + fmt(disc) + '원';
    var totalEl = $('#coTotal');
    if (totalEl) totalEl.textContent = fmt(amt) + '원';
  }

  function renderProduct() {
    if (!product) return;
    $('#coImg').src = product.image || 'assets/images.jpg';
    $('#coBrand').textContent = product.brand || '';
    $('#coModel').textContent = product.model || '';
    $('#coListPrice').textContent = product.price ? (fmt(product.price) + '원') : '가격 문의';

    // 로그인 사용자 정보 채우기
    var u = currentUser();
    if (u) {
      if (!$('#coName').value) $('#coName').value = u.displayName || '';
      if (!$('#coPhone').value && u.phone) $('#coPhone').value = u.phone;
      if (!$('#coEmail').value && u.email) $('#coEmail').value = u.email;
      // 가입 시 저장한 주소를 배송지에 미리 채움(수정 가능)
      if (u.postcode && $('#coPostcode') && !$('#coPostcode').value) {
        $('#coPostcode').value = u.postcode;
        if ($('#coAddr1')) $('#coAddr1').value = u.addr1 || '';
        if ($('#coAddr2')) $('#coAddr2').value = u.addr2 || '';
        if ($('#coShipName') && !$('#coShipName').value) $('#coShipName').value = u.displayName || '';
        if ($('#coShipPhone') && !$('#coShipPhone').value) $('#coShipPhone').value = u.phone || '';
      }
    }
  }

  function openCheckout(p) {
    // 비회원도 구매 가능(네이버페이 주문형 요건). 주문 생성은 게스트 분기로 처리한다.
    product = p || window.BELLORE_currentProduct;
    if (!product || !product.price) {
      alert('가격 문의 상품입니다. 카카오톡 상담으로 안내드릴게요.');
      window.open('https://open.kakao.com/o/sMuCaAFh', '_blank');
      return;
    }
    modal = getModal();
    if (!modal) return;
    // 상품상세 모달이 떠 있으면 닫기(겹침 방지)
    var pm = $('#productModal');
    if (pm) pm.hidden = true;
    enableShippingAddress();
    renderProduct();
    // 쿠폰 초기화 후 내 쿠폰 로드
    var cSel = $('#coCouponSelect'); if (cSel) cSel.value = '';
    var cCode = $('#coCouponCode'); if (cCode) cCode.value = '';
    setCouponMsg('', true);
    loadCoupons();
    // 결제수단 초기화 + 동의 체크 해제
    selectedChannel = null;
    renderMethods();
    ['#coAgreeTerms', '#coAgreePrivacy', '#coAgreeOrder'].forEach(function (sel) {
      var ag = $(sel); if (ag) ag.checked = false;
    });
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    var sc = modal.querySelector('.co-scroll');
    if (sc) sc.scrollTop = 0;
    updateAmount();
  }
  window.BELLORE_openCheckout = openCheckout;

  function closeCheckout() {
    if (modal) modal.hidden = true;
    document.body.style.overflow = '';
  }

  // 결제 요청
  function requestPay() {
    var name = $('#coName').value.trim();
    var phone = $('#coPhone').value.trim();
    var email = ($('#coEmail').value || '').trim();
    if (!name || !phone || !email) { alert('이름, 연락처, 이메일을 입력해 주세요.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('이메일 주소를 정확히 입력해 주세요.'); return; }

    var ship = {};
    ship.recipient = ($('#coShipName').value || '').trim() || name;
    ship.phone = ($('#coShipPhone').value || '').trim() || phone;
    ship.postcode = ($('#coPostcode').value || '').trim();
    ship.addr1 = ($('#coAddr1').value || '').trim();
    ship.addr2 = ($('#coAddr2').value || '').trim();
    ship.request = ($('#coShipReq').value || '').trim();
    if (!ship.postcode || !ship.addr1) { alert('배송 주소를 입력해 주세요.'); return; }
    if (!selectedChannel) { alert('결제 수단을 선택해 주세요.'); return; }
    var requiredAgreements = [
      { el: $('#coAgreeTerms'), message: '이용약관에 동의해 주세요.' },
      { el: $('#coAgreePrivacy'), message: '개인정보 수집·이용에 동의해 주세요.' },
      { el: $('#coAgreeOrder'), message: '상품 상태·배송·환불 및 결제금액 확인에 동의해 주세요.' }
    ];
    for (var ai = 0; ai < requiredAgreements.length; ai++) {
      if (!requiredAgreements[ai].el || !requiredAgreements[ai].el.checked) {
        alert(requiredAgreements[ai].message);
        return;
      }
    }
    if (!product.listingId) {
      alert('판매 승인된 상품만 결제할 수 있습니다. 상품 정보를 다시 불러와 주세요.');
      return;
    }

    if (selectedChannel.kind === 'naver-order') {
      if (!window.BELLORE_NPAY_START) {
        alert('네이버페이 연결을 준비 중입니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      var naverBtn = $('#coPayBtn');
      naverBtn.disabled = true;
      naverBtn.textContent = '네이버페이 연결 중...';
      window.BELLORE_NPAY_START(product).catch(function (error) {
        console.warn('[BELLORE] 네이버페이 주문 시작 실패:', error);
        alert('현재 네이버페이를 이용할 수 없습니다. 다른 결제 수단을 선택해 주세요.');
      }).finally(function () {
        naverBtn.disabled = false;
        naverBtn.textContent = '결제하기';
      });
      return;
    }

    if (!portoneReady()) {
      alert('현재 카드 결제를 준비하지 못했습니다. 새로고침 후에도 같으면 고객센터로 문의해 주세요.');
      renderMethods();
      return;
    }

    var uc = getSelectedCoupon();
    var base = baseAmount();
    var discount = uc ? currentDiscount(base) : 0;
    var amount = Math.max(0, base - discount);
    if (amount < 100) { alert(uc ? '선택한 쿠폰을 적용하면 결제금액이 100원 미만입니다. 쿠폰을 해제하거나 다른 쿠폰을 선택해 주세요.' : '결제금액은 100원 이상이어야 합니다. 상품 가격을 확인해 주세요.'); return; }
    var orderName = (product.brand ? product.brand + ' ' : '') + (product.model || '상품');

    var payBtn = $('#coPayBtn');
    payBtn.disabled = true;
    payBtn.textContent = '주문 생성 중...';

    // 1) pending 주문 생성 → order_no 발급. 귀속은 결제 확정 시 서버 transaction에서 고정한다.
    var attribution = window.BelloreAnalytics && window.BelloreAnalytics.conversionContext
      ? window.BelloreAnalytics.conversionContext() : null;
    var createOrder = window.NWBackend.createOrder({
          listingId: product.listingId,
          productName: orderName,
          productBrand: product.brand,
          productImage: product.image,
          productPrice: product.price,
          payType: 'full',
          amount: amount,
          couponUserId: uc ? uc.id : null,
          discount: discount,
          buyerName: name,
          buyerPhone: phone,
          shipRecipient: ship.recipient || null,
          shipPhone: ship.phone || null,
          shipPostcode: ship.postcode || null,
          shipAddr1: ship.addr1 || null,
          shipAddr2: ship.addr2 || null,
          shipRequest: ship.request || null,
          attribution: attribution
        });

    createOrder.then(function (order) {
      var serverAmount = Number(order && order.amount);
      if (!Number.isSafeInteger(serverAmount) || serverAmount !== amount) throw new Error('CHECKOUT_AMOUNT_CHANGED');
      try {
        sessionStorage.setItem('bellore_pending_order', JSON.stringify({
          orderNo: order.orderNo, amount: serverAmount, listingId: product.listingId || null,
          checkoutToken: order.checkoutToken || null, attribution: attribution
        }));
      } catch (e) {}
      payBtn.textContent = '결제 진행 중...';
      var req = {
        storeId: PAY.storeId,
        channelKey: selectedChannel.channelKey,
        paymentId: order.orderNo,
        orderName: orderName.slice(0, 100),
        totalAmount: serverAmount,
        currency: 'CURRENCY_KRW',
        payMethod: selectedChannel.payMethod || 'CARD',
        customer: {
          fullName: name,
          phoneNumber: phone.replace(/[^0-9]/g, ''),
          email: email
        },
        redirectUrl: location.origin + location.pathname + '?pay=portone'
      };
      if (selectedChannel.easyPayProvider) {
        req.easyPay = { easyPayProvider: selectedChannel.easyPayProvider };
      }

      return window.PortOne.requestPayment(req).then(function (resp) {
        payBtn.disabled = false;
        payBtn.textContent = '결제하기';
        if (resp && resp.code != null) {
          if (!/CANCEL/i.test(resp.code || '')) {
            showResult(false, '결제 확인 필요', paymentCustomerMessage(resp, 'confirmation', true));
          }
          return;
        }
        verifyPayment(resp ? resp.paymentId : order.orderNo, attribution, product.listingId || null, order.checkoutToken || null);
      });
    }).catch(function (e) {
      console.warn('[BELLORE] 결제 요청 실패:', e);
      payBtn.disabled = false;
      payBtn.textContent = '결제하기';
      if (e && e.message === 'CHECKOUT_AMOUNT_CHANGED') {
        alert('결제 직전 상품가 또는 할인이 변경되었습니다. 화면을 새로고침한 뒤 다시 확인해 주세요.');
        return;
      }
      if (e && (e.code === 'PAYMENT_SESSION_EXPIRED' || e.message === 'PAYMENT_SESSION_EXPIRED')) { alert('로그인 정보가 만료되었습니다. 로그아웃 후 다시 로그인한 뒤 결제를 진행해 주세요.'); return; }
      if (e && e.code && !/CANCEL/i.test(e.code)) {
        alert(paymentCustomerMessage(e, 'payment_start', false));
      }
    });
  }
  // 결제 성공 후 서버(Edge Function) 검증
  function verifyPayment(paymentId, attribution, listingId, checkoutToken) {
    showResult(true, '결제 승인 처리 중...', '잠시만 기다려 주세요.');
    if (!(backendOn() && window.NWBackend.confirmOrder && PAY.confirmUrl)) {
      showResult(false, '결제 확인 필요', '결제 결과를 확인할 수 없습니다. 다시 결제하지 말고 고객센터로 문의해 주세요.');
      return;
    }
    var doConfirm = window.NWBackend.confirmOrder({ paymentId: paymentId,
      checkoutToken: checkoutToken || null, attribution: attribution || null });
    doConfirm.then(function (res) {
      if (res && (res.ok || res.alreadyPaid)) {
        if (window.BelloreAnalytics && window.BelloreAnalytics.purchaseComplete && res.order && res.order.id) {
          window.BelloreAnalytics.purchaseComplete(res.order, res.order.amount, listingId || res.order.listing_id || null);
        }
        if (window.belloreRefreshCoupons) window.belloreRefreshCoupons();
        showResult(true, '결제가 완료되었습니다',
          '주문번호 ' + (paymentId || '') + '\n마이페이지에서 주문 내역을 확인하실 수 있습니다.');
      } else {
        showResult(false, '결제 확인 필요',
          paymentCustomerMessage((res && res.error) ? res.error : res, 'confirmation', false));
      }
    }).catch(function () {
      showResult(false, '결제 확인이 지연되고 있습니다', '인터넷 연결을 확인해 주세요. 다시 결제하지 말고 잠시 후 결제 내역을 확인해 주세요.');
    });
  }

  /* ---------------- 결제 결과 처리 ---------------- */
  function showResult(ok, title, desc) {
    var box = $('#payResult');
    if (!box) { alert(title + '\n' + (desc || '')); return; }
    $('#prIcon').textContent = ok ? '✓' : '!';
    $('#prIcon').className = 'pay-result-icon' + (ok ? '' : ' fail');
    $('#prTitle').textContent = title;
    $('#prDesc').textContent = desc || '';
    box.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function handleReturn() {
    var q = new URLSearchParams(location.search);
    // 포트원 모바일 복귀: redirectUrl(?pay=portone) 뒤에 paymentId/code/message 가 붙는다.
    var paymentId = q.get('paymentId');
    if (q.get('pay') !== 'portone' && !paymentId) return;

    function cleanUrl() {
      history.replaceState({}, '', location.pathname + location.hash);
    }
    var code = q.get('code');   // 성공이면 없음
    cleanUrl();

    if (!paymentId) return; // pay=portone 만 있고 결과 없음(취소 등) → 조용히 종료

    if (code) {
      showResult(false, /CANCEL|FAILURE_TYPE_USER|PAY_PROCESS_CANCEL/i.test(code) ? '결제 취소' : '결제 확인 필요', paymentCustomerMessage({ code: code, message: q.get('message') || '' }, 'confirmation', true));
      return;
    }
    var pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('bellore_pending_order') || 'null'); } catch (_e) {}
    verifyPayment(paymentId, pending && pending.attribution, pending && pending.listingId, pending && pending.checkoutToken);
  }

  /* ---------------- 이벤트 바인딩 ---------------- */
  function init() {
    var closeBtn = $('#coClose');
    if (closeBtn) closeBtn.addEventListener('click', closeCheckout);

    var payBtn = $('#coPayBtn');
    if (payBtn) payBtn.addEventListener('click', requestPay);

    var methodsBox = $('#coMethods');
    if (methodsBox) methodsBox.addEventListener('click', function (e) {
      var btn = e.target.closest('.co-method');
      if (btn) selectChannel(btn.dataset.ch);
    });

    var findAddr = $('#coFindAddr');
    if (findAddr) findAddr.addEventListener('click', openPostcode);

    // 쿠폰 선택 변경 → 금액 재계산
    var cSel = $('#coCouponSelect');
    if (cSel) cSel.addEventListener('change', function () { setCouponMsg('', true); updateAmount(); });
    var cClear = $('#coCouponClear');
    if (cClear) cClear.addEventListener('click', function () { var ui = couponUi(); if (ui) ui.clear(updateAmount); });

    // 쿠폰 코드 등록
    var cApply = $('#coCouponApply');
    if (cApply) cApply.addEventListener('click', function () {
      var code = ($('#coCouponCode').value || '').trim();
      if (!code) { setCouponMsg('쿠폰 코드를 입력해 주세요.', false); return; }
      if (!(backendOn() && window.NWBackend.claimCouponByCode)) { setCouponMsg('로그인이 필요합니다.', false); return; }
      cApply.disabled = true;
      window.NWBackend.claimCouponByCode(code).then(function (newUc) {
        setCouponMsg('쿠폰이 등록되었습니다.', true);
        $('#coCouponCode').value = '';
        return loadCoupons().then(function () {
          var sel = $('#coCouponSelect');
          if (sel && newUc && newUc.id) { sel.value = newUc.id; updateAmount(); }
          if (window.belloreRefreshCoupons) window.belloreRefreshCoupons();
        });
      }).catch(function (e) { setCouponMsg(couponErrText(e), false); })
        .then(function () { cApply.disabled = false; });
    });

    var prHome = $('#prHome');
    if (prHome) prHome.addEventListener('click', function () {
      var box = $('#payResult');
      if (box) box.hidden = true;
      document.body.style.overflow = '';
      closeCheckout();
      if (window.location.hash !== '#mypage') {
        var my = document.querySelector('[data-nav="mypage"]');
        if (my) my.click();
      }
    });

    handleReturn();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
