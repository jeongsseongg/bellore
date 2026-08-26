const CONTEXTS = new Set(['payment_start', 'confirmation', 'upload', 'auth', 'identity', 'general']);

const AUTH_EXPIRED_PATTERN = /\b(?:jwt|access[ _-]?token|refresh[ _-]?token|session)\b[\s\S]{0,40}\b(?:expired|invalid|missing)\b|\b(?:token|session)[ _-]?(?:expired|invalid)\b|세션[\s\S]{0,20}만료/i;
const ACCESS_PATTERN = /\b(?:unauthori[sz]ed|forbidden|permission denied|permission_denied|access denied|access_denied|channel authorization denied|not authenticated|authentication required|insufficient[_ -]privilege)\b|row[ -]?level security|\brls\b|\bsqlstate\s*42501\b|\b42501\b|\b(?:http(?: status)?|status(?: code)?|response)[\s:=#-]*(?:401|403)\b|접근[\s\S]{0,12}권한(?:이)?\s*(?:없|거부)|권한(?:이)?\s*(?:없|거부)|인증되지\s*않|로그인(?:이)?\s*필요/i;
const NETWORK_PATTERN = /failed to fetch|network(?: error)?|load failed|offline|connection (?:failed|lost|refused|reset)|timed?\s*out|timeout|net::err_|\b(?:http(?: status)?|status(?: code)?|response)[\s:=#-]*(?:502|503|504)\b|네트워크[\s\S]{0,20}(?:오류|연결)|연결[\s\S]{0,20}(?:실패|끊)/i;
const DATABASE_PATTERN = /\bpostgrest\b|\bpgrst\d*\b|\bpostgres(?:ql)?\b|\bsqlstate\b|\bpg::|\brpc\b|schema cache|remote procedure|duplicate key value|unique constraint|null value in column|not-null constraint|invalid input syntax for type|value too long for type|json object requested|multiple \(or no\) rows returned|violates (?:check|foreign key|unique|not-null) constraint|relation ["'\w.]+ does not exist|column ["'\w.]+ does not exist|function ["'\w.() ,]+ does not exist|\b(?:22|23|24|25|28|40|42|53|54|55|57|58|xx)\d{3}\b|\b\w+\.sql\b|\bsql\b[\s\S]{0,20}\b(?:error|exception|failed|syntax|실행)\b/i;
const SERVER_PATTERN = /internal server error|server error|service unavailable|bad gateway|edge function|functions?[_ -](?:http|relay|fetch)|stack trace|\bat [\w$.<>]+\s*\(|\bdeno\b|\bsupabase\b[\s\S]{0,30}\b(?:error|failed)\b|\b(?:http(?: status)?|status(?: code)?|response)[\s:=#-]*(?:500|501)\b/i;
const SANDBOX_PATTERN = /sandbox(?:ed)?|test[ _-]?mode|test[ _-]?channel|mock[ _-]?(?:payment|server)|development only|샌드박스|테스트[ -]?(?:모드|채널|서버)/i;
const DEVELOPER_COPY_PATTERN = /(?:^|[\s:(])(?:pg|api|rpc|rls)(?:$|[\s:),])|supabase|edge function|백엔드|서버[\s]*(?:연결|오류|검증|응답|결제)|운영[\s]*채널|환경[\s]*설정|관리자[\s]*:/i;
const AUTH_PROVIDER_PATTERN = /\bAuthApiError\b|invalid login credentials|invalid jwt|user already registered|user not found|email not confirmed|email rate limit exceeded|invalid refresh token|auth session missing/i;
const STORAGE_PATTERN = /bucket not found|storage(?: api)? error|object not found in bucket|invalid storage|storage_unknown|the resource already exists|storage[\s\S]{0,30}(?:버킷|정책|photos)|버킷[\s\S]{0,30}(?:정책|업로드|photos)/i;
const INTERNAL_CODE_PATTERN = /(?:^|[\s:(\[])[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,}(?=[\s),.:\]]|$)|\b(?:TypeError|ReferenceError|SyntaxError|FetchError)\b|cannot read properties|failed to execute|the operation was aborted|unexpected token|\[object Object\]|\{\s*["']?(?:error|code|message)["']?\s*:/i;
const CONCATENATED_ERROR_PATTERN = /(?:실패|오류|에러)\s*[:：]\s*[^\n]*[A-Za-z_[{]/i;
const KOREAN_PATTERN = /[ㄱ-ㆎ가-힣]/;

const CONTEXT_COPY = Object.freeze({
  payment_start: Object.freeze({
    session_expired: '로그인 정보가 만료되었습니다. 다시 로그인한 뒤 결제를 진행해 주세요.',
    network: '네트워크 연결을 확인해 주세요. 결제는 진행되지 않았으며, 연결 후 다시 시도할 수 있습니다.',
    fallback: '결제를 준비하는 중 문제가 발생했습니다. 결제는 진행되지 않았습니다. 잠시 후 다시 시도해 주세요.',
  }),
  confirmation: Object.freeze({
    session_expired: '결제 승인 결과를 확인하지 못했습니다. 중복 결제하지 말고 고객센터로 문의해 주세요.',
    network: '결제 승인 결과를 확인하지 못했습니다. 중복 결제하지 말고 잠시 후 다시 확인해 주세요.',
    fallback: '결제 승인 상태를 확인하지 못했습니다. 중복 결제하지 말고 고객센터로 문의해 주세요.',
  }),
  upload: Object.freeze({
    session_expired: '로그인 정보가 만료되었습니다. 다시 로그인한 뒤 사진을 올려 주세요.',
    network: '네트워크 연결을 확인한 뒤 사진을 다시 올려 주세요.',
    fallback: '사진을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  }),
  auth: Object.freeze({
    session_expired: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.',
    network: '네트워크 연결을 확인한 뒤 로그인을 다시 시도해 주세요.',
    fallback: '로그인하지 못했습니다. 입력한 정보를 확인한 뒤 다시 시도해 주세요.',
  }),
  identity: Object.freeze({
    session_expired: '본인인증을 완료하지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.',
    network: '네트워크 연결을 확인한 뒤 본인인증을 다시 시도해 주세요.',
    fallback: '본인인증을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  }),
  general: Object.freeze({
    session_expired: '로그인 정보가 만료되었습니다. 다시 로그인해 주세요.',
    network: '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
    fallback: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  }),
});

const PAYMENT_START_CODE_COPY = Object.freeze({
  checkout_temporarily_unavailable: '안전한 결제 준비를 위해 잠시 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  checkout_recovery_unavailable: '안전한 결제 정보를 저장할 수 없어 결제를 시작하지 않았습니다. 브라우저 저장 기능을 확인한 뒤 다시 시도해 주세요.',
  checkout_request_changed: '이전에 준비하던 결제와 현재 입력 내용이 다릅니다. 결제는 진행되지 않았습니다. 입력한 상품·쿠폰·배송 정보를 다시 확인해 주세요.',
  checkout_request_conflict: '이전에 준비한 결제 상태를 확인하고 있습니다. 다시 결제하지 말고 잠시 후 결제 내역을 확인해 주세요.',
  listing_reserved: '현재 구매가 진행 중인 상품입니다. 구매가 취소되면 다시 구매할 수 있습니다.',
  listing_unavailable: '현재 구매할 수 없는 상품입니다. 상품 상태를 다시 확인해 주세요.',
  listing_not_found: '상품 정보를 찾지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.',
  coupon_invalid: '선택한 쿠폰을 사용할 수 없습니다. 쿠폰을 해제하거나 다른 쿠폰을 선택해 주세요.',
  coupon_reserved: '선택한 쿠폰으로 진행 중인 결제가 있습니다. 이전 결제를 마친 뒤 다시 시도하거나 다른 쿠폰을 선택해 주세요.',
  guest_coupon_not_allowed: '쿠폰은 로그인 후 사용할 수 있습니다. 로그인하거나 쿠폰을 해제해 주세요.',
  checkout_shipping_required: '받는 분과 배송 주소를 모두 입력해 주세요.',
  checkout_amount_changed: '상품 가격이나 쿠폰 할인이 변경되었습니다. 화면을 새로고침하고 쿠폰을 다시 선택한 뒤 결제를 다시 시도해 주세요.',
  checkout_amount_too_small: '결제금액은 100원 이상이어야 합니다. 쿠폰과 상품 가격을 확인해 주세요.',
  checkout_rate_limited: '결제 요청이 여러 번 반복되어 잠시 제한되었습니다. 15분 후 다시 시도해 주세요.',
  listing_price_invalid: '상품 가격을 다시 확인하고 결제를 진행해 주세요.',
});

const PAYMENT_CONFIRMATION_CODE_COPY = Object.freeze({
  payment_confirmation_pending: '결제 승인 상태를 확인하고 있습니다. 다시 결제하지 말고 주문번호로 고객센터에 문의해 주세요.',
  payment_confirmation_response_invalid: '결제 승인 상태를 확인하지 못했습니다. 다시 결제하지 말고 고객센터로 문의해 주세요.',
  payment_canceled: '결제를 취소했습니다. 결제는 진행되지 않았습니다.',
  payment_declined: '결제가 승인되지 않았습니다. 결제 정보를 확인한 뒤 다시 시도해 주세요.',
  payment_automatically_refunded: '결제 직후 상품 또는 할인 상태가 바뀌어 결제가 자동 취소되었습니다. 카드사 환불 반영까지 시간이 걸릴 수 있습니다.',
  payment_refund_in_progress: '결제 직후 상품 또는 할인 상태가 바뀌어 결제 취소를 진행하고 있습니다. 중복 결제하지 말고 고객센터로 문의해 주세요.',
  payment_refund_pending: '결제 취소를 진행하고 있습니다. 중복 결제하지 말고 잠시 후 결제 내역을 확인해 주세요.',
  payment_refunded: '결제가 취소되어 환불 처리되었습니다. 카드사 반영까지 시간이 걸릴 수 있습니다.',
});

const IDENTITY_CODE_COPY = Object.freeze({
  unauthorized: '이메일 인증이 만료되었습니다. 이메일 인증부터 다시 진행해 주세요.',
  not_logged_in: '이메일 인증을 먼저 완료해 주세요.',
  not_configured: '현재 본인인증 연결을 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  provider_lookup_failed: '인증기관의 완료 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  not_verified: '인증 완료 상태가 확인되지 않았습니다. 인증창을 끝까지 완료한 뒤 다시 시도해 주세요.',
  identity_already_used: '이미 다른 계정에서 사용한 본인인증입니다. 본인 계정으로 다시 확인해 주세요.',
  store_mismatch: '현재 본인인증 연결을 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  channel_mismatch: '현재 본인인증 연결을 점검 중입니다. 잠시 후 다시 시도해 주세요.',
  channel_not_live: '현재 본인인증 연결을 점검 중입니다. 잠시 후 다시 시도해 주세요.',
});

function contextName(contextOrOptions) {
  const requested = typeof contextOrOptions === 'string'
    ? contextOrOptions
    : contextOrOptions?.context;
  return CONTEXTS.has(requested) ? requested : 'general';
}

function scalarText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function exactErrorCode(value) {
  if (!value || typeof value !== 'object') return scalarText(value).toLowerCase();
  return (scalarText(value.code) || scalarText(value.message) || scalarText(value.error)).toLowerCase();
}

function errorTexts(value) {
  const direct = scalarText(value);
  if (direct) return [direct];
  if (!value || typeof value !== 'object') return [];

  const fields = ['name', 'code', 'message', 'error', 'details', 'hint', 'reason', 'status', 'statusCode', 'type'];
  const texts = [];
  for (const field of fields) {
    const fieldValue = value[field];
    const text = scalarText(fieldValue);
    if (text) texts.push(text);
    else if (fieldValue && typeof fieldValue === 'object') {
      const nested = scalarText(fieldValue.message) || scalarText(fieldValue.code);
      if (nested) texts.push(nested);
    }
  }
  return [...new Set(texts)];
}

function classify(text) {
  if (AUTH_EXPIRED_PATTERN.test(text)) return 'session_expired';
  if (ACCESS_PATTERN.test(text)) return 'access_error';
  if (NETWORK_PATTERN.test(text)) return 'network';
  if (SANDBOX_PATTERN.test(text)) return 'sandbox_error';
  if (DATABASE_PATTERN.test(text)) return 'database_error';
  if (SERVER_PATTERN.test(text)) return 'server_error';
  if (AUTH_PROVIDER_PATTERN.test(text)) return 'auth_error';
  if (STORAGE_PATTERN.test(text)) return 'storage_error';
  if (DEVELOPER_COPY_PATTERN.test(text)) return 'developer_copy';
  if (INTERNAL_CODE_PATTERN.test(text)) return 'internal_error';
  if (CONCATENATED_ERROR_PATTERN.test(text)) return 'internal_error';
  return '';
}

function safeCustomerText(text) {
  if (!text || text.length > 300 || !KOREAN_PATTERN.test(text)) return false;
  return !classify(text);
}

function copyFor(context, classification) {
  const copies = CONTEXT_COPY[context];
  if (classification === 'session_expired') return copies.session_expired;
  if (classification === 'network') return copies.network;
  return copies.fallback;
}

export function customerFeedback(value, contextOrOptions = 'general') {
  const context = contextName(contextOrOptions);
  const exactCode = exactErrorCode(value);
  if (context === 'payment_start' && PAYMENT_START_CODE_COPY[exactCode]) {
    return Object.freeze({
      classification: `payment_${exactCode}`,
      context,
      message: PAYMENT_START_CODE_COPY[exactCode],
    });
  }
  if (context === 'confirmation' && PAYMENT_CONFIRMATION_CODE_COPY[exactCode]) {
    return Object.freeze({
      classification: exactCode,
      context,
      message: PAYMENT_CONFIRMATION_CODE_COPY[exactCode],
    });
  }
  if (context === 'identity' && IDENTITY_CODE_COPY[exactCode]) {
    return Object.freeze({
      classification: `identity_${exactCode}`,
      context,
      message: IDENTITY_CODE_COPY[exactCode],
    });
  }
  const texts = errorTexts(value);
  const combined = texts.join(' ');
  const classification = classify(combined);

  const authoredText = typeof value === 'string' || typeof value === 'number';
  if (!classification && authoredText) {
    const customerText = texts.find(safeCustomerText);
    if (customerText) {
      return Object.freeze({ classification: 'safe_customer_message', context, message: customerText });
    }
  }

  const resolvedClassification = classification || 'unknown_error';
  return Object.freeze({
    classification: resolvedClassification,
    context,
    message: copyFor(context, resolvedClassification),
  });
}

const PROVIDER_CANCEL_CODES = new Set([
  'FAILURE_TYPE_USER',
  'PAY_PROCESS_CANCEL',
]);
const PROVIDER_DECLINE_CODES = new Set([
  'CARD_DECLINED',
  'CARD_DENIED',
  'FAILURE_TYPE_PG',
  'PAYMENT_DENIED',
]);

export function paymentProviderCustomerFeedback(value) {
  const text = errorTexts(value).join(' ');
  const explicitCode = value && typeof value === 'object'
    ? scalarText(value.code).trim().toUpperCase()
    : '';
  if (PROVIDER_CANCEL_CODES.has(explicitCode)) {
    return Object.freeze({
      classification: 'payment_provider_canceled',
      message: '결제를 취소했습니다. 결제는 진행되지 않았습니다.',
    });
  }
  const technicalClassification = classify(text);
  if (['access_error', 'database_error', 'server_error', 'sandbox_error', 'developer_copy', 'auth_error', 'storage_error'].includes(technicalClassification)) {
    return Object.freeze({
      classification: 'payment_provider_unverified',
      message: '결제 결과를 확인하지 못했습니다. 중복 결제하지 말고 고객센터로 문의해 주세요.',
    });
  }
  if (PROVIDER_DECLINE_CODES.has(explicitCode)) {
    return Object.freeze({
      classification: 'payment_provider_declined',
      message: '결제가 승인되지 않았습니다. 결제 정보를 확인한 뒤 다시 시도해 주세요.',
    });
  }
  return Object.freeze({
    classification: 'payment_provider_unverified',
    message: '결제 결과를 확인하지 못했습니다. 중복 결제하지 말고 고객센터로 문의해 주세요.',
  });
}

export function customerMessage(value, contextOrOptions = 'general') {
  return customerFeedback(value, contextOrOptions).message;
}
