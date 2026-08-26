/* ============================================================
   BELLORE Recommendation Engine v2
   ------------------------------------------------------------
   Small-catalog, deterministic recommendation pipeline:
     hydrate -> eligibility/query gates -> multi-action proxy score
     -> diversity/discovery rerank -> post-filter -> explanations

   Important: action proxies are heuristic ranking signals, not
   calibrated probabilities. No external model or source code is used.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BelloreRecommendationEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 'bellore-reco-v2.0.0';
  var DAY = 24 * 60 * 60 * 1000;
  var LN2 = Math.log(2);

  var DEFAULTS = {
    limit: 8,
    diversityLambda: 0.19,
    brandCap: 2,
    explorationEvery: 5,
    explorationPool: 20,
    purchaseReferenceCooldownDays: 30,
    interestHalfLifeDays: 60,
    eventHalfLifeDays: {
      product_view: 14,
      recommendation_click: 14,
      wishlist_add: 45,
      wishlist_remove: 60,
      cart_add: 30,
      cart_remove: 45,
      inquiry_submit: 30,
      price_alert_set: 45,
      purchase_request: 30,
      purchase_complete: 120,
      recommendation_dismiss: 60
    }
  };

  var EVENT_WEIGHTS = {
    product_view: 0.16,
    recommendation_click: 0.20,
    wishlist_add: 0.48,
    cart_add: 0.72,
    inquiry_submit: 0.64,
    price_alert_set: 0.58,
    purchase_request: 0.90,
    wishlist_remove: -0.78,
    cart_remove: -0.70,
    recommendation_dismiss: -0.92,
    purchase_complete: 0
  };

  var REJECTED_STATUSES = {
    sold: 1, sold_out: 1, hidden: 1, inactive: 1, unavailable: 1,
    deleted: 1, draft: 1, off: 1, '\uD310\uB9E4\uC644\uB8CC': 1, '\uD488\uC808': 1, '\uBE44\uACF5\uAC1C': 1
  };

  function clamp(n, lo, hi) {
    n = Number(n);
    if (!isFinite(n)) n = lo;
    return Math.max(lo, Math.min(hi, n));
  }

  function round(n, digits) {
    var p = Math.pow(10, digits == null ? 4 : digits);
    return Math.round(Number(n || 0) * p) / p;
  }

  function list(value) {
    if (Array.isArray(value)) return value.filter(function (x) { return x != null && String(x).trim(); });
    return value == null || String(value).trim() === '' ? [] : [value];
  }

  function text(value) {
    var s = String(value == null ? '' : value);
    try { s = s.normalize('NFKC'); } catch (e) {}
    return s.toLowerCase().replace(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3]+/g, '');
  }

  function tokens(value) {
    var raw = String(value == null ? '' : value).toLowerCase();
    try { raw = raw.normalize('NFKC'); } catch (e) {}
    var out = raw.split(/[^0-9a-z\u3131-\u318e\uac00-\ud7a3]+/).filter(function (x) { return x.length > 1; });
    var seen = {};
    return out.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
  }

  function textMatch(a, b) {
    var x = text(a), y = text(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    if (x.indexOf(y) >= 0 || y.indexOf(x) >= 0) return 0.82;
    var ax = tokens(a), by = tokens(b), hit = 0, seen = {};
    ax.forEach(function (t) { seen[t] = 1; });
    by.forEach(function (t) { if (seen[t]) hit += 1; });
    return hit ? clamp(hit / Math.max(ax.length, by.length), 0, 0.72) : 0;
  }

  function arrayMatch(values, candidate) {
    var best = 0;
    list(values).forEach(function (value) { best = Math.max(best, textMatch(value, candidate)); });
    return best;
  }

  function exactCategoricalMatch(values, candidate) {
    var normalized = text(candidate);
    return normalized && list(values).some(function (value) {
      return text(value) === normalized;
    }) ? 1 : 0;
  }

  function firstPhoto(row) {
    var photos = row.photos || row.image_urls || row.imageUrls || [];
    if (Array.isArray(photos) && photos.length) return photos[0] || '';
    return row.photo || row.img || row.image_url || row.image || '';
  }

  function normalizeProduct(row, now) {
    row = row || {};
    var reference = row.reference_number || row.reference_no || row.referenceNo || row.ref || '';
    var listPrice = Number(row.price != null ? row.price : row.sellingPrice) || 0;
    var salePrice = Number(row.sale_price) || 0;
    var saleBase = row.sale_started_at || row.created_at || row.createdAt || null;
    var saleActive = Array.isArray(row.tags) && row.tags.indexOf('sale') >= 0 &&
      !!timestamp(saleBase) && timestamp(saleBase) + 72 * 60 * 60 * 1000 > (timestamp(now) || Date.now()) &&
      salePrice > 0 && salePrice < listPrice;
    var price = saleActive ? salePrice : listPrice;
    var previous = Number(saleActive ? listPrice : (row.prev_price != null ? row.prev_price
      : (row.previous_price != null ? row.previous_price : row.original_price))) || 0;
    return {
      id: String(row.id || row.listingId || row.sourceId || '').trim(),
      brand: String(row.brand || row.title || '').trim(),
      model: String(row.model || row.modelName || row.description || '').trim(),
      reference_number: String(reference || '').trim(),
      product_no: String(row.product_no || row.productNo || '').trim(),
      price: price,
      prev_price: previous > 0 ? previous : null,
      sale_active: saleActive,
      status: String(row.status || row.registrationStatus || 'on_sale').toLowerCase(),
      condition: String(row.condition || row.grade || '').trim(),
      color: String(row.color || row.dial_color || row.dialColor || '').trim(),
      size: row.size != null ? row.size : (row.size_mm != null ? row.size_mm : row.sizeMm),
      material: String(row.material || '').trim(),
      pack: String(row.pack || row.components || '').trim(),
      accessories: String(row.accessories || '').trim(),
      has_warranty: row.has_warranty === true || row.hasWarranty === true,
      photo: firstPhoto(row),
      photo_count: Array.isArray(row.photos || row.image_urls || row.imageUrls)
        ? (row.photos || row.image_urls || row.imageUrls).filter(Boolean).length
        : (firstPhoto(row) ? 1 : 0),
      created_at: row.created_at || row.createdAt || null,
      sale_started_at: row.sale_started_at || null,
      description: String(row.detail_desc || row.sourceDescription || row.special_note || '').trim(),
      raw: row
    };
  }

  function timestamp(value) {
    if (value == null || value === '') return 0;
    var n = typeof value === 'number' ? value : Date.parse(value);
    return isFinite(n) ? n : 0;
  }

  function ageDays(value, now) {
    var ts = timestamp(value);
    if (!ts) return Infinity;
    return Math.max(0, (now - ts) / DAY);
  }

  function decay(value, now, halfLifeDays) {
    var age = ageDays(value, now);
    if (!isFinite(age)) return 0.35;
    return Math.exp(-LN2 * age / Math.max(0.25, Number(halfLifeDays) || 30));
  }

  function hash32(value) {
    var s = String(value == null ? '' : value), h = 2166136261;
    for (var i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function hashUnit(value) { return hash32(value) / 4294967296; }

  function assignVariant(subjectKey, experimentId, variants) {
    variants = Array.isArray(variants) && variants.length ? variants : [
      { id: 'control', allocation: 0.5 }, { id: 'challenger', allocation: 0.5 }
    ];
    var bucket = hashUnit(String(experimentId || 'default') + '|' + String(subjectKey || 'anonymous'));
    var total = variants.reduce(function (sum, item) { return sum + Math.max(0, Number(item.allocation) || 0); }, 0) || 1;
    var cursor = 0;
    for (var i = 0; i < variants.length; i += 1) {
      cursor += Math.max(0, Number(variants[i].allocation) || 0) / total;
      if (bucket < cursor || i === variants.length - 1) return String(variants[i].id);
    }
    return String(variants[0].id);
  }

  function profileContext(profile) {
    profile = profile || {};
    return {
      brands: list(profile.preferred_brands || profile.brands),
      models: list(profile.preferred_models || profile.models),
      references: list(profile.preferred_references || profile.references),
      budgetMin: Number(profile.budget_min != null ? profile.budget_min : profile.budgetMin) || 0,
      budgetMax: Number(profile.budget_max != null ? profile.budget_max : profile.budgetMax) || 0,
      condition: profile.preferred_condition || profile.condition || '',
      color: profile.preferred_color || profile.color || '',
      size: profile.preferred_size || profile.size || '',
      intentIndex: clamp(Number(profile.buy_probability != null ? profile.buy_probability : profile.intent_score) || 0, 0, 100) / 100
    };
  }

  function eventTime(event) {
    return event.created_at || event.at || event.updated_at || event.last_clicked_at || event.last_wishlisted_at || null;
  }

  function effectiveIntentIndex(profile, events, now, cooldownDays) {
    var latestPurchase = 0, latestPrePurchase = 0;
    (events || []).forEach(function (event) {
      var at = timestamp(eventTime(event));
      if (event.event_type === 'purchase_complete') latestPurchase = Math.max(latestPurchase, at);
      if (event.event_type === 'cart_add' || event.event_type === 'purchase_request' || event.event_type === 'inquiry_submit') {
        latestPrePurchase = Math.max(latestPrePurchase, at);
      }
    });
    if (latestPurchase && latestPurchase >= latestPrePurchase && ageDays(latestPurchase, now) <= cooldownDays) {
      return Math.min(profile.intentIndex, 0.10);
    }
    return profile.intentIndex;
  }

  function matchSignal(product, signal, allowBrand) {
    signal = signal || {};
    var pid = String(signal.product_id || signal.listing_id || '').trim();
    if (pid && pid === product.id) return 1;
    var ref = signal.reference_number || signal.reference_no || '';
    if (ref && product.reference_number && text(ref) === text(product.reference_number)) return 0.96;
    var modelMatch = textMatch(signal.model || '', product.model);
    if (modelMatch) return 0.76 * modelMatch;
    var brandMatch = exactCategoricalMatch([signal.brand || ''], product.brand);
    return allowBrand !== false && brandMatch ? 0.34 * brandMatch : 0;
  }

  function interestFeatures(product, interests, now, config) {
    var best = 0, exact = 0, source = '';
    (interests || []).forEach(function (item) {
      var match = matchSignal(product, item, true);
      if (!match) return;
      var score = clamp(Number(item.interest_score) || 0, 0, 200);
      var saturation = 1 - Math.exp(-score / 35);
      var when = item.last_wishlisted_at || item.last_clicked_at || item.last_mentioned_at || item.updated_at || item.created_at;
      var value = match * saturation * decay(when, now, config.interestHalfLifeDays);
      if (value > best) {
        best = value;
        exact = match >= 0.9 ? 1 : 0;
        source = item.source || 'interest';
      }
    });
    return { score: clamp(best, 0, 1), exact: exact, source: source };
  }

  function eventFeatures(product, events, now, config) {
    var positiveByType = {}, negativeByType = {}, shortBest = 0;
    var latestState = {};
    var impressions = 0, purchasedCooldown = 0;
    (events || []).forEach(function (event) {
      var type = String(event.event_type || '');
      var match = matchSignal(product, event, type !== 'purchase_complete');
      if (!match) return;
      var days = ageDays(eventTime(event), now);
      if (type === 'purchase_complete') {
        var exactRef = product.reference_number &&
          text(event.reference_number || '') === text(product.reference_number);
        var exactId = event.product_id && String(event.product_id) === product.id;
        if ((exactId || exactRef) && days <= config.purchaseReferenceCooldownDays) purchasedCooldown = 1;
        return;
      }
      if (type === 'recommendation_impression' && match >= 0.9 && days <= 7) {
        impressions += 1;
        return;
      }
      var weight = EVENT_WEIGHTS[type];
      if (!weight) return;
      var halfLife = config.eventHalfLifeDays[type] || 30;
      var timeWeight = decay(eventTime(event), now, halfLife);
      var magnitude = Math.abs(weight) * match * timeWeight;
      var stateChannel = type === 'wishlist_add' || type === 'wishlist_remove' ? 'wishlist'
        : (type === 'cart_add' || type === 'cart_remove' ? 'cart' : '');
      if (stateChannel) {
        // 찜/장바구니의 현재 상태는 동일 상품 ID(또는 정확 레퍼런스)끼리만
        // 뒤집을 수 있다. 같은 브랜드의 다른 상품 remove가 이 상품의 add를
        // 취소하는 식의 교차상품 상태 오염을 금지한다.
        if (match < 0.9) return;
        var eventAt = timestamp(eventTime(event));
        if (!latestState[stateChannel] || eventAt >= latestState[stateChannel].at) {
          latestState[stateChannel] = {
            at: eventAt, type: type, weight: weight, magnitude: magnitude,
            match: match, days: days
          };
        }
        return;
      }
      var target = weight > 0 ? positiveByType : negativeByType;
      // Repeated identical actions do not accumulate without bound. Keep the
      // strongest decayed instance of each action type for this product.
      target[type] = Math.max(target[type] || 0, magnitude);
      if (weight > 0) {
        var short = Math.abs(weight) * match * Math.exp(-LN2 * days / 1);
        shortBest = Math.max(shortBest, short);
      }
    });
    // 찜/장바구니는 누적 감정이 아니라 현재 상태다. remove 뒤 re-add면
    // 과거 음수를 취소하고, add 뒤 remove면 최신 음수만 반영한다.
    Object.keys(latestState).forEach(function (channel) {
      var state = latestState[channel];
      var target = state.weight > 0 ? positiveByType : negativeByType;
      target[state.type] = state.magnitude;
      if (state.weight > 0) {
        shortBest = Math.max(shortBest,
          Math.abs(state.weight) * state.match * Math.exp(-LN2 * state.days / 1));
      }
    });
    var positiveRaw = Object.keys(positiveByType).reduce(function (sum, key) { return sum + positiveByType[key]; }, 0);
    var negativeRaw = Object.keys(negativeByType).reduce(function (sum, key) { return sum + negativeByType[key]; }, 0);
    return {
      positive: clamp(1 - Math.exp(-positiveRaw), 0, 1),
      negative: clamp(1 - Math.exp(-negativeRaw), 0, 1),
      short: clamp(shortBest, 0, 1),
      exposureFatigue: clamp(Math.max(0, impressions - 2) / 12, 0, 0.25),
      purchasedCooldown: purchasedCooldown,
      impressionCount7d: impressions
    };
  }

  function completeness(product) {
    var score = 0;
    if (product.id) score += 0.05;
    if (product.brand) score += 0.10;
    if (product.model) score += 0.10;
    if (product.price > 0) score += 0.13;
    if (product.photo) score += 0.14;
    if (product.photo_count >= 3) score += 0.06;
    if (product.reference_number) score += 0.08;
    if (product.condition) score += 0.08;
    if (product.color) score += 0.05;
    if (product.size) score += 0.05;
    if (product.material) score += 0.05;
    if (product.pack || product.accessories) score += 0.05;
    if (product.has_warranty) score += 0.03;
    if (product.description) score += 0.03;
    return clamp(score, 0, 1);
  }

  function budgetFit(price, min, max) {
    min = Number(min) || 0; max = Number(max) || 0; price = Number(price) || 0;
    if (!min && !max) return { score: 0.55, active: false };
    if (!price) return { score: 0.18, active: true };
    if ((!min || price >= min) && (!max || price <= max)) return { score: 1, active: true };
    var edge = price < min ? min : max;
    var distance = Math.abs(Math.log(price / Math.max(1, edge)));
    return { score: clamp(Math.exp(-2.8 * distance), 0.02, 0.92), active: true };
  }

  function valueFeature(product) {
    if (!(product.price > 0)) return 0.2;
    if (product.prev_price && product.prev_price > product.price) {
      return clamp(0.55 + ((product.prev_price - product.price) / product.prev_price) * 2, 0.55, 1);
    }
    return 0.5;
  }

  function noveltyFeature(product, now) {
    var days = ageDays(product.sale_started_at || product.created_at, now);
    if (!isFinite(days)) return 0.35;
    return clamp(Math.exp(-days / 90), 0.05, 1);
  }

  function explicitFeatures(product, profile) {
    var reference = exactCategoricalMatch(profile.references, product.reference_number);
    var model = arrayMatch(profile.models, product.model);
    var brand = exactCategoricalMatch(profile.brands, product.brand);
    var attrs = [];
    if (profile.condition) attrs.push(textMatch(profile.condition, product.condition));
    if (profile.color) attrs.push(textMatch(profile.color, product.color));
    if (profile.size) attrs.push(textMatch(String(profile.size), String(product.size)));
    var attribute = attrs.length ? attrs.reduce(function (sum, v) { return sum + v; }, 0) / attrs.length : 0;
    var combined = clamp(reference * 0.50 + model * 0.25 + brand * 0.18 + attribute * 0.07, 0, 1);
    return {
      reference: reference,
      model: model,
      brand: brand,
      attribute: attribute,
      relevance: Math.max(combined, reference, model * 0.88, brand * 0.68, attribute * 0.45)
    };
  }

  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

  function actionProxies(features) {
    var pos = features.behavior_positive;
    var neg = clamp(features.behavior_negative + features.exposure_fatigue, 0, 1);
    var rel = features.relevance;
    var budget = features.budget_fit;
    var complete = features.completeness;
    var intent = features.intent_index;
    var value = features.value;
    return {
      view: sigmoid(-1.45 + 2.20 * rel + 0.95 * pos + 0.42 * features.novelty + 0.35 * complete - 1.8 * neg),
      wishlist: sigmoid(-2.35 + 2.55 * rel + 1.45 * pos + 0.72 * budget + 0.30 * complete - 2.25 * neg),
      cart: sigmoid(-3.05 + 2.35 * rel + 1.80 * pos + 1.25 * budget + 0.72 * complete + 0.34 * value + 0.42 * intent - 2.65 * neg),
      purchase: sigmoid(-3.80 + 2.10 * rel + 1.90 * pos + 1.52 * budget + 1.00 * complete + 0.38 * value + 0.68 * intent - 2.95 * neg),
      negative: sigmoid(-3.10 + 3.15 * neg + 1.05 * (1 - budget) + 0.72 * (1 - complete))
    };
  }

  function candidateSources(explicit, interest, behavior, complete, novelty) {
    var out = ['catalog'];
    if (explicit.reference >= 0.8) out.push('profile_reference');
    else if (explicit.model >= 0.7) out.push('profile_model');
    else if (explicit.brand >= 0.7) out.push('profile_brand');
    if (interest.score >= 0.2) out.push('long_interest');
    if (behavior.short >= 0.1) out.push('short_session');
    else if (behavior.positive >= 0.1) out.push('behavior_history');
    if (complete >= 0.72 && novelty >= 0.25) out.push('discovery');
    return out;
  }

  function explain(features, sources) {
    var options = [];
    if (features.reference_match >= 0.8) options.push({ value: 1.00, text: '\uCC3E\uC73C\uC2E0 \uB808\uD37C\uB7F0\uC2A4\uC640 \uC77C\uCE58' });
    if (features.model_match >= 0.72) options.push({ value: 0.92, text: '\uAD00\uC2EC \uBAA8\uB378\uACFC \uC720\uC0AC' });
    if (features.brand_match >= 0.72) options.push({ value: 0.72, text: '\uAD00\uC2EC \uBE0C\uB79C\uB4DC\uC640 \uC77C\uCE58' });
    if (features.behavior_positive >= 0.30) options.push({ value: 0.82, text: '\uCD5C\uADFC \uAD00\uC2EC \uD589\uB3D9\uACFC \uAD00\uB828' });
    if (features.budget_active && features.budget_fit >= 0.86) options.push({ value: 0.78, text: '\uC608\uC0B0 \uBC94\uC704\uC5D0 \uC801\uD569' });
    if (features.value > 0.55) options.push({ value: 0.68, text: '\uAC00\uACA9 \uC778\uD558 \uD655\uC778' });
    if (features.attribute_match >= 0.55) options.push({ value: 0.62, text: '\uC120\uD638 \uC18D\uC131\uACFC \uC720\uC0AC' });
    if (features.completeness >= 0.78) options.push({ value: 0.50, text: '\uC0C1\uD488 \uC815\uBCF4\uAC00 \uBE44\uAD50\uC801 \uCD29\uC2E4' });
    options.sort(function (a, b) { return b.value - a.value; });
    var chosen = options.slice(0, 2).map(function (item) { return item.text; });
    if (!chosen.length) chosen.push('\uD310\uB9E4 \uAC00\uB2A5\uD55C \uC0C1\uD488 \uC911 \uC815\uBCF4\u00B7\uB2E4\uC591\uC131 \uAE30\uC900');
    return chosen;
  }

  function scoreProduct(productInput, context, options) {
    options = options || {};
    var config = context.config;
    var product = productInput.raw ? productInput : normalizeProduct(productInput, context.now);
    var explicit = explicitFeatures(product, context.profile);
    var interests = interestFeatures(product, context.interests, context.now, config);
    var behavior = eventFeatures(product, context.events, context.now, config);
    var budget = budgetFit(product.price, context.profile.budgetMin, context.profile.budgetMax);
    var complete = completeness(product);
    var value = valueFeature(product);
    var novelty = noveltyFeature(product, context.now);
    var positive = clamp(0.46 * behavior.positive + 0.22 * behavior.short + 0.32 * interests.score, 0, 1);
    var negative = clamp(behavior.negative + (behavior.purchasedCooldown ? 0.80 : 0), 0, 1);
    var features = {
      relevance: explicit.relevance,
      reference_match: explicit.reference,
      model_match: explicit.model,
      brand_match: explicit.brand,
      attribute_match: explicit.attribute,
      budget_fit: budget.score,
      budget_active: budget.active,
      behavior_positive: positive,
      behavior_negative: negative,
      short_intent: behavior.short,
      long_interest: interests.score,
      exposure_fatigue: behavior.exposureFatigue,
      completeness: complete,
      value: value,
      novelty: novelty,
      intent_index: context.profile.intentIndex
    };
    var proxies = actionProxies(features);
    // Inspired by multi-action ranking: weights apply only to bounded action
    // proxies, never directly to raw click/cart counts.
    var utility = 0.14 * proxies.view + 0.20 * proxies.wishlist +
      0.28 * proxies.cart + 0.38 * proxies.purchase - 0.24 * proxies.negative;
    utility += 0.055 * complete + 0.025 * novelty - behavior.exposureFatigue * 0.12;
    var score = clamp(utility * 100, 0, 100);
    var sources = candidateSources(explicit, interests, behavior, complete, novelty);
    var reasons = explain(features, sources);
    return {
      product: product,
      score: round(score, 1),
      base_score: round(score, 4),
      reason: reasons.join(' \u00B7 '),
      reason_codes: reasons,
      candidate_sources: sources,
      breakdown: {
        algorithm_version: VERSION,
        score_kind: 'heuristic_action_proxy',
        personalized: context.personalized,
        features: Object.keys(features).reduce(function (out, key) {
          out[key] = typeof features[key] === 'number' ? round(features[key], 4) : features[key];
          return out;
        }, {}),
        action_proxies: Object.keys(proxies).reduce(function (out, key) { out[key] = round(proxies[key], 4); return out; }, {})
      }
    };
  }

  function constraintMatch(product, constraints) {
    constraints = constraints || {};
    if (list(constraints.exclude_brands || constraints.exclude_brand).length &&
        exactCategoricalMatch(constraints.exclude_brands || constraints.exclude_brand, product.brand)) return 'query_excluded_brand';
    if (list(constraints.brands || constraints.brand).length &&
        !exactCategoricalMatch(constraints.brands || constraints.brand, product.brand)) return 'query_brand';
    if (list(constraints.models || constraints.model).length && !arrayMatch(constraints.models || constraints.model, product.model)) return 'query_model';
    var productNumbers = list(constraints.product_numbers || constraints.product_number);
    if (productNumbers.length && !productNumbers.some(function (value) {
      return text(value) === text(product.product_no);
    })) return 'query_product_number';
    var references = list(constraints.references || constraints.reference);
    if (references.length && !references.some(function (value) {
      return text(value) === text(product.reference_number);
    })) return 'query_reference';
    var min = Number(constraints.budget_min != null ? constraints.budget_min : constraints.min) || 0;
    var max = Number(constraints.budget_max != null ? constraints.budget_max : constraints.max) || 0;
    if ((min || max) && (!product.price || (min && product.price < min) || (max && product.price > max))) return 'query_budget';
    return '';
  }

  function eligibility(product, context, options) {
    var status = text(product.status);
    if (!product.id) return 'missing_id';
    if (REJECTED_STATUSES[product.status] || REJECTED_STATUSES[status]) return 'unavailable';
    if (context.excludeIds[product.id]) return 'excluded';
    var queryFailure = constraintMatch(product, options.hardConstraints);
    if (queryFailure) return queryFailure;
    var behavior = eventFeatures(product, context.events, context.now, context.config);
    if (behavior.purchasedCooldown) return 'purchased_cooldown';
    return '';
  }

  function similarity(a, b) {
    var score = 0;
    if (textMatch(a.brand, b.brand) >= 0.9) score += 0.55;
    score += 0.27 * textMatch(a.model, b.model);
    if (a.price > 0 && b.price > 0) {
      var ratio = Math.min(a.price, b.price) / Math.max(a.price, b.price);
      if (ratio >= 0.80) score += 0.13;
    }
    if (a.color && b.color && textMatch(a.color, b.color) >= 0.8) score += 0.05;
    return clamp(score, 0, 1);
  }

  function rerank(scored, context, options) {
    var limit = Math.max(1, Number(options.limit) || context.config.limit);
    var selected = [], remaining = scored.slice();
    var brandCounts = {};
    var onlyOneBrand = options.hardConstraints && list(options.hardConstraints.brands || options.hardConstraints.brand).length === 1;
    var brandCap = onlyOneBrand ? limit : Math.max(1, Number(options.brandCap) || context.config.brandCap);
    var explorationEvery = Math.max(0, Number(options.explorationEvery == null ? context.config.explorationEvery : options.explorationEvery));
    while (selected.length < limit && remaining.length) {
      var explore = explorationEvery > 0 && (selected.length + 1) % explorationEvery === 0;
      var candidates = remaining.filter(function (item) {
        var brand = text(item.product.brand) || '__unknown__';
        return (brandCounts[brand] || 0) < brandCap;
      });
      if (!candidates.length) candidates = remaining.slice();
      if (explore) candidates = candidates.slice(0, Math.min(context.config.explorationPool, candidates.length));
      var best = null, bestValue = -Infinity;
      candidates.forEach(function (item) {
        var maxSimilarity = selected.reduce(function (max, prior) {
          return Math.max(max, similarity(item.product, prior.product));
        }, 0);
        var discovery = item.breakdown.features.completeness * 0.70 + item.breakdown.features.novelty * 0.30;
        var relevance = item.base_score / 100;
        var value = explore
          ? relevance * 0.68 + discovery * 0.32 - maxSimilarity * context.config.diversityLambda
          : relevance - maxSimilarity * context.config.diversityLambda;
        value += hashUnit(context.tieSeed + '|' + item.product.id) * 0.000001;
        if (value > bestValue) { bestValue = value; best = item; }
      });
      if (!best) break;
      var diversityAdjustment = round((bestValue - best.base_score / 100) * 100, 4);
      best.breakdown.diversity = {
        exploration_slot: explore,
        adjustment: diversityAdjustment,
        brand_cap: brandCap
      };
      selected.push(best);
      var key = text(best.product.brand) || '__unknown__';
      brandCounts[key] = (brandCounts[key] || 0) + 1;
      remaining = remaining.filter(function (item) { return item !== best; });
    }
    return selected;
  }

  function mergeConfig(options) {
    options = options || {};
    var out = {};
    Object.keys(DEFAULTS).forEach(function (key) { out[key] = DEFAULTS[key]; });
    Object.keys(options.config || {}).forEach(function (key) { out[key] = options.config[key]; });
    out.eventHalfLifeDays = {};
    Object.keys(DEFAULTS.eventHalfLifeDays).forEach(function (key) { out.eventHalfLifeDays[key] = DEFAULTS.eventHalfLifeDays[key]; });
    Object.keys((options.config && options.config.eventHalfLifeDays) || {}).forEach(function (key) {
      out.eventHalfLifeDays[key] = options.config.eventHalfLifeDays[key];
    });
    return out;
  }

  function rank(options) {
    options = options || {};
    var config = mergeConfig(options);
    var now = timestamp(options.now) || Date.now();
    var suppliedProfile = profileContext(options.profile);
    var excludeIds = {};
    list(options.excludeIds).forEach(function (id) { excludeIds[String(id)] = 1; });
    var hasProfile = suppliedProfile.brands.length || suppliedProfile.models.length || suppliedProfile.references.length ||
      suppliedProfile.budgetMin || suppliedProfile.budgetMax || suppliedProfile.condition || suppliedProfile.color || suppliedProfile.size;
    var personalized = options.personalized !== false && !!(hasProfile || (options.interests || []).length || (options.events || []).length);
    // A caller may deliberately request a non-personal catalogue ranking while a
    // stale/cached profile object is still in memory. In that mode no profile
    // field may affect eligibility, score, reason, or candidate-source metadata.
    var profile = personalized ? suppliedProfile : profileContext({});
    profile.intentIndex = personalized
      ? effectiveIntentIndex(profile, options.events || [], now, config.purchaseReferenceCooldownDays)
      : 0;
    var context = {
      profile: profile,
      interests: personalized ? (options.interests || []) : [],
      events: personalized ? (options.events || []) : [],
      personalized: personalized,
      excludeIds: excludeIds,
      config: config,
      now: now,
      tieSeed: String(options.tieSeed || options.variant || 'stable') + '|' + VERSION
    };
    var filtered = {}, seen = {}, eligible = [];
    (options.products || []).forEach(function (row) {
      var product = normalizeProduct(row, now);
      var why = eligibility(product, context, options);
      if (!why && seen[product.id]) why = 'duplicate';
      if (why) { filtered[why] = (filtered[why] || 0) + 1; return; }
      seen[product.id] = 1;
      eligible.push(product);
    });
    var scored = eligible.map(function (product) { return scoreProduct(product, context, options); })
      .sort(function (a, b) {
        if (b.base_score !== a.base_score) return b.base_score - a.base_score;
        return hash32(context.tieSeed + '|' + a.product.id) - hash32(context.tieSeed + '|' + b.product.id);
      });
    var selected = rerank(scored, context, options).filter(function (item) {
      return !eligibility(item.product, context, options);
    });
    selected.forEach(function (item, index) {
      item.rank = index + 1;
      item.algorithm_version = VERSION;
      item.variant = String(options.variant || 'balanced_v1');
    });
    return {
      items: selected,
      audit: {
        algorithm_version: VERSION,
        score_kind: 'heuristic_action_proxy',
        personalized: personalized,
        input_count: (options.products || []).length,
        eligible_count: eligible.length,
        returned_count: selected.length,
        filtered: filtered,
        variant: String(options.variant || 'balanced_v1')
      }
    };
  }

  return {
    VERSION: VERSION,
    DEFAULTS: DEFAULTS,
    EVENT_WEIGHTS: EVENT_WEIGHTS,
    normalizeProduct: normalizeProduct,
    rank: rank,
    scoreProduct: scoreProduct,
    assignVariant: assignVariant,
    hash32: hash32,
    _internals: {
      textMatch: textMatch,
      budgetFit: budgetFit,
      decay: decay,
      completeness: completeness,
      eventFeatures: eventFeatures,
      effectiveIntentIndex: effectiveIntentIndex,
      similarity: similarity
    }
  };
});
