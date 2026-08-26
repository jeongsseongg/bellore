/* 판매 상품 목록의 외부 경계. 백엔드(NWBackend)와 레거시 전역을 여기서만 만진다.
   기능 모듈은 이 서비스가 돌려주는 평범한 객체만 본다. */

import { effectiveListingStatus } from '../../core/listing-display.js?v=20260826-hero-edge-v3';

export function createListingCatalog({ window: win }) {
  function saleActive(row) {
    const check = win.belloreSaleActive;
    return typeof check === 'function' ? !!check(row) : false;
  }

  function brandLabel(brand) {
    const toEnglish = win.BELLORE_BRAND_EN;
    return (typeof toEnglish === 'function' ? toEnglish(brand) : brand) || '';
  }

  function toListing(row) {
    const price = Number.parseInt(row.price, 10) || 0;
    const salePrice = Number.parseInt(row.sale_price, 10) || 0;
    const onSale = salePrice > 0 && salePrice < price;
    return {
      id: row.id,
      image: (row.photos && row.photos[0]) || '',
      photos: Array.isArray(row.photos) ? row.photos.filter(Boolean) : [],
      brand: brandLabel(row.brand),
      model: String(row.model || '').replace(/^\s*\[?중고\]?\s*/i, '').trim(),
      referenceNumber: row.reference_number || row.reference_no || row.ref_id || '',
      movement: row.movement || '',
      productNo: row.product_no || '',
      sizeMm: row.size_mm || '',
      pack: row.pack || row.accessories || '',
      accessories: row.accessories || '',
      components: row.components || '',
      setGrade: row.set_grade || '',
      hasWarranty: row.has_warranty,
      condition: row.condition || '',
      status: effectiveListingStatus(row),
      dialColor: row.dial_color || '',
      material: row.material || '',
      createdAt: row.created_at || null,
      listPrice: price,
      price: onSale && saleActive(row) ? salePrice : price,
      priceLowered: onSale,
      saleActive: onSale && saleActive(row),
      isNew: /미착용|신품/.test(String(row.condition || '')) || (row.tags || []).indexOf('new') !== -1,
    };
  }

  return {
    /* 구독 성공 여부를 돌려준다. 백엔드가 아직 없으면 false. */
    subscribe(handler) {
      const backend = win.NWBackend;
      if (!backend || typeof backend.subscribeProducts !== 'function') return false;
      const start = () => backend.subscribeProducts((rows) => {
        handler((rows || []).map(toListing).filter((item) => item.id && item.image && item.price));
      });
      if (backend.ready && typeof backend.ready.then === 'function') backend.ready.then(start, () => {});
      else start();
      return true;
    },
  };
}
