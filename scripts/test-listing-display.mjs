import assert from 'node:assert/strict';
import { listingPresentation, normalizeListingText } from '../app/core/listing-display.js';

assert.equal(normalizeListingText('섭마 청콤'), '서브마리너 블루 콤비');
assert.equal(normalizeListingText('네비타리머 B01'), '내비타이머 B01');
assert.equal(normalizeListingText('까레라칼리버6 j12'), '까레라 칼리버 6 J12');

assert.deepEqual(
  listingPresentation({
    brand: '롤렉스', model: '서브마리너 41 126613LB 블루 콤비',
    sizeMm: 41, referenceNumber: '126613LB', movement: '자동',
  }),
  {
    model: '서브마리너', size: '41', modelSize: '서브마리너 41',
    reference: '126613LB', referenceText: 'Ref. 126613LB',
    feature: '블루 콤비', movement: '오토매틱', featureMovement: '블루 콤비 · 오토매틱',
  },
);

assert.deepEqual(
  listingPresentation({ brand: '롤렉스', model: '셀리니 24 18K 골드', sizeMm: 24, movement: '수동' }),
  {
    model: '셀리니', size: '24', modelSize: '셀리니 24', reference: '', referenceText: '',
    feature: '18K 골드', movement: '수동', featureMovement: '18K 골드 · 수동',
  },
);

assert.deepEqual(
  listingPresentation({ brand: '부쉐러', model: '통금 24', sizeMm: 24 }),
  {
    model: '통금', size: '24', modelSize: '통금 24', reference: '', referenceText: '',
    feature: '', movement: '', featureMovement: '',
  },
);

console.log('listing display normalization: 6 passed');
