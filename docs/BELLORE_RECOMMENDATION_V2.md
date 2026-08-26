# Bellore Intent & Trust Rank v2 설계·검증 기준

- 기준일: 2026-08-22
- 알고리즘 버전: `bellore-reco-v2.0.0`
- 운영 상태: 로컬 구현·테스트 단계, 미배포
- 점수 성격: 학습된 구매확률이 아닌 설명 가능한 행동의도 대리점수

## 1. 결론

자체 알고리즘 이름은 `Bellore Intent & Trust Rank v2`다. xAI, 쿠팡, 네이버, 구구스의 숫자나 비공개 모델을 추정해 복제하지 않는다. 공개된 1차 자료에서 검증 가능한 설계 원리만 가져오고, 현재 오프라인 평가 카탈로그 158개와 운영 DB 166개 수준의 단일 재고 명품시계라는 조건에 맞춰 모든 판매 가능 상품을 직접 점수화한다.

```text
요청·동의 상태 준비
  → 전체 재고 후보 수집
  → 품절·숨김·명시 조건 불일치 hard filter
  → 상품 정보 정규화
  → 고객별 다중 행동 대리점수 계산
  → 부정 신호·반복 노출 감점
  → 브랜드·모델·가격대 다양성 재정렬
  → 최종 판매 가능 여부 재확인
  → 추천 이유 노출
  → 동의 고객의 노출·성과 로그
```

현재 규모에서는 Transformer, GPU, ANN 벡터 검색, DPP, 아이템 단위 bandit이 품질 병목이라는 증거가 없다. 구조화된 브랜드·모델·레퍼런스·가격·상태·소재·크기와 실제 고객 행동을 먼저 정확히 연결한다.

## 2. 외부 자료에서 채택한 것과 보류한 것

### xAI/X 공개 알고리즘

