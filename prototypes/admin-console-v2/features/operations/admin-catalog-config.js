import { bool, dateTime, field, firstImage, money, stringArray } from './admin-operation-model.js?v=20260826-catalog-ledger-v3';

const OPERATION_BRANDS = Object.freeze([
  '롤렉스', '까르띠에', '오메가', '파텍필립', '오데마피게', '바쉐론콘스탄틴', 'IWC',
  '브라이틀링', '태그호이어', '위블로', '파네라이', '튜더', '론진', '미도', '오리스',
  '세이코', '해밀턴', '샤넬', '에르메스', '불가리', '피아제', '브레게', '블랑팡',
  '프랭크뮬러', '예거르쿨트르', '로저드뷔', '그랜드세이코', '리브토만', '몽블랑',
  '보메 메르시에', '부쉐러', '제니스', '제랄드 젠타', '코럼', '콩코드',
  'ROLEX', 'PATEK PHILIPPE', 'AUDEMARS PIGUET', 'FRANCK MULLER', 'VACHERON', '브랜드미상'
]);

function versioned(item, payload = {}) {
  return { ...payload, operation_version: item.operation_version };
}

function listingSaleState(item) {
  if (item.archived_at) return '보관';
  if (item.sold_order_id || item.status === 'sold') return '판매완료';
  if (item.reserved_order_id) return '결제예약';
  return item.sale_status === 'paused' || item.status === 'hidden' ? '판매중지' : '판매중';
}

function listingTone(item) {
  if (item.archived_at || item.approval_status === 'rejected') return 'danger';
  if (['draft', 'pending'].includes(item.approval_status) || !['available', 'reserved'].includes(item.inventory_status)) return 'attention';
  return listingSaleState(item) === '판매중' ? 'success' : 'normal';
}

function listingRaw(item) {
  return {
    ...item,
    sale_state: listingSaleState(item),
    sale_active: Array.isArray(item.tags) && item.tags.includes('sale') && !!item.sale_started_at,
    tags_text: Array.isArray(item.tags) ? item.tags.filter((tag) => tag !== 'sale').join('\n') : '',
    image_urls_text: (item.image_urls || []).join('\n'),
    display_channels_text: (item.display_channels || ['판매시계']).join('\n')
  };
}

