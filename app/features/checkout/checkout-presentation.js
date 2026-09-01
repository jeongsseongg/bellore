'use strict';

  const ASSET_VERSION = '20260901-kg-hub-easypay-v1';

  function ensureStyles(doc) {
    if (doc.querySelector('link[data-bellore-checkout-order]')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'app/features/checkout/checkout-order.css?v=' + ASSET_VERSION;
    link.dataset.belloreCheckoutOrder = 'true';
    doc.head.appendChild(link);
  }

  function receiveMarkup() {
    return '<h3 class="co-sec-title">상품 수령 방법</h3>' +
      '<p class="co-sec-desc">발렉스 안전배송 또는 벨로르 매장 직접거래 중 원하는 수령 방법을 선택해 주세요.</p>' +
      '<label class="co-receive-option is-selected">' +
        '<input class="co-receive-radio" type="radio" name="coFulfillment" value="delivery" checked>' +
        '<span class="co-receive-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M3 7.5h11v9H3zM14 10.5h3.8l3.2 3.2v2.8h-7zM6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></span>' +
        '<span class="co-receive-content"><span class="co-receive-head"><strong>발렉스 프리미엄 안전배송</strong><span class="co-receive-badge" data-receive-badge data-default-label="안전배송">선택됨</span></span>' +
        '<p>고가 시계 전문 운송사가 보험과 전용 포장을 포함해 안전하게 배송합니다.</p>' +
        '<span class="co-receive-meta"><span>500만원 이상</span><b>배송비 35,000원</b></span><span class="co-receive-meta"><span>500만원 미만</span><b>전국 무료배송</b></span></span>' +
      '</label>' +
      '<label class="co-receive-option">' +
        '<input class="co-receive-radio" type="radio" name="coFulfillment" value="pickup">' +
        '<span class="co-receive-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 10h16M5.5 10v9h13v-9M3.5 10l2-5h13l2 5M9 19v-5h6v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
        '<span class="co-receive-content"><span class="co-receive-head"><strong>벨로르 매장 직접거래</strong><span class="co-receive-badge is-muted" data-receive-badge data-default-label="상담 후 방문">상담 후 방문</span></span>' +
        '<p>결제 후 전문 상담사가 방문 일정과 수령 절차를 안내합니다.</p><span class="co-receive-contact"><b>전문 상담사 배정</b><span>결제 완료 후 순차 연락</span></span></span>' +
      '</label>';
  }

  function amountMarkup() {
    return '<h3 class="co-sec-title">결제 예정금액</h3><div class="co-amount-rows">' +
      '<div class="co-price-row"><span>상품금액</span><strong id="coSubtotal">0원</strong></div>' +
      '<div class="co-price-row"><span id="coShippingLabel">배송비</span><strong id="coShipping">0원</strong></div>' +
      '<div class="co-reward-row" id="coRewardRow" hidden><span>결제 후 예상 적립</span><strong id="coReward">0P</strong></div>' +
      '<p class="co-reward-note" id="coRewardNote" hidden></p>' +
      '<div class="co-price-row co-price-total"><span>총 결제금액</span><strong id="coAmountTotal">0원</strong></div></div>';
  }

  function installCheckoutUi(doc) {
    ensureStyles(doc);
    var shipping = doc.getElementById('coShipSec');
    if (shipping && !doc.getElementById('coReceiveSec')) {
      var receive = doc.createElement('section');
      receive.className = 'co-sec'; receive.id = 'coReceiveSec'; receive.innerHTML = receiveMarkup();
      shipping.parentNode.insertBefore(receive, shipping);
    }
    var methods = doc.getElementById('coMethods');
    if (methods && !doc.getElementById('coAmountSec')) {
      var methodSection = methods.closest('.co-sec');
      if (!methodSection || !methodSection.parentNode) return;
      var amount = doc.createElement('section');
      amount.className = 'co-sec'; amount.id = 'coAmountSec'; amount.innerHTML = amountMarkup();
      methodSection.parentNode.insertBefore(amount, methodSection);
      var discount = doc.getElementById('coDiscountRow');
      var reward = doc.getElementById('coRewardRow');
      if (discount && reward) reward.parentNode.insertBefore(discount, reward);
    }
    doc.querySelector('.co-coupon-code')?.remove();
  }

  function syncFulfillment(doc) {
    var checked = doc.querySelector('input[name="coFulfillment"]:checked');
    var method = checked && checked.value === 'pickup' ? 'pickup' : 'delivery';
    Array.from(doc.querySelectorAll('.co-receive-option')).forEach(function (option) {
      var input = option.querySelector('input[name="coFulfillment"]');
      var active = Boolean(input && input.checked), badge = option.querySelector('[data-receive-badge]');
      option.classList.toggle('is-selected', active);
      if (badge) {
        badge.textContent = active ? '선택됨' : badge.dataset.defaultLabel;
        badge.classList.toggle('is-muted', !active);
      }
    });
    var shipping = doc.getElementById('coShipSec');
    if (shipping) shipping.hidden = method !== 'delivery';
    return method;
  }

  function renderAmountSummary(doc, values, format) {
    var write = function (id, text) { var el = doc.getElementById(id); if (el) el.textContent = text; };
    write('coSubtotal', format(values.productPrice) + '원');
    write('coShippingLabel', values.fulfillment === 'pickup' ? '직접거래' : '배송비');
    write('coShipping', values.fulfillment === 'pickup'
      ? '추가비용 없음' : (values.shipping > 0 ? ('+' + format(values.shipping) + '원') : '무료'));
    write('coAmountTotal', format(values.total) + '원');
    write('coReward', format(Math.floor(values.total * values.rewardBps / 10000)) + 'P');
    var row = doc.getElementById('coRewardRow'), note = doc.getElementById('coRewardNote');
    if (row) row.hidden = !values.showReward;
    if (note) {
      note.hidden = !values.showReward;
      note.textContent = values.showReward ? '결제 확정 후 포인트가 적립됩니다.' : '';
    }
  }

  function methodVisual(id) {
    var visuals = {
      card: { src: 'assets/payment-methods/card.svg', alt: '', tone: 'card' },
      easy: { src: 'assets/payment-methods/easy-pay.svg', alt: '', tone: 'easy' },
      virtual: { src: 'assets/payment-methods/virtual-account.svg', alt: '', tone: 'virtual' },
      'naver-order': { src: 'assets/payment-methods/naverpay-badge.svg', alt: '', tone: 'naver' }
    };
    return visuals[id] || { src: 'assets/payment-methods/card.svg', alt: '', tone: 'default' };
  }

  function methodMarkup(channels, selected, escapeText) {
    return channels.map(function (channel) {
      var visual = methodVisual(channel.id);
      var active = channel === selected ? ' active' : '';
      return '<button type="button" class="co-method' + active + '" data-ch="' + escapeText(channel.id) + '">' +
        '<span class="co-method-icon is-' + escapeText(visual.tone) + '"><img src="' + escapeText(visual.src) + '" alt="' + escapeText(visual.alt) + '"></span>' +
        '<span class="co-method-copy"><strong>' + escapeText(channel.label) + '</strong><small>' + escapeText(channel.hint || '') + '</small></span>' +
        '<span class="co-method-radio" aria-hidden="true"></span></button>';
    }).join('');
  }

  function productValue(product, keys, fallback) {
    for (var i = 0; i < keys.length; i++) {
      var raw = product[keys[i]];
      if (raw !== undefined && raw !== null && String(raw).trim()) return String(raw).trim();
    }
    return fallback || '확인 필요';
  }

  function renderProductDetails(product, query) {
    function write(id, keys, fallback) {
      var el = query('#' + id);
      if (el) el.textContent = productValue(product, keys, fallback);
    }
    var size = productValue(product, ['size', 'sizeMm', 'size_mm'], '');
    if (size && !/mm$/i.test(size)) size += 'mm';
    write('coDetailBrand', ['brand']);
    write('coDetailModel', ['model']);
    write('coDetailRef', ['referenceNo', 'reference_no', 'refId', 'ref_id', 'ref']);
    write('coDetailNo', ['productNo', 'product_no', 'no']);
    var sizeEl = query('#coDetailSize'); if (sizeEl) sizeEl.textContent = size || '확인 필요';
    write('coDetailYear', ['stampingYear', 'stamping', 'purchaseYear', 'purchase_year']);
    write('coDetailComponents', ['components', 'accessories', 'setGrade', 'set_grade']);
    write('coDetailMovement', ['movement']);
    write('coDetailCondition', ['condition']);
    var description = productValue(product, ['detailDescription', 'detail_desc', 'description', 'sourceDescription', 'source_description', 'specialNote', 'special_note'], '');
    if (/^(확인 필요|정보없음|-)$/i.test(description)) description = '';
    var wrap = query('#coDetailDescriptionWrap'), text = query('#coDetailDescription');
    if (text) text.textContent = description;
    if (wrap) wrap.hidden = !description;
  }

export function createCheckoutPresentation() {
  return Object.freeze({
    methodMarkup: methodMarkup,
    renderProductDetails: renderProductDetails,
    install: installCheckoutUi,
    syncFulfillment: syncFulfillment,
    renderAmountSummary: renderAmountSummary
  });
}
