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

  // 설정에 채워진(=channelKey 가 있는) 결제수단만 사용
  function activeChannels() {
    var list = (PAY.channels || []).filter(function (c) { return c && c.channelKey; });
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
      PAY.confirmUrl
    );
  }

  // 결제수단 버튼 렌더
  function renderMethods() {
    var box = $('#coMethods');
    if (!box) return;
    var chans = activeChannels();
    if (!portoneReady()) {
      box.innerHTML = '<p class="co-methods-empty">결제 수단을 준비 중입니다. PG 운영 채널과 서버 결제 검증이 모두 활성화된 후 결제할 수 있습니다.</p>';
      selectedChannel = null;
      return;
    }
    if (!selectedChannel || chans.indexOf(selectedChannel) === -1) selectedChannel = chans[0];
    box.innerHTML = chans.map(function (c) {
      var on = (c === selectedChannel);
      return '<button type="button" class="co-method' + (on ? ' active' : '') +
        '" data-ch="' + escLite(c.id) + '">' + escLite(c.label) + '</button>';
    }).join('');
  }
  function selectChannel(id) {
    var chans = activeChannels();
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
  function currentDiscount(base) {
    var uc = getSelectedCoupon();
    if (!uc || !window.NWBackend || !window.NWBackend.couponDiscount) return 0;
    return window.NWBackend.couponDiscount(uc.coupon, base);
  }
  function baseAmount() {
    if (!product) return 0;
    return calcFull(product.price);
  }
  function currentAmount() {
    var b = baseAmount();
    return Math.max(0, b - currentDiscount(b));
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
    if (!name || !phone) { alert('이름과 연락처를 입력해 주세요.'); return; }

    var ship = {};
    ship.recipient = ($('#coShipName').value || '').trim() || name;
    ship.phone = ($('#coShipPhone').value || '').trim() || phone;
    ship.postcode = ($('#coPostcode').value || '').trim();
    ship.addr1 = ($('#coAddr1').value || '').trim();
    ship.addr2 = ($('#coAddr2').value || '').trim();
    ship.request = ($('#coShipReq').value || '').trim();
    if (!ship.postcode || !ship.addr1) { alert('배송 주소를 입력해 주세요.'); return; }
    if (!portoneReady()) {
      alert('PG 운영 채널 또는 서버 결제 검증이 준비되지 않아 결제를 진행할 수 없습니다.');
      renderMethods();
      return;
    }
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

    var uc = getSelectedCoupon();
    var base = baseAmount();
    var discount = uc ? currentDiscount(base) : 0;
    var amount = Math.max(0, base - discount);
    if (amount < 100) { alert('쿠폰 할인 후 결제금액이 너무 적습니다. 다른 결제 방식을 선택해 주세요.'); return; }
    var orderName = (product.brand ? product.brand + ' ' : '') + (product.model || '상품');

    var payBtn = $('#coPayBtn');
    payBtn.disabled = true;
    payBtn.textContent = '주문 생성 중...';

    // 1) pending 주문 생성 → order_no 발급
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
          shipRequest: ship.request || null
        });

    createOrder.then(function (order) {
      // 주문번호/금액을 복귀 후 검증용으로 저장
      try {
        sessionStorage.setItem('bellore_pending_order', JSON.stringify({
          orderNo: order.orderNo, amount: amount
        }));
      } catch (e) {}

      payBtn.textContent = '결제 진행 중...';
      var u = currentUser();
      var req = {
        storeId: PAY.storeId,
        channelKey: selectedChannel.channelKey,
        paymentId: order.orderNo,
        orderName: orderName.slice(0, 100),
        totalAmount: amount,
        currency: 'CURRENCY_KRW',
        payMethod: selectedChannel.payMethod || 'CARD',
        customer: {
          fullName: name,
          phoneNumber: phone.replace(/[^0-9]/g, ''),
          email: (u && u.email) || undefined
        },
        // 모바일은 이 주소로 복귀하며 포트원이 결과 파라미터를 덧붙인다.
        redirectUrl: location.origin + location.pathname + '?pay=portone'
      };
      if (selectedChannel.easyPayProvider) {
        req.easyPay = { easyPayProvider: selectedChannel.easyPayProvider };
      }

      return window.PortOne.requestPayment(req).then(function (resp) {
        // 데스크톱: 여기로 결과가 돌아온다(모바일은 redirectUrl 로 이동).
        payBtn.disabled = false;
        payBtn.textContent = '결제하기';
        if (resp && resp.code != null) {
          // 사용자 취소 등 실패
          if (!/CANCEL/i.test(resp.code || '')) {
            showResult(false, '결제 실패', resp.message || '결제가 취소되었거나 실패했습니다.');
          }
          return;
        }
        // 성공 → 서버 검증
        verifyPayment(resp ? resp.paymentId : order.orderNo);
      });
    }).catch(function (e) {
      console.warn('[BELLORE] 결제 요청 실패:', e);
      payBtn.disabled = false;
      payBtn.textContent = '결제하기';
      // 비회원 결제 RLS(guest_checkout.sql) 미설정 시 폴백: 기존처럼 로그인 안내
      if (e && (e.message === 'GUEST_CHECKOUT_DISABLED' || e.guest)) {
        alert('비회원 결제는 현재 준비 중입니다. 로그인 후 이용해 주세요.');
        var lm = $('#loginModal'); if (lm) { lm.hidden = false; document.body.style.overflow = 'hidden'; }
        return;
      }
      if (e && e.code && !/CANCEL/i.test(e.code)) {
        alert('결제를 시작할 수 없습니다: ' + (e.message || e.code));
      }
    });
  }

  // 결제 성공 후 서버(Edge Function) 검증
  function verifyPayment(paymentId) {
    showResult(true, '결제 승인 처리 중...', '잠시만 기다려 주세요.');
    if (!(backendOn() && window.NWBackend.confirmOrder && PAY.confirmUrl)) {
      showResult(false, '결제 승인 확인 불가', '서버 결제 검증이 준비되지 않았습니다. 고객센터로 문의해 주세요.');
      return;
    }
    var doConfirm = window.NWBackend.confirmOrder({ paymentId: paymentId });
    doConfirm.then(function (res) {
      if (res && (res.ok || res.alreadyPaid)) {
        if (window.belloreRefreshCoupons) window.belloreRefreshCoupons();
        showResult(true, '결제가 완료되었습니다',
          '주문번호 ' + (paymentId || '') + '\n마이페이지에서 주문 내역을 확인하실 수 있습니다.');
      } else {
        showResult(false, '결제 승인 실패',
          (res && res.error) ? res.error : '결제 검증 중 문제가 발생했습니다. 고객센터로 문의해 주세요.');
      }
    }).catch(function () {
      showResult(false, '결제 승인 오류', '네트워크 오류로 승인을 확인하지 못했습니다.');
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
      showResult(false, '결제 실패', q.get('message') || '결제가 취소되었거나 실패했습니다.');
      return;
    }
    verifyPayment(paymentId);
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
    if (cSel) cSel.addEventListener('change', updateAmount);

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
