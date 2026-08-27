# 서버-프런트 계약 전수조사 (2026-08-27)

- RPC 정의: 152개
- Edge Function 정의: 20개
- 프런트 직접 참조 RPC: 34개
- 서버 런타임 참조 RPC: 33개
- SQL 내부 참조 RPC: 116개
- 프런트 직접 참조 Edge: 16개
- 전체 참조 0: 6개 / 천장 6개

## RPC 정의 152개

_claim_coupon, _deposit_forfeit, _deposit_release, _wallet_row, admin_begin_member_auth_transition, admin_cancel_member_auth_transition, admin_cancel_member_delete, admin_complete_member_auth_transition, admin_grant_coupon, admin_manage_listing, admin_manage_member_profile, admin_prepare_member_delete, admin_reconcile_member_deletes, admin_review_member_onboarding, admin_set_catalog_home_section, admin_set_member_verification, ai_guard_paid_listing_status, ai_guard_paid_order_delete, ai_guard_paid_order_state, ai_guard_personalization_write, ai_guard_profile_points, ai_guard_profile_write, ai_guard_shop_chat_request_insert, ai_guard_shop_chat_request_update, ai_jsonb_is_string_array, ai_lock_auth_user, ai_profile_owned_and_consented, ai_purge_expired_personalization_data, ai_release_pending_order_coupon, ai_reserve_order_coupon, ai_strip_order_recommendation, ai_touch_updated_at, analytics_consent_dashboard_v1, analytics_dashboard_v3, analytics_finalize_paid_order, analytics_finalize_paid_order_with_benefits, analytics_ingest_event, analytics_overview, analytics_overview_v2, analytics_purge_expired, analytics_record_consent_aggregate, assert_payment_operation_open_v1, auction_winner_cancel, bl_log_order_status, bl_make_product_no, bl_price_grade, bl_set_product_no, bl_touch_order_stamps, bump_quote_view, cancel_unsettled_checkout_v1, capture_legacy_listing_write, catalog_assert_admin, catalog_body_product_ids, catalog_event, catalog_home_assignments_v1, catalog_is_server_context, catalog_sync_home_section, claim_coupon, claim_coupon_by_code, claim_shop_ai_chat, clear_confirmed_payment_review_v1, complete_order_restock_v1, complete_shop_ai_chat, consume_checkout_rate_limit, consume_member_signup_phone_ticket, create_checkout_order, create_checkout_order_edge_v1, create_checkout_order_paid_only_v1, email_for_username, fail_unsettled_order, fill_auction_snapshot, finalize_auction, finalize_member_verification, finalize_order_refund_v2, finalize_paid_order_v2, get_shop_ai_chat_result, get_shop_ai_knowledge, get_shop_ai_runtime_status, grant_ai_personalization_consent, grant_signup_coupons, guard_active_payment_hold_truncate_v1, guard_customer_shipping_address, guard_listing_checkout_eligibility, guard_listing_hard_delete, guard_listing_reservation_owner_v1, guard_new_checkout_claims_v1, guard_order_money_fields, guard_payment_operation_hold_listing_v1, guard_payment_operation_hold_order_v1, guard_profile_delete, handle_new_user, initialize_listing_operational_state, is_active_member_session, is_admin_caller, is_admin_uid, is_payment_operation_hash_held_v1, kst_today_start, lock_privileged_profile_fields, log_shop_ai_turn, make_settlement_on_paid, mark_order_payment_review, mark_order_refund_pending, notify_admin_quote, notify_admins_on_paid_order, notify_customer_on_bid, notify_outbid, notify_support_message, notify_vendors_on_open, notify_wishers_on_auction, order_confirm_receipt, order_create_return, order_request_cancel, order_requires_restock_v1, payment_order_no_sha256_v1, place_auction_bid, popular_products, popular_searches, read_payment_operation_control_v1, recent_page_views_v2, recent_product_views, recent_product_views_v2, reconcile_existing_paid_order_benefits, reconcile_member_delete_events, reconcile_paid_order_benefits, recover_checkout_order_edge_v1, redeem_user_coupon, release_deposits_on_end, release_expired_checkout_reservations, stamp_order_payment_terminal_at_v1, submit_member_onboarding, submit_shop_ai_chat, sync_listing_operational_state_from_payment, sync_listing_state_from_order_v1, telegram_ops_approve_order, telegram_ops_claim_outbox, telegram_ops_close_expired_quotes, telegram_ops_enqueue_source, telegram_ops_enqueue_vendor_bid, telegram_ops_finish_outbox, telegram_ops_new_key, telegram_ops_register_quote_offer, top_paths, touch_user_picks_updated_at, validate_and_apply_bid, validate_shop_ai_response, verify_local_ai_worker, views_by_hour, visits_by_day, wallet_capture, wallet_charge, wallet_refund_request, withdraw_ai_personalization