export function catalogConfigs(service) {
  return {
    listings: {
      title: '판매시계 관리', description: '상품 승인부터 재고·가격·전시·보관 이력까지 한 상품 원장에서 관리합니다.', primaryAction: '상품 등록',
      columns: ['상품', '승인', '판매', '재고', '전시', '현재 가격', '예상 정산'],
      filters: [
        { name: 'approval_status', label: '승인', options: ['draft', 'pending', 'approved', 'rejected'] },
        { name: 'sale_state', label: '판매', options: ['판매중', '판매중지', '결제예약', '판매완료'] },
        { name: 'inspection_status', label: '검수', options: ['pending', 'in_progress', 'passed', 'rejected', 'legacy_waived'] },
        { name: 'inventory_status', label: '재고', options: ['expected', 'in_transit', 'available', 'reserved', 'shipping', 'sold', 'returned'] },
        { name: 'display_status', label: '전시', options: ['hidden', 'visible', 'scheduled'] },
        { name: 'archive_state', label: '보관', options: ['운영중', '보관'] }
      ],
      filter: (raw, values) => Object.entries(values).every(([name, value]) => {
        if (!value) return true;
        if (name === 'archive_state') return value === (raw.archived_at ? '보관' : '운영중');
        return String(raw[name] || '') === String(value);
      }),
      load: () => service.listListings(),
      row: (item) => {
        const raw = listingRaw(item);
        return {
          id: item.id, title: [item.title, item.description].filter(Boolean).join(' ') || '판매시계',
          sub: [item.product_no, item.reference_no].filter(Boolean).join(' · ') || '-', image: firstImage(item),
          cells: [item.approval_status || 'pending', raw.sale_state, item.inventory_status || 'expected',
            item.display_status || 'hidden', money(item.sale_price || item.price), money(item.expected_settlement)],
          status: listingTone(item), statusLabel: item.archived_at ? '보관' : (item.approval_status || 'pending'), raw
        };
      },
      loadDetail: (item) => service.loadListingDetail(item),
      fieldGroups: ['기본정보', '검수정보', '가격·수수료', '재고·물류', '전시·홈 노출', '이미지·상세정보', '변경 사유'],
      fields: () => [
        field('product_no', '상품번호 · 서버 자동 발급', 'text', { disabled: true, group: '기본정보' }),
        field('title', '브랜드', 'select', { options: OPERATION_BRANDS, required: true, group: '기본정보' }), field('description', '모델', 'text', { required: true, group: '기본정보' }),
        field('reference_no', '레퍼런스', 'text', { group: '기본정보' }), field('category', '상품 구분', 'select', { options: ['벨로르판매', '고객판매'], group: '기본정보' }),
        field('sale_method', '판매방식', 'select', { options: ['일반판매', '위탁판매', '즉시매입'], group: '기본정보' }),
        field('approval_status', '승인 상태', 'select', { options: ['draft', 'pending', 'approved', 'rejected'], disabled: true, group: '검수정보' }),
        field('inspection_status', '검수 상태', 'select', { options: ['pending', 'in_progress', 'passed', 'rejected', 'legacy_waived'], disabled: true, group: '검수정보' }),
        field('condition', '상태 점수', 'select', { options: ['중고 7/10', '중고 8/10', '중고 9/10'], group: '검수정보' }),
        field('condition_notes', '검수 근거', 'textarea', { group: '검수정보' }), field('stamping', '스탬핑', 'text', { group: '검수정보' }),
        field('purchase_year', '구매연도', 'text', { group: '검수정보' }), field('misu', '미리수', 'text', { group: '검수정보' }),
        field('movement', '무브먼트', 'text', { group: '검수정보' }), field('case_spec', '케이스 사양', 'text', { group: '검수정보' }),
        field('band_spec', '밴드 사양', 'text', { group: '검수정보' }), field('dial_color', '다이얼 색상', 'text', { group: '검수정보' }),
        field('material', '소재', 'text', { group: '검수정보' }), field('size_mm', '크기(mm)', 'number', { group: '검수정보' }),
        field('has_diamond', '다이아몬드 포함', 'checkbox', { group: '검수정보' }), field('has_warranty', '보증서 있음', 'checkbox', { group: '검수정보' }),
        field('price', '판매가', 'number', { min: 1, required: true, group: '가격·수수료' }), field('sale_price', '할인가', 'number', { min: 1, group: '가격·수수료' }),
        field('sale_active', '72시간 할인 적용', 'checkbox', { group: '가격·수수료' }), field('sale_started_at', '할인 시작일시', 'datetime-local', { group: '가격·수수료' }),
        field('commission_percent', '수수료율(%)', 'number', { group: '가격·수수료', step: '0.1', min: 0, max: 100 }),
        field('initial_price', '최초 판매가', 'number', { disabled: true, group: '가격·수수료' }),
        field('expected_settlement', '예상 정산금액', 'number', { disabled: true, group: '가격·수수료' }),
        field('inventory_status', '재고 상태', 'select', { options: ['expected', 'in_transit', 'available', 'shipping', 'returned'], group: '재고·물류' }),
        field('inventory_location', '현재 위치', 'text', { group: '재고·물류' }), field('custody_holder', '보관 담당', 'text', { group: '재고·물류' }),
        field('inventory_courier', '운송업체', 'text', { group: '재고·물류' }), field('inventory_tracking_no', '운송장번호', 'text', { group: '재고·물류' }),
        field('inventory_receiver', '수령인', 'text', { group: '재고·물류' }), field('inventory_received_at', '수령일시', 'datetime-local', { group: '재고·물류' }),
        field('sale_status', '판매 운영 상태', 'select', { options: ['draft', 'active', 'paused', 'completed'], disabled: true, group: '전시·홈 노출' }),
        field('display_status', '전시 상태', 'select', { options: ['hidden', 'visible', 'scheduled'], disabled: true, group: '전시·홈 노출' }),
        field('display_channels_text', '노출 화면 · 한 줄에 하나', 'textarea', { group: '전시·홈 노출' }),
        field('home_section', '홈 노출 영역', 'select', { options: ['', '이번 주 특별가', '기간 한정 특가', '최근 등록된 시계'], group: '전시·홈 노출' }),
        field('display_sort_order', '노출 순서', 'number', { group: '전시·홈 노출' }),
        field('display_start_at', '노출 시작일시', 'datetime-local', { group: '전시·홈 노출' }), field('display_end_at', '노출 종료일시', 'datetime-local', { group: '전시·홈 노출' }),
        field('pack', '구성품 요약', 'text', { group: '이미지·상세정보' }), field('set_grade', '구성품 등급', 'text', { group: '이미지·상세정보' }),
        field('components', '구성품 상세', 'textarea', { group: '이미지·상세정보' }), field('accessories', '부속품', 'textarea', { group: '이미지·상세정보' }),
        field('special_note', '특이사항', 'textarea', { group: '이미지·상세정보' }), field('ship_info', '배송 안내', 'textarea', { group: '이미지·상세정보' }),
        field('detail_desc', '상세설명', 'textarea', { group: '이미지·상세정보' }), field('tags_text', '운영 태그 · 한 줄에 하나', 'textarea', { group: '이미지·상세정보' }),
        field('image_urls_text', '현재 사진 · 삭제·순서 변경 가능', 'textarea', { group: '이미지·상세정보' }), field('photos', '새 상품 사진', 'file', { multiple: true, group: '이미지·상세정보' }),
        field('operation_version', '변경 버전', 'number', { disabled: true, group: '변경 사유' }),
        field('operation_reason', '가격·재고 변경 사유 · 5자 이상', 'textarea', { group: '변경 사유' })
      ],
      save: (item, values, files) => service.saveListing(item?.id, { ...values, operation_version: item?.operation_version }, files.photos || []),
      actions: [
        { id: 'inspection-start', label: '검수 시작', when: (item) => !item.archived_at && item.inspection_status === 'pending', reasonPrompt: '검수 시작 근거를 5자 이상 입력해 주세요.', run: (item, input) => service.manageListing(item.id, 'set_inspection', versioned(item, { status: 'in_progress' }), input.reason) },
        { id: 'inspection-pass', label: '검수 통과', when: (item) => !item.archived_at && !['passed', 'legacy_waived'].includes(item.inspection_status), reasonPrompt: '검수 통과 근거를 5자 이상 입력해 주세요.', run: (item, input) => service.manageListing(item.id, 'set_inspection', versioned(item, { status: 'passed' }), input.reason) },
        { id: 'inspection-reject', label: '검수 반려', danger: true, when: (item) => !item.archived_at && item.inspection_status !== 'rejected', reasonPrompt: '검수 반려 사유를 5자 이상 입력해 주세요.', run: (item, input) => service.manageListing(item.id, 'set_inspection', versioned(item, { status: 'rejected' }), input.reason) },
        { id: 'approve', label: '상품 승인', when: (item) => !item.archived_at && item.approval_status !== 'approved' && ['passed', 'legacy_waived'].includes(item.inspection_status), reasonPrompt: '승인 근거를 5자 이상 입력해 주세요.', run: (item, input) => service.manageListing(item.id, 'set_approval', versioned(item, { status: 'approved' }), input.reason) },
        { id: 'reject', label: '승인 반려', when: (item) => !item.archived_at && item.approval_status !== 'rejected', reasonPrompt: '반려 사유를 5자 이상 입력해 주세요.', run: (item, input) => service.manageListing(item.id, 'set_approval', versioned(item, { status: 'rejected' }), input.reason) },
        { id: 'sale-start', label: '판매 시작', when: (item) => !item.archived_at && item.sale_status !== 'active', reasonPrompt: '판매 시작 근거를 5자 이상 입력해 주세요.', run: (item, input) => service.manageListing(item.id, 'set_sale', versioned(item, { status: 'active' }), input.reason) },
        { id: 'sale-stop', label: '판매 중지', when: (item) => !item.archived_at && item.sale_status === 'active', reasonPrompt: '판매 중지 사유를 5자 이상 입력해 주세요.', run: (item, input) => service.manageListing(item.id, 'set_sale', versioned(item, { status: 'paused' }), input.reason) },
        { id: 'hide', label: '전시 숨김', when: (item) => !item.archived_at && item.display_status === 'visible', reasonPrompt: '숨김 사유를 5자 이상 입력해 주세요.', run: (item, input) => service.manageListing(item.id, 'set_visibility', versioned(item, { status: 'hidden' }), input.reason) },
        { id: 'publish', label: '전시 시작', when: (item) => !item.archived_at && item.display_status !== 'visible' && item.sale_status === 'active', reasonPrompt: '전시 시작 근거를 5자 이상 입력해 주세요.', run: (item, input) => service.manageListing(item.id, 'set_visibility', versioned(item, { status: 'visible' }), input.reason) },
        { id: 'archive', label: '상품 보관', danger: true, when: (item) => !item.archived_at, reasonPrompt: '보관 사유를 5자 이상 입력해 주세요.', confirm: '상품을 삭제하지 않고 보관 상태로 전환할까요?', run: (item, input) => service.manageListing(item.id, 'archive', versioned(item), input.reason) },
        { id: 'restore', label: '보관 해제', when: (item) => !!item.archived_at, reasonPrompt: '보관 해제 사유를 5자 이상 입력해 주세요.', run: (item, input) => service.manageListing(item.id, 'restore', versioned(item), input.reason) },
        { id: 'delete-draft', label: '초안 영구삭제', danger: true, when: (item) => ['draft', 'pending'].includes(item.approval_status), confirm: '주문·정산·경매 연결이 없는 초안만 영구삭제됩니다.', promptText: '영구삭제', reasonPrompt: '영구삭제 사유를 5자 이상 입력해 주세요.', run: (item, input) => service.manageListing(item.id, 'delete_draft', versioned(item), input.reason) }
      ]
    },
    banners: {
      title: '배너 관리', description: '홈·마이페이지 배너의 이미지·문구·연결·순서를 실제 데이터로 관리합니다.', primaryAction: '새 배너 만들기', columns: ['배너', '위치', '연결', '순서', '상태'],
      load: () => service.listBanners(),
      row: (item) => ({ id: item.id, title: item.title || '제목 없음', sub: item.subtitle || '-', image: firstImage(item), cells: [item.placement || 'home', item.link || '-', String(item.sort_order || 0), item.active === false ? '숨김' : '노출중'], status: item.active === false ? 'normal' : 'success', statusLabel: item.active === false ? '숨김' : '게시', raw: item }),
      fields: () => [field('title', '제목'), field('subtitle', '부제'), field('link', '연결 주소'), field('placement', '위치', 'select', { options: ['home', 'mypage'] }), field('sort_order', '노출 순서', 'number'), field('active', '노출', 'checkbox', { checked: true }), field('mobile', '모바일 이미지', 'file'), field('wide', '넓은 화면 이미지', 'file'), field('pc', '데스크톱 이미지', 'file')],
      save: (item, values, files) => service.saveBanner(item?.id, { ...values, active: bool(values.active), image_url: item?.image_url, image_wide: item?.image_wide, image_pc: item?.image_pc }, { mobile: files.mobile?.[0], wide: files.wide?.[0], pc: files.pc?.[0] }),
      actions: [
        { id: 'hide', label: '배너 숨김', when: (item) => item.active !== false, run: (item) => service.setBannerActive(item.id, false) },
        { id: 'publish', label: '배너 게시', when: (item) => item.active === false, run: (item) => service.setBannerActive(item.id, true) },
        { id: 'delete', label: '배너 삭제', danger: true, confirm: '이 배너를 삭제할까요?', promptText: '삭제', run: (item) => service.deleteBanner(item.id) }
      ]
    },
    coupons: {
      title: '쿠폰 관리', description: '쿠폰 유형·할인·사용조건·수량·만료·활성 상태를 관리합니다.', primaryAction: '새 쿠폰 만들기', columns: ['쿠폰', '유형', '혜택', '사용 조건', '상태'],
      load: () => service.listCoupons(),
      row: (item) => ({ id: item.id, title: item.title || '쿠폰', sub: item.code || item.kind || '-', cells: [item.discount_type || 'amount', item.discount_type === 'percent' ? `${item.discount_value}%` : money(item.discount_value), `${money(item.min_order)} 이상`, item.active === false ? '중지' : '사용중'], status: item.active === false ? 'normal' : 'success', statusLabel: item.active === false ? '중지' : '활성', raw: item }),
      fields: () => [field('title', '쿠폰 이름'), field('code', '쿠폰 코드'), field('kind', '유형', 'select', { options: ['code', 'download', 'auto'] }), field('discount_type', '할인 방식', 'select', { options: ['amount', 'percent'] }), field('discount_value', '할인값', 'number'), field('max_discount', '최대 할인액', 'number'), field('min_order', '최소 사용금액', 'number'), field('apply_to', '사용처', 'select', { options: ['both', 'purchase', 'commission'] }), field('usage_limit', '전체 발급 한도', 'number'), field('per_user_limit', '1인당 한도', 'number'), field('expires_at', '만료일시', 'datetime-local'), field('image_url', '쿠폰 이미지 주소'), field('downloadable', '다운로드 허용', 'checkbox'), field('auto_grant', '자동 지급', 'checkbox'), field('active', '사용중', 'checkbox', { checked: true })],
      save: (item, values) => service.saveCoupon(item?.id, { ...values, downloadable: bool(values.downloadable), auto_grant: bool(values.auto_grant), active: bool(values.active) }),
      actions: [
        { id: 'stop', label: '쿠폰 중지', when: (item) => item.active !== false, run: (item) => service.setCouponActive(item.id, false) },
        { id: 'resume', label: '쿠폰 재개', when: (item) => item.active === false, run: (item) => service.setCouponActive(item.id, true) },
        { id: 'delete', label: '쿠폰 삭제', danger: true, confirm: '발급 이력을 확인했습니다. 쿠폰을 삭제할까요?', promptText: '삭제', run: (item) => service.deleteCoupon(item.id) }
      ]
    },
    community: {
      title: '인사이트 · 후기', description: '인사이트와 매입 후기를 실제 콘텐츠 데이터에서 관리합니다.', primaryAction: '새 글 작성', columns: ['콘텐츠', '구분', '카테고리', '이미지', '최근 변경'],
      load: () => service.listCommunity(),
      row: (item) => ({ id: item.id, title: item.title || '제목 없음', sub: item.author_name || item.category || '-', image: firstImage(item), cells: [item.content_kind === 'review' ? '매입 후기' : '인사이트', item.category || `평점 ${item.rating || 5}`, `${item.image_urls?.length || (item.image_url ? 1 : 0)}장`, dateTime(item.updated_at || item.created_at)], status: 'success', statusLabel: '게시', raw: item }),
      fields: (item) => [field('content_kind', '콘텐츠 구분', 'select', { options: ['post', 'review'], disabled: !!item }), field('title', '제목'), field('category', '카테고리'), field('author_name', '작성자'), field('rating', '평점', 'number'), field('body', '본문', 'textarea'), field('photos', '사진', 'file', { multiple: true })],
      save: (item, values, files) => service.saveCommunity(item?.id, values.content_kind || item?.content_kind || 'post', { ...values, image_urls: item?.image_urls || [] }, files.photos || []),
      actions: [{ id: 'delete', label: '콘텐츠 삭제', danger: true, confirm: '이 콘텐츠를 삭제할까요?', promptText: '삭제', run: (item) => service.deleteCommunity(item.id, item.content_kind) }]
    },
    content: siteContentConfig(service, false),
    homeSettings: siteContentConfig(service, true)
  };
}

