const MYPAGE_KEYS = Object.freeze({
  customer: 'mypage_customer_config',
  vendor: 'mypage_vendor_config',
  admin: 'mypage_admin_config'
});
const HOME_LAYOUT_KEY = 'home_page_layout_config';

const CATALOG_ERROR_MESSAGES = Object.freeze({
  ADMIN_FORBIDDEN: '활성 상태의 승인된 관리자만 처리할 수 있습니다.',
  TITLE_REQUIRED: '브랜드를 선택해 주세요.',
  BRAND_CODE_REQUIRED: '등록되지 않은 브랜드입니다. 브랜드 코드 등록 후 다시 시도해 주세요.',
  PRICE_REQUIRED: '판매가격은 1원 이상 입력해 주세요.',
  BAD_SALE_PRICE: '특별가는 정상 판매가격보다 낮게 입력해 주세요.',
  BAD_COMMISSION_RATE: '수수료율은 0%부터 100% 사이로 입력해 주세요.',
  LISTING_CONTENT_REQUIRED: '상품 승인 전 판매가격과 상품 사진을 등록해 주세요.',
  INSPECTION_REQUIRED: '실물검수를 통과한 상품만 승인할 수 있습니다.',
  LISTING_NOT_READY: '승인·검수·재고·가격·사진 상태를 모두 확인해 주세요.',
  CHECKOUT_RESERVATION_ACTIVE: '결제가 진행 중인 상품은 현재 변경할 수 없습니다.',
  PAYMENT_OWNS_INVENTORY_STATE: '예약·판매완료 재고는 결제 처리에서만 변경됩니다.',
  SOLD_LISTING_LOCKED: '판매 완료 상품의 거래 정보는 수정할 수 없습니다.',
  VERSION_CONFLICT: '다른 관리자가 먼저 변경했습니다. 새로고침 후 다시 처리해 주세요.',
  LISTING_ARCHIVE_REQUIRED: '운영 이력이 있는 상품은 삭제 대신 보관해 주세요.',
  LISTING_HAS_LINKED_RECORDS: '주문·정산·경매 이력이 있어 영구삭제할 수 없습니다.',
  REASON_REQUIRED: '처리 사유를 5자 이상 입력해 주세요.',
  LISTING_NOT_FOUND: '상품을 찾을 수 없습니다.',
  LISTING_STATE_NOT_FOUND: '상품 운영 상태를 찾을 수 없습니다.',
  VERSION_REQUIRED: '변경 버전이 없습니다. 새로고침 후 다시 처리해 주세요.',
  BAD_INVENTORY_STATUS: '지원하지 않는 재고 상태입니다.',
  BAD_APPROVAL_STATUS: '지원하지 않는 승인 상태입니다.',
  BAD_INSPECTION_STATUS: '지원하지 않는 검수 상태입니다.',
  BAD_DISPLAY_STATUS: '지원하지 않는 전시 상태입니다.',
  BAD_SALE_STATUS: '지원하지 않는 판매 상태입니다.',
  BAD_ACTION: '지원하지 않는 상품 작업입니다.',
  PRODUCT_NO_SERVER_MANAGED: '상품번호는 서버에서만 관리합니다.',
  PRODUCT_NO_DAILY_LIMIT: '오늘 발급 가능한 상품번호 한도를 초과했습니다.',
  CATALOG_RPC_REQUIRED: '상품 변경은 관리자 상품 원장에서 처리해 주세요.',
  HOME_SALE_REQUIRED: '이번 주 특별가에는 유효한 할인가가 설정된 상품만 배치할 수 있습니다.',
  HOME_PRODUCT_NOT_READY: '승인·검수·재고·판매·전시 조건을 모두 충족한 상품만 홈에 배치할 수 있습니다.',
  HOME_SECTION_LIMIT: '홈 영역에는 상품을 최대 20개까지 배치할 수 있습니다.',
  DUPLICATE_HOME_PRODUCT: '같은 상품을 한 홈 영역에 두 번 배치할 수 없습니다.',
  BAD_HOME_SECTION: '지원하지 않는 홈 노출 영역입니다.'
});

async function catalogRpc(client, body, rpcName = 'admin_manage_listing') {
  try {
    return await client.rpc(rpcName, body);
  } catch (error) {
    const key = Object.keys(CATALOG_ERROR_MESSAGES).find((code) => String(error?.message || '').includes(code));
    if (!key) throw error;
    const localized = new Error(CATALOG_ERROR_MESSAGES[key]);
    localized.code = key;
    localized.cause = error;
    throw localized;
  }
}