## Edge Function 정의 20개

admin-audit-events, admin-manage-verification, admin-member-ops, ai-learn, cancel-payment, collect-analytics, complete-otp-signup, confirm-payment, create-checkout, discord-ingest, naverpay-order, notify-vip-kakao, payment-webhook, reconcile-payments, sell-request-access, sync-email-verification, telegram-ops, verify-account, verify-business, verify-identity

## 참조 0 분류

| 계약 | 분류 | 고객 영향 |
| --- | --- | --- |
| `edge:discord-ingest` | 의도적 대안 경로 | GitHub Actions poller가 정본이므로 고객 기능 영향 없음 |
| `edge:payment-webhook` | 외부 진입점 | 결제사 서버가 호출하므로 브라우저 호출부가 없는 것이 정상 |
| `edge:reconcile-payments` | 운영 작업 | 비밀 토큰 기반 정합성 작업이라 고객 화면에서 직접 호출하지 않음 |
| `edge:telegram-ops` | 외부 진입점 | Telegram webhook·cron이 호출하므로 브라우저 호출부가 없는 것이 정상 |
| `rpc:auction_winner_cancel` | 승인 전 보류 기능 | 낙찰 취소·예약금 몰수 UI가 승인되지 않아 고객이 앱에서 취소할 수 없음 |
| `rpc:wallet_capture` | 준비 기능 | 상품 결제에 캐시 사용 입력 계약이 없어 고객이 상품대금에 캐시를 사용할 수 없음 |

## 이번에 복구한 단절

- `submit_member_onboarding`: 업체 회원가입 성공 뒤 승인 대기 제출 시각이 기록되지 않던 문제. `complete-otp-signup` 다음에 인증 사용자 RPC를 호출하도록 연결했다.
- `sell-request-access`: 최신 main에서 `app/bootstrap.js`가 설치하고 판매 폼이 `NWBackend.createSellRequest`를 호출하므로 연결 상태다.

## 운영 적용 선행 조건

- 2026-08-27 운영 REST 스키마 조회에서 `profiles.signup_submitted_at`이 HTTP 400, PostgreSQL `42703`(`column ... does not exist`)을 반환했다.
- 기존 `20260827183000_member_onboarding_lifecycle.sql`이 위 컬럼과 `submit_member_onboarding()`을 함께 정의하므로 새 스키마를 만들지 않는다.
- 적용 순서는 마이그레이션 → `complete-otp-signup` Edge 배포 → 프런트 배포다. 세 단계 전에는 파트너 가입 브랜치를 운영에 병합하지 않는다.
- 적용 후 테스트 파트너 1건에서 `signup_submitted_at is not null`, `approved = false`, 검토 컬럼 3개가 null인지 확인해야 종단 완료다.

전체 호출 위치는 아래 명령으로 현재 파일에서 다시 생성한다.

```powershell
$env:CONTRACT_AUDIT_REPORT='1'; node scripts/test-server-client-contracts.mjs
```