공식 [`xai-org/x-algorithm`](https://github.com/xai-org/x-algorithm) 스냅샷과 2026-08-21 최신 확인 커밋 [`28e414f`](https://github.com/xai-org/x-algorithm/commit/28e414f535e4b5a50ca12ee87674e7649e50c7ad)을 확인했다.

채택한 원리:

- 후보 준비, 사전 필터, 점수화, 선택, 사후 필터, 노출 기록을 별도 단계로 둔다.
- 하나의 클릭 점수가 아니라 여러 행동 출력을 독립적으로 계산한 뒤 가중 합한다.
- 명시적 부정 행동을 양수 행동과 분리한다.
- 관련도 계산 뒤 다양성·탐색 재정렬을 수행한다.
- 요청마다 무작위화하지 않고 실험 대상을 결정론적으로 배정한다.
- 사용자에게 실제 추천 이유를 보여준다.

보류한 것:

- Phoenix Transformer, JAX/Rust/GPU 서비스, SimClusters, DPP 원본 코드, xAI 가중치.
- 48시간 콘텐츠 필터, 소셜 행동 종류, IP·성별·설치 앱 같은 특성.

공식 [Quickstart](https://github.com/xai-org/x-algorithm/blob/28e414f535e4b5a50ca12ee87674e7649e50c7ad/phoenix/QUICKSTART.md)는 Linux, NVIDIA GPU, CUDA 12 등을 요구하고 생산 데이터·체크포인트·오케스트레이션·스케일이 빠졌다고 명시한다. 합성 데이터 실행도 추천 품질을 입증하지 않는다. 저장소는 [Apache-2.0](https://github.com/xai-org/x-algorithm/blob/main/LICENSE)이지만 벨로르는 코드를 복사하지 않고 독자 구현했다.

### 쿠팡

쿠팡 Engineering의 [검색 엔진 설명](https://medium.com/coupang-engineering/the-evolution-of-search-discovery-indexing-platform-fa43e41305f9)은 query understanding, retrieval, ranking의 단계와 평점·리뷰·가격·브랜드·노출·클릭·구매 신호를 설명한다. [Data Platform 2022](https://medium.com/coupang-engineering/data-platform-2022-global-expansion-in-petabytes-3dbbbf27f6fe)는 추천 캐러셀과 랭킹 변경을 A/B 검증하고 대규모 트래픽에서 전환 보호 장치를 둔 사례를 설명한다. 2024년 [AI 여정 설명](https://medium.com/coupang-engineering/accelerating-coupangs-ai-journey-with-llms-2817d55004d3)은 클릭·조회·구매·장바구니와 텍스트·이미지 특성 활용을 고수준으로 밝힌다.

이 자료들은 구조 설명이지 운영 가중치·모델·데이터·코드 공개가 아니다. 쿠팡 규모의 BERT/DNN, 10분 수준 자동 중지는 벨로르 표본에 복사하지 않는다. 관련 미국 특허 [US11386478B1](https://patents.google.com/patent/US11386478B1/en), [US11354721B2](https://patents.google.com/patent/US11354721B2)은 가능한 실시예이며 현재 운영 시스템의 증거가 아니다. 공개는 구현 허가가 아니므로 구체 청구항 조합은 복제하지 않는다.

### 네이버

네이버 공식 자료에서 확인한 원리:

- [AiTEMS 소개](https://www.navercorp.com/media/pressReleasesDetail?seq=29595): 후보 추출 후 랭킹, 사용자 이력과 상품 메타데이터 결합, cold start 보완.
- [HyperCLOVA 추천 고도화](https://www.navercorp.com/media/pressReleasesDetail?seq=31239): 클릭·찜·장바구니·구매의 최근성과 빈도를 추천 이유로 표시하고 인기 쏠림을 완화.
- [홈피드 추천 시스템](https://d2.naver.com/helloworld/0207214): 여러 retriever와 ranker, 24시간 이내 최근 문맥, 다중 목적, 분포 균형, retriever 단위 탐색. 아이템을 직접 bandit arm으로 둔 실험은 효과가 좋지 않았다는 반증도 공개.
- [네이버플러스 스토어 발표](https://navercorp.com/media/pressReleasesDetail?seq=32113): 명시적 스펙 탐색과 AI 발견형 추천 목적을 구분.

회사 내부 CTR·거래액 수치는 표본, 기간, 신뢰구간이 공개되지 않아 벨로르 예상 효과로 쓰지 않는다. 홈피드 사례를 쇼핑 운영 공식으로 표현하지 않으며, 네이버의 cross-domain 문맥도 벨로르의 동의 범위를 넓히는 근거로 사용하지 않는다.

### 구구스

구구스는 최신 [개인정보처리방침](https://prd.gugus.co.kr/footer/termsPersonalInfoCollect)에서 방문·검색·구매 이력을 관심·성향 기반 상품 추천에 사용하고 90일 후 파기한다고 공개한다. 홈페이지에는 관심 브랜드, 찜, 최근·추천·인기 검색어, 가격 인하와 업데이트 상품 알림이 있다.

그러나 후보 생성, 점수식, 행동 가중치, 시간 감쇠, 모델, A/B 평가와 운영 코드는 공개하지 않았다. 따라서 “구구스에도 개인화 추천은 있으나 공개 알고리즘은 없다”가 정확한 결론이다. 입력 신호와 희소 재고 UX만 참고하고 비공개 공식을 추정하지 않는다.

## 3. 벨로르 v2 파이프라인

### 3.1 요청 문맥

추천 표면을 분리한다.

| 표면 | 우선 목적 | 적용 |
|---|---|---|
| AI 시계비서 | 사용자가 말한 브랜드·모델·레퍼런스·예산 충족 | 명시 조건은 hard constraint, 조건 불일치 시 다른 브랜드로 조용히 대체하지 않음 |
| 장바구니 | 현재 구매 문맥과 장기 취향을 반영한 발견 | 동의 고객은 서버 이력, 비동의 고객은 비개인화 품질·다양성 |
| 일반 검색 | 정확한 query/filter 결과 | 현재 검색 정렬을 v2로 강제 변경하지 않음. 노출 로그가 쌓인 뒤 별도 실험 |

### 3.2 후보와 자격

현재 카탈로그가 수백 개 미만이므로 ANN/GPU 후보검색 없이 판매 재고 전체를 후보로 읽고 중복을 제거한다. 추천 요청마다 `on_sale` 재고를 새로 조회하며, 조회·엔진 실패를 “조건 일치 0건”으로 가장하지 않고 고객에게 재고 확인 실패로 구분한다. 다음 항목은 점수와 무관하게 제외한다.

- `sold`, `sold_out`, `hidden`, `inactive`, `unavailable`, `deleted`, `draft`, `off`, 판매완료, 품절, 비공개.
- 상품 ID가 없거나 같은 ID가 중복된 행.
- 현재 장바구니·요청에서 제외한 상품.
- AI 대화에서 사용자가 명시한 브랜드·모델·레퍼런스·예산과 맞지 않거나 명시적으로 제외한 브랜드의 상품.
- 구매 완료 후 30일 이내의 같은 상품 또는 같은 레퍼런스.

30일은 현재 운영 가설이다. 반복 구매가 실제로 확인되면 레퍼런스별 cooldown을 재검토한다.

요청별 새 조회와 동일 snapshot의 post-filter는 이미 `sold`인 행을 제거하지만, 조회 직후 다른 고객 결제로 상태가 바뀌는 순간 경쟁까지 없애지는 못한다. 따라서 오프라인의 “판매 불가 0건”과 운영의 “stale 재고 노출률”을 분리한다. 운영 절대 0을 주장하려면 노출 직전 서버 재검증/서명된 eligibility 또는 위 재고 예약과 연결된 서버 추천 경계가 추가로 필요하다.

### 3.3 상품 정규화

제조사 레퍼런스와 벨로르 재고번호를 분리한다.

- `reference_no`/`reference_number`: 제조사 레퍼런스.
- `product_no`: 벨로르 재고번호.

기존 v1은 `product_no`를 레퍼런스 폴백으로 사용해 재고번호가 고객 선호 레퍼런스로 오인될 수 있었다. v2는 이를 금지한다.

대화 숫자도 역할을 먼저 구분한다. `14060`, `16013`, `16014`, `16233`처럼 단위와 예산 문맥이 없는 4~6자리 토큰은 레퍼런스로 처리하고 예산으로 다시 소비하지 않는다. 문자로 시작하는 실제 레퍼런스도 지원하되 `BRT-N8263-1` 같은 벨로르 재고번호 전체를 먼저 분리해 중간 `N8263`을 제조사 레퍼런스로 학습하지 않는다. 레퍼런스 hard constraint와 “찾으신 레퍼런스” 이유는 구두점·대소문자 정규화 뒤 완전일치만 허용한다.

`1500만원`, `예산 1500 이하`, `1200~1500만원`, `1200에서 1500만원`, `1천5백만원`, `1억5천만원`처럼 통화 단위 또는 명시적 예산 문맥이 있는 경우에만 금액으로 처리한다. “롤렉스 말고 오메가”는 오메가만 양수 선호로 남기고 롤렉스는 요청의 제외 hard constraint로 보낸다. 한두 음절 별칭은 한글 단어 경계를 강제해 `스크롤`, `컨트롤`, `재미도`를 각각 롤렉스·미도로 오인하지 않는다.

브랜드와 모델도 카테고리 값으로 정규화한 뒤 완전일치한다. `세이코`와 `그랜드세이코`처럼 이름이 포함되는 다른 브랜드를 substring으로 함께 통과시키지 않는다. 평가 카탈로그의 서로 다른 브랜드 표기 34개는 모두 파서에서 하나의 canonical brand로 회수해 exact hard gate를 통과했고, “그랜드세이코 말고 세이코”와 반대 순서도 각각 양수·제외 문맥을 보존한다. `데이트저스트/데이저스트`, `카레라/까레라`, `셀리니`, `J12` 등 현재 재고 모델 별칭을 canonical model로 합쳤으며, 158개 `modelName` 중 모델 신호 회수 행은 72개에서 126개로 늘었다. 남은 32개 일반·희소 명칭은 데이터 근거 없이 자동 hard constraint로 승격하지 않는다.

파서 정확도와 상품 원장 정합성은 별도 문제다. 비어 있지 않은 `referenceNo` 45행 중 파서는 44행을 정확 회수했지만, 아래 12행은 구조화 레퍼런스가 틀렸거나 비어 있어 고객의 exact-ref 요청을 엔진이 의도적으로 0건 처리한다. 모델명에서 임의로 채우지 말고 제조사·감정 원천으로 확인한다.

| 벨로르 상품번호 | 모델명에서 확인할 후보 | 현재 구조화 값 | 문제 |
|---|---:|---:|---|
| `ROL-N24265-1` | `1601` | `1960-70` | 설명의 연대가 레퍼런스로 잘못 입력됨 |
| `ROL-N28266-1` | `126334` | 빈 값 | 구조화 값 누락 |
| `ROL-N31265-1` | `1603` | 빈 값 | 구조화 값 누락 |
| `ROL-N1267-1` | `6517` | 빈 값 | 구조화 값 누락 |
| `ROL-N21262-3` | `1601` | 빈 값 | 구조화 값 누락 |
| `ROL-N25266-1` | `1601` | 빈 값 | 구조화 값 누락 |
| `ROL-N16266-2` | `6294` | 빈 값 | 구조화 값 누락 |
| `FRM-N30266-1` | `5850` | 빈 값 | 구조화 값 누락 |
| `ROL-N22266-1` | `1803` | 빈 값 | 구조화 값 누락 |
| `PIA-N22267-5` | `8154` | 빈 값 | 구조화 값 누락 |
| `ROL-N15267-3` | `1500` | 빈 값 | 구조화 값 누락 |
| `BVL-N15267-1` | `SD38SG` | 빈 값 | 구조화 값 누락 |

따라서 현재 “유효 제조사 레퍼런스 45/45” 또는 exact-ref 전수 보장을 주장하지 않는다.

## 4. 점수

### 4.1 입력 특성

모든 특성은 0~1 범위로 제한한다.

| 특성 | 의미 |
|---|---|
| `relevance` | 명시·저장 선호 레퍼런스, 모델, 브랜드, 속성 일치 |
| `budget_fit` | 예산 안이면 1, 벗어나면 로그 거리로 완만하게 감소 |
| `short_intent` | 최근 24시간 행동을 별도 감쇠한 단기 의도 |
| `long_interest` | 장기 관심 점수의 포화값과 60일 반감기 |
| `behavior_positive` | 최근 조회·찜·장바구니·문의·결제 진입의 포화된 긍정 신호 |
| `behavior_negative` | 찜 해제·장바구니 제거·명시적 추천 무시 |
| `exposure_fatigue` | 7일 동안 같은 상품을 세 번 넘게 보여준 경우의 약한 피로도 |
| `completeness` | 사진, 가격, 브랜드·모델, 레퍼런스, 상태, 색상, 크기, 소재, 구성 정보 충실도 |
| `value` | 확인 가능한 가격 인하. 시장가보다 싸다는 의미로 사용하지 않음 |
| `novelty` | 등록 시점 기반의 작은 탐색 보조값. 구조화 품질보다 우선하지 않음 |

### 4.2 반복 행동과 시간 감쇠

```text
decayed_signal = event_strength × exp(-ln(2) × elapsed_days / half_life_days)
```

같은 상품에서 같은 행동 유형을 반복해도 가장 강한 최근 한 건만 사용한다. 조회 40회가 조회 1회보다 점수를 무한히 올리지 않는다. 장기 관심점수도 `1 - exp(-score / 35)`로 포화시킨다.

현재 반감기 설정:

| 이벤트 | 반감기 | 방향 |
|---|---:|---:|
| 상품 조회·추천 클릭 | 14일 | 약한 양수 |
| 찜 | 45일 | 중간 양수 |
| 장바구니 | 30일 | 강한 양수 |
| 문의 | 30일 | 강한 양수 |
| 가격 알림 | 45일 | 중간 양수 |
| 결제 진입 | 30일 | 가장 강한 구매 전 양수 |
| 찜 해제 | 60일 | 강한 음수 |
| 장바구니 제거 | 45일 | 강한 음수 |
| 추천 무시 버튼 | 60일 | 가장 강한 음수 |

현재 UI에는 추천 무시 버튼이 없으므로 `recommendation_dismiss`는 데이터 계약만 준비돼 있다. 단순 미클릭은 위치 편향 때문에 명시적 부정으로 간주하지 않는다.

구매 완료는 동일 상품을 더 세게 추천하는 양수 신호가 아니다. 단일 재고 구매가 끝났다는 상태이므로 같은 상품·레퍼런스를 cooldown하고, 브랜드 장기 취향만 프로필에 남긴다. 취소·환불 결과를 연결하는 것은 후속 과제다.

찜·장바구니 add/remove는 누적 감정이 아니라 상품별 현재 상태다. 동일 상품 ID 또는 정확 레퍼런스에서 가장 최신 이벤트 하나만 적용하며, 같은 브랜드의 다른 상품 remove가 현재 상품의 add를 뒤집지 못한다.

### 4.3 다중 행동 대리점수

다음 다섯 출력을 각각 sigmoid 규칙식으로 계산한다.

- 상세 조회 대리점수
- 찜 대리점수
- 장바구니 대리점수
- 구매 대리점수
- 부정 반응 대리점수

최종 기본점수:

```text
utility =
    0.14 × view_proxy
  + 0.20 × wishlist_proxy
  + 0.28 × cart_proxy
  + 0.38 × purchase_proxy
  - 0.24 × negative_proxy
  + 0.055 × completeness
  + 0.025 × novelty
  - 0.12 × exposure_fatigue

score = clamp(100 × utility, 0, 100)
```

가중치는 벨로르 v2의 검증 전 설정값이다. 원시 클릭 횟수에 직접 곱하지 않으며 xAI·쿠팡·네이버 숫자를 복사하지 않았다. `action_proxies`는 보정된 확률이 아니다. 실제 확률로 바꾸려면 충분한 노출·구매 표본, 시간순 검증, Brier score와 reliability curve를 통한 calibration이 먼저 필요하다.

### 4.4 다양성과 탐색

기본점수를 독립 계산한 뒤 greedy metadata rerank를 수행한다.

- 같은 브랜드: 유사도 0.55.
- 모델 텍스트 유사도: 최대 0.27.
- 가격 차이가 20% 이내: 0.13.
- 같은 다이얼 색상: 0.05.
- 기본 다양성 감점 계수: 0.19.
- 일반 top-K의 같은 브랜드 상한: 2개.
- 사용자가 한 브랜드를 명시한 요청은 브랜드 상한을 해제.
- 매 5번째 위치는 상위 20개 안에서 기본점수 68%, 정보 충실도·신규성 32%로 제한적 탐색.

탐색도 결정론적이다. `Math.random()`으로 요청마다 순서를 흔들지 않는다. 동점은 알고리즘 버전과 subject seed의 안정 해시로 정한다.

## 5. 추천 이유와 투명성

고객에게는 내부 원시 로그 대신 다음 중 가장 강한 이유 1~2개를 보여준다.

- 찾으신 레퍼런스와 일치
- 관심 모델과 유사
- 관심 브랜드와 일치
- 최근 관심 행동과 관련
- 예산 범위에 적합
- 가격 인하 확인
- 선호 속성과 유사
- 상품 정보가 비교적 충실
- 판매 가능한 상품 중 정보·다양성 기준

“좋은 가격”, “구매확률 88%”, “AI가 구매할 사람으로 판단” 같은 검증되지 않은 표현은 쓰지 않는다. 기존 `buy_probability` DB 필드는 호환성을 위해 유지하지만 화면에서는 `구매의도 지수 n/100`으로만 표시한다.

## 6. 로그와 개인정보

개인화 동의, 로그인, DB 프로필 동의가 모두 참일 때만 다음 이벤트를 기록한다.

```text
request_id
surface
product_id
rank
candidate_sources
score
score_kind
score_components
algorithm_version
variant
created_at
```

성과 이벤트는 `recommendation_click`, `wishlist_add/remove`, `cart_add/remove`, `purchase_request`, `purchase_complete`로 연결한다. 즉시 이어지는 찜·장바구니·결제 문맥은 `request_id`, 표면, 순위, 버전, 실험 변형을 전달한다. 새로고침 등으로 문맥이 사라지면 서버가 같은 동의 고객·상품의 최근 7일 추천 클릭 중 마지막 한 건을 별도 paid 귀속 후보로 사용한다. 비동의 추천은 전체 판매 가능 재고의 정보 충실도·다양성만 사용하고 서버 쓰기는 0건이어야 한다.

단, 브라우저의 `purchase_complete`는 추천 cooldown과 화면 흐름을 위한 보조 이벤트이지 검증된 구매 라벨이 아니다. 1차 지표는 PortOne 상태·금액을 서버에서 검증한 `orders.status='paid'`다. 결제 Edge Function과 DB 확정 함수가 같은 고객·상품의 추천 클릭을 대조하고, 결과는 법정 주문 JSON이 아니라 `ai_paid_recommendation_attributions`에 `last_recommendation_click_7d`로 저장한다. 이 표는 사용자·동의 프로필·원본 클릭 이벤트에 모두 `ON DELETE CASCADE`로 연결되어 철회·회원삭제·90일 원본 파기 때 함께 사라진다. 주문 JSON에는 추천 문맥을 저장하지 않고 DB trigger가 신규·구버전 쓰기 모두에서 제거한다.

7일 last-click 귀속은 “추천을 거쳐 결제된 진단 지표”이지 구매 상승의 인과 증거가 아니다. 실제 상승은 추천 클릭 여부와 무관하게 실험 시작 전에 고정 배정한 고객군별 paid 주문율을 intent-to-treat로 비교해야 한다. 현재 1st-party 클릭도 악성 클라이언트에 위조 불가능한 증명은 아니므로, 실험을 켤 때는 서버 발급·서명된 노출·배정 토큰을 후속 강화한다.

결제 연결은 추천 측정 때문에 법정 주문·쿠폰·포인트 불변식을 약화시키지 않는다.

- 회원 주문은 JWT 사용자와 `customer_id`가 일치해야 하고, 게스트 주문은 브라우저에서 만든 256-bit 확인 토큰의 SHA-256만 DB에 보관한다. `order_no`만으로는 조회·확정할 수 없으며 응답은 허용 목록 필드만 반환한다.
- `paid_at`을 1회성 결제 확정 마커로 사용한다. 배송·검수·환불 단계의 재시도가 상태를 `paid`로 되돌리거나 결제 스냅샷을 다시 쓰지 못한다.
- 쿠폰은 pending 주문 생성 트랜잭션에서 `active → reserved`로 원자 예약하고, 동일 쿠폰의 두 번째 주문을 결제창 전에 막는다. 검증된 최종 실패·취소만 예약을 해제하며 `READY`·`PENDING`은 유지한다.
- 신규 paid 전이, 쿠폰 사용, 포인트율·적립액 스냅샷, 포인트 원장은 한 DB wrapper 트랜잭션에서 처리한다. `profiles.points`는 private reconciler의 transaction-local gate 없이 변경할 수 없다. 포인트율은 basis point 정수로 고정하되 현재 후보는 환불 RPC가 준비되지 않아 DB·Edge 모두 0만 허용한다. 환경값을 0보다 크게 설정하면 결제 확인이 503으로 중단되며, 과거 paid 주문에 현재 적립률을 자동 소급하지 않는다.
- `point_ledger.order_id`는 `orders.id`를 `ON DELETE RESTRICT`로 참조해 지급 idempotency key가 주문 삭제로 사라지지 않게 한다. 계정 삭제는 사용자 원장을 먼저 cascade하고 법정 주문은 익명화 경로를 유지한다.
- paid 확정 wrapper는 동일 listing을 행잠금하고 `on_sale → sold`를 원자 전환하며, `listing_id`의 paid 부분 unique index와 `ON DELETE RESTRICT` FK로 DB 이중 판매를 막는다. 이미 PAID인 콜백에서 재고·금액·쿠폰·DB 확정 검증이 실패하면 주문을 조건부 `payment_review`로 claim한 호출만 PortOne 취소를 시도하고, 취소 `SUCCEEDED` 확인 뒤에만 `failed`로 전환한다. 다른 동시 호출이 먼저 paid를 확정했으면 재조회한 `paid_at`이 우선하며 결제를 취소하지 않는다.
- 서버가 인정하는 PAID 증거는 설정된 `PORTONE_STORE_ID`, `KRW`, `channel.type='LIVE'`, `PORTONE_LIVE_CHANNEL_KEYS` 허용 목록을 모두 만족해야 한다. 상점·통화·라이브 채널 출처가 다르면 자동 취소하지 않고 `payment_review`로 격리해 운영자가 실제 결제 출처를 확인한다.

이 결제 cutover는 아직 운영 적용 대상이 아니다. 위 보상 취소는 이미 승인된 두 번째 결제를 수습하는 2차 안전망이지 이중 승인을 예방하는 예약이 아니다. 결제창을 열기 전에 listing당 하나의 유효 주문만 보유하는 만료·재대조 가능한 재고 예약 RPC, 또는 승인→DB claim→capture 흐름을 먼저 설계·검증해야 한다. PortOne 공식 문서상 결제창 이탈 후에도 `READY`가 남을 수 있고 브라우저 콜백은 유실될 수 있으므로 [웹훅 연동](https://developers.portone.io/opi/ko/integration/webhook/readme-v2?v=v2), `payment_review` 경보와 결제 상태 재대조 worker 없이 시간만으로 재고·쿠폰 예약을 풀지 않는다. 특히 review claim 커밋 뒤 Edge가 취소 전에 종료되면 현재 콜백만으로는 복구되지 않으므로, worker가 PortOne을 다시 조회해 DB `paid_at`이면 절대 취소하지 않고, provider PAID이면 같은 idempotency key로 취소·운영판단, CANCELLED/FAILED이면 review를 조건부 failed로 닫아야 한다. 또한 현재 `cancel-payment`의 환불 쿠폰·포인트 되돌림은 하나의 DB 트랜잭션이 아니므로, 환불용 idempotent RPC와 동시성 테스트를 별도 완료하기 전에는 “혜택 전체 exactly-once”를 운영 보장으로 표현하지 않는다. PortOne [결제 상태 정의](https://developers.portone.io/api/rest-v2/payment?v=v2)와 [결제 연동 흐름](https://developers.portone.io/opi/ko/integration/start/v2/checkout)을 스테이징 시나리오 기준으로 사용한다.

개인화와 광고는 분리한다.

1. 사이트 내 행동 기반 맞춤 추천.
2. 개인정보의 마케팅 활용.
3. 이메일, SMS, 카카오, 앱 푸시 등 채널별 광고 수신.

현재 실제 외부 개인화 광고·추천 발송은 연결하지 않는다. 향후 발송 전에는 2번과 3번을 채널별로 분리해야 한다. 주문·배송 필수 알림에 개인화 프로모션을 섞지 않는다.

운영 적용은 기존 bootstrap인 `ai_advisor.sql` 재실행이 아니라 전용
`supabase/recommendation_v2_migration.sql`로 분리했다.

- 고지 버전·경로·시각을 행동 로그와 분리한 최소 동의 원장.
- 고객 프로필 생성과 동의 플래그 변경은 동의 RPC만 허용한다. 브라우저 직접 INSERT는 없고, 철회된 프로필은 서비스 백엔드·관리자 학습 작업도 다시 채울 수 없다.
- 수집·철회·회원 삭제의 잠금 순서를 `auth.users → 고객 프로필 → 행동/대화 행`으로 통일해 동시 insert, 철회, 계정 cascade의 경쟁과 교착을 차단한다.
- 본인만 실행 가능한 `withdraw_ai_personalization(true)`와 대화·행동·관심·추천·알림·파생 취향 초기화.
- 회원 삭제 시 프로필·연결 데이터·동의 원장을 `ON DELETE CASCADE`로 제거.
- 기존 개인화·마케팅 `consent=true` 체크박스를 새 v2 동의로 자동 승격하지 않음. `consent=false` 프로필에도 신원·취향·예산·파생 성향·요약이 남아 있으면 재동의 시 조용히 복원될 수 있으므로, 과거 자식 행과 함께 사람 검토·초기화 전까지 migration 중단.
- 7개 개인정보 테이블의 RLS·정확한 ACL·정책 allowlist를 재검증하고, 사용자·프로필 FK는 constraint 이름과 무관하게 단일 `ON DELETE CASCADE`로 교체.
- 로컬 AI 원문 요청도 로그인·서버 동의·동일 프로필 행잠금을 통과해야 저장·처리. 익명 submit/result와 타 계정 bearer token 조회는 차단한다. v2 철회는 기록 유지 모드를 허용하지 않고 대기·처리·완료 요청, 연결 로그와 나머지 개인화 원본·파생 기록을 함께 삭제한다.
- 서버 수집시각 강제, UPDATE 시각 고정, `created_at` 인덱스, 동시 실행 잠금과 테이블별 최대 20,000행의 90일 배치 파기 함수. 반환된 만료 잔존 수가 0인지 별도 확인.
- 사용하지 않는 AI 대화 첨부 업로드 정책 제거. 기존 객체가 있으면 SQL 메타데이터 삭제가 아니라 Storage API로 별도 정리.

운영 DB에는 아직 적용하지 않았다. 프런트엔드 배포보다 먼저 DB owner 역할로 read-only preflight, 과거 동의·개인화 행의 사람 검토, 백업, migration, 테스트 계정의 동의→수집→철회→재수집 거부, 수동 90일 파기를 검증해야 한다. core migration은 검사와 DDL 사이 신규 쓰기를 막기 위해 `auth.users`, 7개 개인정보 테이블, Storage 객체와 선택형 로컬 AI 큐에 짧은 `ACCESS EXCLUSIVE` 잠금을 잡으므로 공지된 유지보수 창과 활성 트랜잭션 정리가 필요하다. 기존 로컬 AI bridge가 있다면 원문 큐를 먼저 검토·비운 뒤 최신 `local_ai_bridge.sql`로 소유 프로필·FK·잠금 순서를 올려야 하며, 불명확한 행을 자동 backfill하지 않는다. `pg_cron`은 조용히 자동 등록하지 않는다. 예전 무제한 0인자 purge·기존 job이 없고, 실제 timezone·단일 owner·측정된 일 유입보다 큰 batch·첫 성공·만료 잔존 0건을 확인한 뒤에만 등록한다. RPC 실패 시 클라이언트는 해당 기기의 신규 개인화를 즉시 멈추되 서버 삭제 성공으로 가장하지 않는다.

2026-08-22 운영 DB read-only 측정에서는 v2 동의 원장·철회 RPC·bounded purge가 아직 없었다. `customer_ai_profiles` 6행 중 개인화 동의 true 4행, 마케팅 동의 true 2행, `user_id`가 없는 프로필 1행, 비동의지만 payload가 남은 프로필 2행이었고, 대화 108행·관심 8행·이벤트 71행·양쪽 소유키가 모두 없는 대화 4행이 확인됐다. 따라서 현재 core migration은 의도대로 중단되며, 이 행들을 사람 검토 없이 v2 동의로 이관하거나 자동 backfill하면 안 된다. 반면 주문은 0행이었고 paid 추천 JSON, 잘못된 결제 마커, 포인트 원장 blocker는 0건이었다. listings는 166행 전부 `on_sale`이었고 기존 운영 DB에는 paid 시 `sold`로 바꾸는 trigger가 없었다. draft outcome migration이 이 전이·FK·unique를 추가하지만, 위 재고 예약과 스테이징 검증 전에는 운영 보장으로 볼 수 없다. 이 수치는 배포 승인값이 아니라 당시 상태의 진단 기록이다.

법·정책 검토 근거:

- [개인정보 보호법 제15조](https://www.law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029335387)
- [개인정보 보호법 제22조](https://www.law.go.kr/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=900078945)
- [정보통신망법 제50조](https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1030434423)
- [KISA 광고성 정보 안내서 7차](https://www.kisa.or.kr/401/form?postSeq=3608)
- [개인정보위 개인정보 처리방침 작성지침](https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS217&mCode=D010030020&nttId=12018)
- [개인정보위 식별형 행태정보 정책](https://www.pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000&nttId=9888)

일반 상품 추천은 최종 선택을 고객이 하므로 자동화된 권리·의무 결정으로 사용하지 않는다. 추천 점수를 계정정지, 구매차단, 개인별 가격, VIP 자격에 재사용하지 않는다.

## 7. 평가 설계

### 7.1 현재 가능한 오프라인 회귀

- 품절·숨김·제외 상품 0건 노출.
- 5자리 레퍼런스를 예산으로 중복 해석하지 않고, 명시 레퍼런스·예산 일치 상품 우선.
- 문자 시작 레퍼런스와 복합·범위 금액을 분리하며, 벨로르 재고번호를 레퍼런스로 오인하지 않음.
- 레퍼런스 hard constraint는 substring이 아니라 정확 일치이며 거짓 “레퍼런스 일치” 이유 0건.
- “A 말고 B”에서 A는 양수 선호가 아니라 hard exclusion이며 A 노출 0건.
- 명시 조건 0건일 때 조용한 전체 폴백 0건.
- 부정 신호 후 동일 상품 점수 하락.
- 같은 브랜드의 다른 상품 찜·장바구니 remove가 현재 상품의 add 상태를 뒤집지 않음.
- 반복 조회 1회와 40회의 점수 동일.
- 오래된 장바구니보다 최근 장바구니 신호가 강함.
- 구매 완료 상품·레퍼런스 cooldown.
- top 6에서 명시 조건이 없으면 같은 브랜드 최대 2개.
- 같은 입력 26회 순서 동일.
- 점수 0~100, 대리점수 0~1, 입력 배열 무변경.
- `personalized:false`일 때 메모리에 남은 프로필·예산이 순위·점수·이유에 미치는 영향 0.

2026-08-22 최종 로컬 benchmark는 평가 카탈로그 158개를 전수 점수화했다. exact `126613LB` fixture는 1위·96.8점, 같은 요청 251회 순서는 전부 같았고, 불가능 조건은 158개를 모두 제외해 반환 0건이었다. cold-start top 10은 서로 다른 브랜드 10개였다. 단독 실행 latency는 median 11.769ms, p95 13.036ms, max 15.102ms였다. 이 값은 현재 개발 PC의 회귀 기준이지 운영 SLA나 구매율 상승 증거가 아니다.

### 7.2 온라인 지표

분모는 추천 노출이어야 한다. 클릭만 기록하고 노출을 기록하지 않으면 전환율을 계산할 수 없다.
AI 가로 카드와 장바구니 카드는 브라우저가 실제 카드 면적의 60% 이상을 보여 주고, 문서·해당 패널·탭이 활성일 때 요청/상품/순위별 1회만 노출로 기록한다. `IntersectionObserver`가 없는 브라우저에서는 보지 않은 카드를 노출로 추정하지 않는다.

| 구분 | 지표 |
|---|---|
| 1차 | 추천 노출 대비 검증된 결제 완료 |
| 선행 | 상품 상세 클릭, 찜, 장바구니, 결제 진입, 문의 |
| 품질 | 판매 불가·stale 재고 노출률, 진짜 zero-result와 재고조회 실패, 응답시간, 중복노출, 브랜드·카탈로그 커버리지 |
| 보호 | 빠른 되돌아오기, 검색 포기, 비동의 서버 쓰기, 개인화 철회 실패 |

찜·장바구니·문의는 구매의 선행지표이지 매출 상승의 증거가 아니다. 실제 “구매율 상승”은 충분한 표본의 결제 완료로만 판정한다.

### 7.3 실험

엔진에는 `user_id + experiment_id` 안정 해시 배정 함수를 준비했지만 A/B 실험은 기본적으로 꺼져 있다. 운영 설정이 명시적으로 `enabled=true`이고 동의 고객·실험 ID·변형 목록이 모두 있을 때만 배정한다. 먼저 정상 노출 로그와 기준 결제율을 확보한다.

실험 전 확정할 것:

- 1차 지표와 보호 지표.
- 최소 검출 효과(MDE), 필요한 표본과 최소 기간.
- 고객 단위 sticky assignment와 고정 holdout.
- 동시에 바꾸는 변수 1개.
- 중지 규칙과 롤백 기준.

저트래픽에서 p-value를 반복 확인해 조기 중지하지 않는다. 쿠팡의 대규모 10분 보호 장치나 네이버의 내부 CTR 수치를 벨로르 기준으로 복사하지 않는다.

## 8. 배포 전 체크리스트

- [ ] 운영 DB 백업·복구 경로 확인.
- [ ] 짧은 유지보수 창을 공지하고 장기 실행 트랜잭션·로컬 AI worker를 중지한 뒤 core migration의 원자 잠금 시간을 측정.
- [ ] SQL은 `anon`/`authenticated`/`service_role`이 아닌 DB owner 역할로 실행하고 함수 owner·`search_path`·ACL 확인.
- [ ] `supabase/recommendation_v2_preflight.sql` 결과에서 기존 개인화·마케팅 동의=true, 동의=false 프로필의 잔존 payload, 과거 개인화/로컬 AI 원문, 중복 프로필, orphan·미래시각·예상 밖 정책·AI 첨부 객체 차단값 0 확인.
- [ ] 로컬 AI bridge를 쓴다면 `extensions.digest(text,text)`가 존재하고 pgcrypto가 `extensions` schema에 설치됐는지 확인.
- [ ] 운영 DB 백업 뒤 `supabase/recommendation_v2_migration.sql`을 별도 트랜잭션으로 적용.
- [ ] 결제 cutover 전 checkout·confirm-payment·결제 worker를 모두 중지하고 `pg_stat_activity`와 함수 로그로 in-flight 호출 0건을 확인. 실행 중인 구 PL/pgSQL frame은 `CREATE OR REPLACE` 뒤에도 구 본문을 계속 실행할 수 있으므로 단순 ACL revoke로 drain을 대신하지 않음.
- [ ] 기존 모든 상태의 주문에서 브라우저 출처 `analytics_attribution.recommendation`이 0건인지 검토한 뒤, `supabase/recommendation_v2_outcome_attribution.sql` → 업데이트된 `confirm-payment`·프런트 순으로 한 유지보수 창에서 전환. 새 DB 전의 새 클라이언트와 새 DB 뒤의 구 Edge가 모두 결제 실패하도록 fail-closed했으므로 혼합 버전을 노출하지 않음.
- [ ] `PORTONE_STORE_ID`, `PORTONE_LIVE_CHANNEL_KEYS`, `PORTONE_API_SECRET`을 운영 값으로 넣고 `POINT_EARN_RATE`는 정확히 `0`인지 확인. 운영 PortOne LIVE fixture로 응답 JSON의 `storeId`, `currency='KRW'`, `channel.type='LIVE'`, `channel.key` 허용 목록 일치를 검증하며 빈 값·오타가 모든 승인을 review로 보내는지 확인.
- [ ] outcome 적용 뒤 `analytics_v3_canonical.sql` 재실행 금지 guard가 실제로 중단시키는지 확인. 재실행은 v2 paid 확정 함수와 ACL을 과거 정의로 되돌릴 수 있음.
- [ ] 실제 PostgreSQL 스테이징에서 SQL compile, 함수 owner·ACL, 회원 JWT/게스트 토큰, 쿠폰 이중 예약, 동시 confirm, paid/배송/환불 재시도, 철회·회원삭제와 결제 경합을 2세션으로 검증.
- [ ] 결제창 전에 listing 단위 재고 예약을 원자 획득하고, `READY/PENDING` 재대조·만료·해제·동일 주문 재시도·서로 다른 주문 동시 승인 시나리오를 검증. 이 항목 전에는 단일 재고 결제 cutover 금지.
- [ ] 이미 PAID인 재고·금액·쿠폰·DB 확정 충돌에서 오직 claim 성공 호출만 PortOne 취소를 실행하고, `SUCCEEDED`면 failed, `REQUESTED/FAILED/unknown`이면 payment_review 유지·운영 경보가 남는지 검증.
- [ ] PortOne webhook과 재대조 worker가 `READY/PENDING/payment_review`를 처리하고 운영 경보를 남기는지 확인. review claim 직후 Edge 강제 종료도 재대조·동일 idempotency key 취소로 복구하고, 시간만 지난 예약 쿠폰을 임의 해제하지 않음.
- [ ] 환불 쿠폰·포인트를 단일 idempotent DB RPC로 전환하고 `order_refund` 중복 방지·중간 실패 복구를 검증하기 전에는 outcome cutover를 승인하지 않음.
- [ ] `ai-learn`은 JWT 본인 확인, 관리자 action 차단, 프로필 소유권·개인화 동의 재검사를 포함한 최신 함수만 배포.
- [ ] 로그인 테스트 계정으로 동의 전 행동 쓰기 0건 확인.
- [ ] 동의 후 추천 노출·클릭의 request/rank/version 기록 확인.
- [ ] 철회와 행동 insert를 두 세션에서 동시에 실행한 뒤 consent=false·연결행 0 확인.
- [ ] 행동 insert와 회원 삭제를 두 세션에서 동시에 실행해 교착 0건, 삭제 뒤 프로필·연결행·동의 원장 0 확인.
- [ ] 로컬 AI가 설치됐다면 anon submit/result 거부, A 계정 token을 B 계정이 읽지 못함, 철회 시 요청·로그 0 확인.
- [ ] 수동 90일 배치 전후 테이블별 삭제 수와 `remaining_expired_by_table` 전부 0 확인.
- [ ] 최근 7/30일 최대 일 유입보다 batch 용량이 큰지 확인하고 `pg_cron` timezone·단일 owner·활성 job 정확히 1개·첫 실행 성공 확인.
- [ ] 14세 미만 처리·법정대리인 동의가 없는 계정의 개인화 제외 경로 확정.
- [ ] AI 비서, 장바구니, 일반 검색, 결제, 찜 회귀 테스트.
- [ ] 위 표의 레퍼런스 12행을 제조사·감정 원천으로 검토해 잘못된 `1960-70` 1행과 빈 구조화 값 11행을 정정한 뒤, exact-ref 전체 사용자 경로를 다시 측정.
- [ ] `CNAME`, 서비스워커 버전, 운영 DNS, GitHub Pages 작업 확인.
- [ ] 배포 전후 같은 테스트 계정·같은 입력으로 순위와 바이트·응답시간 측정.

## 9. 현재 파일 연결

- `recommendation-engine.js`: 독립 점수·필터·재정렬 엔진.
- `ai-advisor.js`: 동의 고객 신호 조회, AI 추천, 이유 노출, 노출·클릭 로그, 철회 UI.
- `wishlist.js`: 장바구니 추천 표면과 비동의 비개인화 폴백.
- `ai-advisor-admin.js`: “구매확률” 대신 “구매의도 지수” 표시.
- `ai_advisor.sql`: 신규 개발 DB용 기반 테이블 bootstrap. 운영 재실행 금지.
- `local_ai_bridge.sql`: 로그인·동의·프로필 잠금이 적용된 선택형 사무실 로컬 AI 큐. 익명 원문 저장 금지.
- `payments.js`: 추천 문맥을 결제 요청까지 전달하고 서버 확인 뒤 보조 완료 이벤트 기록.
- `supabase/functions/confirm-payment/index.ts`: 회원 JWT/게스트 토큰과 PortOne PAID를 먼저 검증하고, 금액·재고·쿠폰·DB 확정 실패를 조건부 review/검증된 보상 취소로 수습한 뒤 paid 주문·혜택 wrapper를 호출.
- `supabase/functions/ai-learn/index.ts`: 관리자 action, 본인 프로필, 개인화 동의를 서버에서 검증하는 요약·답변 경계.
- `supabase/recommendation_v2_preflight.sql`: 운영 적용 전 read-only 차단값 측정.
- `supabase/recommendation_v2_migration.sql`: 동의 원장, 행잠금 쓰기 gate, RLS/ACL, cascade, 로컬 AI 큐, 철회·배치 파기.
- `supabase/recommendation_v2_outcome_attribution.sql`: checkout을 중지한 한 번의 전환에서 paid 추천 증거, 주문 접근제어, 결제 상태, 쿠폰 예약, 포인트 idempotency를 함께 고정하는 미적용 migration.
- `supabase/recommendation_v2_verify.sql`: 적용 후 정책·트리거·삭제·cron 검증 절차.
- `scripts/test-recommendation-engine.js`: 엔진 회귀 테스트.
- `scripts/test-customer-algorithm.js`: 동의 이중 차단과 행동의도 단계 회귀.
- `scripts/test-recommendation-outcome.js`: 추천 클릭→결제 귀속과 AI Edge Function 접근 제어 회귀.

## 10. 다음 데이터가 쌓인 뒤 검토할 것

1. 검색어·필터 문맥을 추천 노출 request에 연결.
2. 취소·환불을 구매 라벨에서 분리.
3. 상품별 노출 부족을 전체 카탈로그 기준으로 계산.
4. 구조화 속성만으로 유사상품 품질이 부족한 것이 측정되면 이미지 임베딩을 오프라인 후보로 검토.
5. 충분한 구매 라벨이 생긴 뒤 행동 대리점수를 보정 모델로 교체.
6. bandit은 아이템이 아니라 3~5개 후보 전략 선택 문제로만 검토하고 고정 holdout 유지.

현재 성공 기준은 “AI를 붙였다”가 아니라 다음 세 가지다.

- 비동의 고객 서버 행동 쓰기 0건.
- 동일 재고 snapshot의 판매 불가 상품 추천 0건, 운영 stale 재고 노출률은 별도 측정.
- 같은 입력의 재현 가능한 순위와 실제 결제 완료 기반 비교.