function parseMypageContent(row) {
  if (!row?.body) return null;
  try {
    const value = JSON.parse(row.body);
    return value && typeof value === 'object' ? value : null;
  } catch (error) {
    console.warn(`마이페이지 설정 JSON을 읽지 못했습니다: ${row.key}`, error);
    return null;
  }
}

function parseJsonContent(row, label) {
  if (!row?.body) return null;
  try {
    const value = JSON.parse(row.body);
    return value && typeof value === 'object' ? value : null;
  } catch (error) {
    console.warn(`${label} 설정 JSON을 읽지 못했습니다.`, error);
    return null;
  }
}

async function uploadFiles(client, files, folder, max) {
  const selected = Array.from(files || []).slice(0, max);
  return Promise.all(selected.map((file) => client.upload(file, folder)));
}

export function createAdminCatalogService(client, operatorId) {
  async function listListings() {
    const [listings, states] = await Promise.all([
      client.list('listings', { select: '*', order: 'created_at.desc', limit: 500 }),
      client.list('listing_operational_state', { select: '*', order: 'updated_at.desc', limit: 500 })
    ]);
    const byListing = new Map((states || []).map((state) => [String(state.listing_id), state]));
    return (listings || []).map((listing) => {
      const state = byListing.get(String(listing.id)) || {};
      const paymentState = listing.sold_order_id || listing.status === 'sold' ? 'sold'
        : (listing.reserved_order_id || listing.status === 'reserved' ? 'reserved' : 'available');
      return {
        ...listing,
        approval_status: state.approval_status || 'approved',
        inspection_status: state.inspection_status || 'legacy_waived',
        sale_status: state.sale_status || (listing.status === 'hidden' ? 'paused' : 'active'),
        inventory_status: state.inventory_status || paymentState,
        display_status: state.display_status || (listing.status === 'on_sale' ? 'visible' : 'hidden'),
      commission_rate: Number(state.commission_rate || 0),
      commission_percent: Number(state.commission_rate || 0) * 100,
        expected_settlement: Number(state.expected_settlement ?? listing.sale_price ?? listing.price ?? 0),
        display_channels: state.display_channels || ['판매시계'],
        ...state
      };
    });
  }

  async function saveListing(id, values, files = []) {
    const uploaded = await uploadFiles(client, files, `${operatorId}/products`, 10);
    const existing = Array.isArray(values.image_urls)
      ? values.image_urls
      : String(values.image_urls_text || '').split('\n').map((value) => value.trim()).filter(Boolean);
    const images = [...existing, ...uploaded].slice(0, 10);
    const tags = String(values.tags_text || '').split('\n').map((value) => value.trim()).filter(Boolean);
    const displayChannels = String(values.display_channels_text || '판매시계').split('\n').map((value) => value.trim()).filter(Boolean);
    const payload = {
      title: values.title || null,
      description: values.description || null,
      reference_no: values.reference_no || null,
      price: Number(values.price) || null,
      sale_price: values.sale_price ? Number(values.sale_price) : null,
      sale_active: !!values.sale_active,
      sale_started_at: values.sale_started_at || null,
      category: values.category || '벨로르판매',
      condition: values.condition || null,
      pack: values.pack || null,
      set_grade: values.set_grade || null,
      size_mm: values.size_mm ? Number(values.size_mm) : null,
      movement: values.movement || null,
      case_spec: values.case_spec || null,
      band_spec: values.band_spec || null,
      stamping: values.stamping || null,
      components: values.components || null,
      condition_notes: values.condition_notes || null,
      dial_color: values.dial_color || null,
      material: values.material || null,
      has_diamond: !!values.has_diamond,
      has_warranty: !!values.has_warranty,
      accessories: values.accessories || null,
      misu: values.misu || null,
      purchase_year: values.purchase_year || null,
      special_note: values.special_note || null,
      ship_info: values.ship_info || null,
      sale_method: values.sale_method || null,
      detail_desc: values.detail_desc || null,
      tags,
      image_urls: images,
      commission_rate: values.commission_percent === '' ? 0 : Number(values.commission_percent || 0) / 100,
      inventory_status: values.inventory_status || 'expected',
      inventory_location: values.inventory_location || null,
      custody_holder: values.custody_holder || null,
      inventory_courier: values.inventory_courier || null,
      inventory_tracking_no: values.inventory_tracking_no || null,
      inventory_receiver: values.inventory_receiver || null,
      inventory_received_at: values.inventory_received_at || null,
      display_channels: displayChannels,
      home_section: values.home_section || null,
      display_sort_order: Number(values.display_sort_order || 0),
      display_start_at: values.display_start_at || null,
      display_end_at: values.display_end_at || null,
      operation_version: values.operation_version || null
    };
    return catalogRpc(client, {
      p_listing_id: id || null,
      p_action: 'save',
      p_payload: payload,
      p_reason: values.operation_reason || null
    });
  }

  function manageListing(id, action, payload = {}, reason = null) {
    return catalogRpc(client, {
      p_listing_id: id,
      p_action: action,
      p_payload: payload,
      p_reason: reason
    });
  }

  async function loadListingDetail(item) {
    const [events, priceVersions, inventoryMovements, displayAssignments] = await Promise.all([
      client.list('listing_operation_events', { select: '*', listing_id: `eq.${item.id}`, order: 'created_at.desc', limit: 100 }),
      client.list('listing_price_versions', { select: '*', listing_id: `eq.${item.id}`, order: 'effective_from.desc', limit: 100 }),
      client.list('listing_inventory_movements', { select: '*', listing_id: `eq.${item.id}`, order: 'created_at.desc', limit: 100 }),
      client.list('listing_display_assignments', { select: '*', listing_id: `eq.${item.id}`, order: 'sort_order.asc', limit: 100 })
    ]);
    return {
      operationEventsLoaded: true, operationEvents: events || [], priceVersions: priceVersions || [],
      inventoryMovements: inventoryMovements || [], displayAssignments: displayAssignments || []
    };
  }

  function listBanners() {
    return client.list('banners', { select: '*', order: 'sort_order.asc,created_at.asc', limit: 100 });
  }

  async function saveBanner(id, values, files = {}) {
    const [mobile, wide, pc] = await Promise.all([
      files.mobile ? client.upload(files.mobile, `${operatorId}/banners`) : null,
      files.wide ? client.upload(files.wide, `${operatorId}/banners`) : null,
      files.pc ? client.upload(files.pc, `${operatorId}/banners`) : null
    ]);
    const row = {
      title: values.title || null,
      subtitle: values.subtitle || null,
      image_url: mobile || values.image_url || null,
      image_wide: wide || values.image_wide || null,
      image_pc: pc || values.image_pc || null,
      link: values.link || null,
      placement: values.placement || 'home',
      sort_order: Number(values.sort_order) || 0,
      active: values.active !== false
    };
    return id ? client.update('banners', { id: `eq.${id}` }, row) : client.insert('banners', row);
  }

  function deleteBanner(id) {
    return client.remove('banners', { id: `eq.${id}` });
  }

  function setBannerActive(id, active) {
    return client.update('banners', { id: `eq.${id}` }, { active: !!active });
  }

  function listCoupons() {
    return client.list('coupons', { select: '*', order: 'created_at.desc', limit: 300 });
  }

  function saveCoupon(id, values) {
    const row = {
      code: values.code ? String(values.code).toUpperCase().trim() : null,
      title: values.title,
      discount_type: values.discount_type || 'amount',
      discount_value: Number(values.discount_value) || 0,
      max_discount: values.max_discount ? Number(values.max_discount) : null,
      min_order: Number(values.min_order) || 0,
      apply_to: values.apply_to || 'both',
      downloadable: !!values.downloadable,
      usage_limit: values.usage_limit ? Number(values.usage_limit) : null,
      per_user_limit: Number(values.per_user_limit) || 1,
      expires_at: values.expires_at || null,
      active: values.active !== false,
      kind: values.kind || 'code',
      image_url: values.image_url || null,
      auto_grant: !!values.auto_grant
    };
    return id ? client.update('coupons', { id: `eq.${id}` }, row) : client.insert('coupons', row);
  }

  function deleteCoupon(id) {
    return client.remove('coupons', { id: `eq.${id}` });
  }

  function setCouponActive(id, active) {
    return client.update('coupons', { id: `eq.${id}` }, { active: !!active });
  }

  async function listCommunity() {
    const [posts, reviews] = await Promise.all([
      client.list('community_posts', { select: '*', order: 'created_at.desc', limit: 300 }),
      client.list('reviews', { select: '*', order: 'created_at.desc', limit: 300 })
    ]);
    return [
      ...posts.map((row) => ({ ...row, content_kind: 'post' })),
      ...reviews.map((row) => ({ ...row, content_kind: 'review' }))
    ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }

  async function saveCommunity(id, kind, values, files = []) {
    const max = kind === 'review' ? 10 : 5;
    const uploaded = await uploadFiles(client, files, `${operatorId}/content`, max);
    const imageUrls = [...(values.image_urls || []), ...uploaded].slice(0, max);
    const table = kind === 'review' ? 'reviews' : 'community_posts';
    const row = kind === 'review' ? {
      author_name: values.author_name || '익명', rating: Number(values.rating) || 5,
      title: values.title, body: values.body || null, image_urls: imageUrls
    } : {
      author_id: values.author_id || operatorId, title: values.title, body: values.body || null,
      category: values.category || '공지사항', image_url: imageUrls[0] || null, image_urls: imageUrls
    };
    return id ? client.update(table, { id: `eq.${id}` }, row) : client.insert(table, row);
  }

  function deleteCommunity(id, kind) {
    return client.remove(kind === 'review' ? 'reviews' : 'community_posts', { id: `eq.${id}` });
  }

  function listSiteContent() {
    return client.list('site_content', { select: '*', order: 'updated_at.desc', limit: 100 });
  }

  async function saveSiteContent(key, values, files = []) {
    if (['home_row_sale', 'home_row_drop', 'home_row_new'].includes(key)) {
      let parsed = {};
      try { parsed = JSON.parse(values.body || '{}'); } catch { parsed = {}; }
      const productIds = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.productIds) ? parsed.productIds : []);
      return catalogRpc(client, {
        p_key: key, p_title: values.title || '', p_subtitle: values.subtitle || '', p_listing_ids: productIds
      }, 'admin_set_catalog_home_section');
    }
    const uploaded = await uploadFiles(client, files, `${operatorId}/site-content`, 12);
    return client.upsert('site_content', {
      key,
      title: values.title || '', subtitle: values.subtitle || '', body: values.body || '',
      images: [...(values.images || []), ...uploaded].slice(0, 12), updated_at: new Date().toISOString()
    });
  }

  function deleteSiteContent(key) {
    return client.remove('site_content', { key: `eq.${key}` });
  }

  async function loadMypageConfigs() {
    const keys = Object.values(MYPAGE_KEYS);
    const rows = await client.list('site_content', {
      select: '*', key: `in.(${keys.join(',')})`, order: 'updated_at.desc'
    });
    return Object.fromEntries(Object.entries(MYPAGE_KEYS).map(([role, key]) => {
      const row = (rows || []).find((item) => item.key === key);
      return [role, parseMypageContent(row)];
    }));
  }

  function saveMypageConfig(role, content) {
    const key = MYPAGE_KEYS[role];
    if (!key) throw new Error('지원하지 않는 마이페이지 역할입니다.');
    const safeContent = JSON.parse(JSON.stringify(content || {}));
    if (role === 'admin') {
      delete safeContent.menuGroups;
      delete safeContent.blockOrder;
      delete safeContent.order;
    }
    return saveSiteContent(key, {
      title: `${safeContent.label || role} 마이페이지 설정`,
      subtitle: '관리자 콘솔에서 저장한 운영 화면 설정',
      body: JSON.stringify(safeContent),
      images: []
    });
  }

  async function loadHomePageConfig() {
    const rows = await client.list('site_content', {
      select: '*', key: `eq.${HOME_LAYOUT_KEY}`, limit: 1
    });
    return parseJsonContent((rows || [])[0], '홈 화면');
  }

  function saveHomePageConfig(content) {
    return saveSiteContent(HOME_LAYOUT_KEY, {
      title: '홈 화면 블록 설정',
      subtitle: '관리자 콘솔에서 저장한 운영 홈 화면 설정',
      body: JSON.stringify(content),
      images: []
    });
  }

  return {
    listListings, saveListing, manageListing, loadListingDetail, listBanners, saveBanner, deleteBanner,
    setBannerActive, listCoupons, saveCoupon, deleteCoupon, setCouponActive,
    listCommunity, saveCommunity, deleteCommunity, listSiteContent, saveSiteContent,
    deleteSiteContent, loadMypageConfigs, saveMypageConfig, loadHomePageConfig, saveHomePageConfig
  };
}
