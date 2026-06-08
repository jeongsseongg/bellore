/* ============================================================
   벨로르(BELLORE) · 결제(토스페이먼츠) 연동
   ------------------------------------------------------------
   - 상품 상세의 "바로구매" → 체크아웃 모달 → 토스 결제위젯
   - 예약금/전액 선택, 구매자 정보 입력, 주문 DB 기록
   - 결제 후 successUrl 로 복귀하면 Edge Function 으로 승인 검증
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

  // 결제 금액 계산
  function calcDeposit(price) {
    var rate = PAY.depositRate || 0.10;
    var d = Math.round((price * rate) / 1000) * 1000;
    d = Math.max(PAY.depositMin || 0, Math.min(d, PAY.depositMax || price));
    return Math.min(d, price); // 상품가보다 클 수 없음
  }
  function calcFull(price) {
    return price + (PAY.shippingFee || 0);
  }

  // 고객 식별키 (위젯 필수) — 로그인 uid 우선, 없으면 로컬 저장
  function customerKey() {
    var u = currentUser();
    if (u && u.uid) return 'ck_' + u.uid;
    var k = localStorage.getItem('bellore_ck');
    if (!k) {
      k = 'ck_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('bellore_ck', k);
    }
    return k;
  }

  /* ---------------- 체크아웃 모달 ---------------- */
  var modal, product, payType = 'deposit';
  var tossWidgets = null, widgetsReady = null;

  function getModal() { return $('#checkoutModal'); }

  function setPayType(t) {
    payType = t;
    var btns = document.querySelectorAll('#coPayType .co-pt');
    Array.prototype.forEach.call(btns, function (b) {
      b.classList.toggle('active', b.dataset.pt === t);
    });
    updateAmount();
  }

  function currentAmount() {
    if (!product) return 0;
    return payType === 'full' ? calcFull(product.price) : calcDeposit(product.price);
  }

  function updateAmount() {
    var amt = currentAmount();
    var totalEl = $('#coTotal');
    if (totalEl) totalEl.textContent = fmt(amt) + '원';
    if (tossWidgets && amt > 0) {
      try { tossWidgets.setAmount({ currency: 'KRW', value: amt }); } catch (e) {}
    }
  }

  function renderProduct() {
    if (!product) return;
    $('#coImg').src = product.image || 'assets/images.jpg';
    $('#coBrand').textContent = product.brand || '';
    $('#coModel').textContent = product.model || '';
    $('#coListPrice').textContent = product.price ? (fmt(product.price) + '원') : '가격 문의';
    $('#coPtDeposit').textContent = product.price ? (fmt(calcDeposit(product.price)) + '원') : '-';
    $('#coPtFull').textContent = product.price ? (fmt(calcFull(product.price)) + '원') : '-';

    // 로그인 사용자 정보 채우기
    var u = currentUser();
    if (u) {
      if (!$('#coName').value) $('#coName').value = u.displayName || '';
    }
  }

  // 토스 위젯 초기화/렌더
  function ensureWidgets() {
    if (widgetsReady) return widgetsReady;
    if (!window.TossPayments || !PAY.clientKey) {
      widgetsReady = Promise.reject(new Error('TOSS_SDK_MISSING'));
      return widgetsReady;
    }
    widgetsReady = (function () {
      var toss = window.TossPayments(PAY.clientKey);
      tossWidgets = toss.widgets({ customerKey: customerKey() });
      return tossWidgets.setAmount({ currency: 'KRW', value: currentAmount() || 1000 })
        .then(function () {
          return Promise.all([
            tossWidgets.renderPaymentMethods({ selector: '#payment-method', variantKey: 'DEFAULT' }),
            tossWidgets.renderAgreement({ selector: '#agreement', variantKey: 'AGREEMENT' })
          ]);
        });
    })();
    return widgetsReady;
  }

  function openCheckout(p) {
    // 로그인 확인
    if (backendOn() && !currentUser()) {
      var lm = $('#loginModal');
      if (lm) { lm.hidden = false; document.body.style.overflow = 'hidden'; }
      alert('결제를 진행하려면 로그인이 필요합니다.');
      return;
    }
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
    payType = 'deposit';
    setPayType('deposit');
    renderProduct();
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    var sc = modal.querySelector('.co-scroll');
    if (sc) sc.scrollTop = 0;

    ensureWidgets().then(updateAmount).catch(function (e) {
      console.warn('[BELLORE] 토스 위젯 로드 실패:', e);
    });
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
    if (!tossWidgets) {
      alert('결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      ensureWidgets().then(updateAmount).catch(function () {});
      return;
    }

    var amount = currentAmount();
    var orderName = (product.brand ? product.brand + ' ' : '') + (product.model || '상품');
    if (payType === 'deposit') orderName += ' (예약금)';

    var payBtn = $('#coPayBtn');
    payBtn.disabled = true;
    payBtn.textContent = '주문 생성 중...';

    // 1) pending 주문 생성 → order_no 발급
    var createOrder = (backendOn() && window.NWBackend.createOrder)
      ? window.NWBackend.createOrder({
          listingId: product.listingId,
          productName: orderName,
          productBrand: product.brand,
          productImage: product.image,
          productPrice: product.price,
          payType: payType,
          amount: amount,
          buyerName: name,
          buyerPhone: phone
        })
      : Promise.resolve({ orderNo: 'DEMO' + Date.now().toString(36).toUpperCase() });

    createOrder.then(function (order) {
      // 주문번호/금액을 복귀 후 검증용으로 저장
      try {
        sessionStorage.setItem('bellore_pending_order', JSON.stringify({
          orderNo: order.orderNo, amount: amount
        }));
      } catch (e) {}

      return tossWidgets.requestPayment({
        orderId: order.orderNo,
        orderName: orderName.slice(0, 100),
        successUrl: location.origin + location.pathname + '?pay=success',
        failUrl: location.origin + location.pathname + '?pay=fail',
        customerName: name,
        customerMobilePhone: phone.replace(/[^0-9]/g, '')
      });
    }).catch(function (e) {
      console.warn('[BELLORE] 결제 요청 실패:', e);
      payBtn.disabled = false;
      payBtn.textContent = '결제하기';
      if (e && e.code && e.code !== 'USER_CANCEL') {
        alert('결제를 시작할 수 없습니다: ' + (e.message || e.code));
      }
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
    var pay = q.get('pay');
    if (!pay) return;

    // URL 정리
    function cleanUrl() {
      history.replaceState({}, '', location.pathname + location.hash);
    }

    if (pay === 'fail') {
      cleanUrl();
      var msg = q.get('message') || '결제가 취소되었거나 실패했습니다.';
      showResult(false, '결제 실패', msg);
      return;
    }

    if (pay === 'success') {
      var paymentKey = q.get('paymentKey');
      var orderId = q.get('orderId');
      var amount = parseInt(q.get('amount'), 10);
      cleanUrl();

      showResult(true, '결제 승인 처리 중...', '잠시만 기다려 주세요.');

      var doConfirm = (backendOn() && window.NWBackend.confirmOrder)
        ? window.NWBackend.confirmOrder({ paymentKey: paymentKey, orderId: orderId, amount: amount })
        : Promise.resolve({ ok: true, demo: true });

      doConfirm.then(function (res) {
        if (res && (res.ok || res.alreadyPaid)) {
          showResult(true, '결제가 완료되었습니다',
            '주문번호 ' + (orderId || '') + '\n마이페이지에서 주문 내역을 확인하실 수 있습니다.');
        } else if (res && res.demo) {
          showResult(true, '결제 완료 (데모)',
            '서버 승인(Edge Function) 미배포 상태입니다.\n주문번호 ' + (orderId || ''));
        } else {
          showResult(false, '결제 승인 실패',
            (res && res.error) ? res.error : '결제 승인 중 문제가 발생했습니다. 고객센터로 문의해 주세요.');
        }
      }).catch(function () {
        showResult(false, '결제 승인 오류', '네트워크 오류로 승인을 확인하지 못했습니다.');
      });
    }
  }

  /* ---------------- 이벤트 바인딩 ---------------- */
  function init() {
    var closeBtn = $('#coClose');
    if (closeBtn) closeBtn.addEventListener('click', closeCheckout);

    var ptWrap = $('#coPayType');
    if (ptWrap) ptWrap.addEventListener('click', function (e) {
      var btn = e.target.closest('.co-pt');
      if (btn) setPayType(btn.dataset.pt);
    });

    var payBtn = $('#coPayBtn');
    if (payBtn) payBtn.addEventListener('click', requestPay);

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
