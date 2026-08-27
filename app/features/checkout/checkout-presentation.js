'use strict';

  function methodVisual(id) {
    var visuals = {
      card: { src: 'assets/payment-methods/card.svg', alt: '', tone: 'card' },
      virtual: { src: 'assets/payment-methods/virtual-account.svg', alt: '', tone: 'virtual' },
      'naver-order': { src: 'assets/payment-methods/naverpay-badge.svg', alt: '', tone: 'naver' },
      kakaopay: { src: 'assets/payment-methods/kakaopay.png', alt: '', tone: 'kakao' },
      tosspay: { src: 'assets/payment-methods/tosspay.png', alt: '', tone: 'toss' }
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
    renderProductDetails: renderProductDetails
  });
}