function savedProductIds(body) {
  try {
    const value = JSON.parse(body || '{}');
    const ids = Array.isArray(value) ? value : value.productIds;
    return Array.isArray(ids) ? [...new Set(ids.map(String).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

function siteContentConfig(service, homeOnly) {
  const homeDefaults = [
    { key: 'home_row_sale', title: '이번 주 특별가', subtitle: '이번 주, 가격이 좋아진 시계', body: '', images: [] },
    { key: 'home_row_drop', title: '기간 한정 특가', subtitle: '지금만 만나는 한정 혜택', body: '', images: [] },
    { key: 'home_row_new', title: '최근 등록된 시계', subtitle: '검수를 마치고 새로 들어온 시계', body: '', images: [] }
  ];
  return {
    title: homeOnly ? '홈 화면 관리' : '사이트 내용 관리',
    description: homeOnly ? '이번 주 특별가·기간 한정 특가·최근 등록 영역의 제목·설명·상품 선정을 운영 저장소에 반영합니다.' : '매입 안내와 벨로르 소개 등 사이트 문구와 이미지를 관리합니다.',
    primaryAction: homeOnly ? '' : '새 내용 만들기', columns: ['영역', '제목', '부제', '이미지', '최근 변경'],
    load: async () => {
      const rows = await service.listSiteContent();
      if (!homeOnly) return rows;
      const byKey = new Map(rows.map((row) => [row.key, row]));
      return homeDefaults.map((item) => {
        const row = { ...item, ...(byKey.get(item.key) || {}) };
        return { ...row, product_ids: savedProductIds(row.body).join('\n') };
      });
    },
    row: (item) => ({ id: item.key, title: item.title || item.key, sub: item.subtitle || '-', image: item.images?.[0] || '', cells: [item.title || '-', item.subtitle || '-', `${item.images?.length || 0}장`, dateTime(item.updated_at)], status: 'success', statusLabel: '저장됨', raw: item }),
    fields: (item) => [field('key', '저장 식별값', 'text', { disabled: !!item }), field('title', '제목'), field('subtitle', '설명'), ...(homeOnly ? [field('product_ids', '노출 상품번호 · 한 줄에 하나', 'textarea')] : [field('body', '본문', 'textarea')]), field('photos', '이미지', 'file', { multiple: true })],
    save: (item, values, files) => service.saveSiteContent(values.key || item.key, {
      ...values,
      ...(homeOnly ? { body: JSON.stringify({ productIds: stringArray(values.product_ids) }) } : {}),
      images: item?.images || []
    }, files.photos || []),
    actions: homeOnly ? [] : [{ id: 'delete', label: '내용 삭제', danger: true, confirm: '이 사이트 내용과 이미지를 목록에서 삭제할까요?', promptText: '삭제', run: (item) => service.deleteSiteContent(item.key) }]
  };
}
