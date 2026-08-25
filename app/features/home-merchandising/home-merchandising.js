/* 홈 진열 순서만 결정한다. 개인 행동·프로필은 읽지 않고 현재 판매 가능 재고를
   Bellore Intent & Trust Rank v2의 비개인화 품질·다양성 규칙으로 정렬한다. */

const RECOMMENDED_LIMIT = 12;
const WEEKLY_LIMIT = 8;

function engineInput(listing) {
  return {
    id: listing.id,
    brand: listing.brand,
    model: listing.model,
    reference_number: listing.referenceNumber || '',
    product_no: listing.productNo || '',
    price: listing.price,
    prev_price: listing.listPrice > listing.price ? listing.listPrice : null,
    status: 'on_sale',
    condition: listing.condition || '',
    color: listing.dialColor || '',
    size: listing.sizeMm || '',
    material: listing.material || '',
    pack: listing.pack || '',
    has_warranty: listing.hasWarranty === true,
    image: listing.image,
    photos: listing.photos || (listing.image ? [listing.image] : []),
    created_at: listing.createdAt || null,
  };
}

function stableFallback(listings, limit) {
  return listings.slice(0, limit);
}

export function createHomeMerchandising({ window: win }) {
  function rank(listings, { limit, surface }) {
    const candidates = listings.filter((item) => item && item.id && item.image && item.price > 0);
    const engine = win.BelloreRecommendationEngine;
    if (!engine || typeof engine.rank !== 'function') {
      console.error('[Bellore Home] recommendation engine unavailable:', surface);
      return {
        items: stableFallback(candidates, limit),
        audit: { algorithm_version: 'fallback-latest', surface, engine_available: false },
      };
    }

    const result = engine.rank({
      products: candidates.map(engineInput),
      personalized: false,
      limit,
      tieSeed: `home|${surface}`,
      variant: `home_${surface}_v1`,
    });
    const byId = new Map(candidates.map((item) => [String(item.id), item]));
    return {
      items: result.items.map((entry) => byId.get(String(entry.product.id))).filter(Boolean),
      audit: { ...result.audit, surface, engine_available: true },
    };
  }

  return {
    update(listings) {
      const current = listings || [];
      const activeSale = current.filter((item) => item.saleActive);
      const weeklyPool = activeSale.length ? activeSale : current;
      const weeklySpecial = rank(weeklyPool, { limit: WEEKLY_LIMIT, surface: 'weekly_special' });
      const weeklyIds = new Set(weeklySpecial.items.map((item) => String(item.id)));
      const recommendedPool = current.filter((item) => !weeklyIds.has(String(item.id)));
      return {
        weeklySpecial,
        recommended: rank(recommendedPool, { limit: RECOMMENDED_LIMIT, surface: 'recommended_listings' }),
      };
    },
  };
}
