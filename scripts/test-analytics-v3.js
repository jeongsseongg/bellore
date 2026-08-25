'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const Core = require(path.join(root, 'analytics-core.js'));

function acq(query, referrer) {
  return Core.parseAcquisition('https://bellore.co.kr/' + query, referrer || '', ['bellore.co.kr', 'www.bellore.co.kr']);
}

function assertVersionedAsset(document, asset) {
  const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.match(new RegExp(`(?:href|src)=["']${escaped}[?]v=([^"'&\\s>]+)["']`));
  assert.ok(match, `${asset} must have a non-empty cache-buster in index.html`);
  assert.match(match[1], /^[a-z0-9][a-z0-9._-]*$/i, `${asset} cache-buster has an unsafe shape`);
}

assert.equal(acq('').channel, 'direct');
assert.equal(acq('?utm_source=naver&utm_medium=cpc').channel, 'naver_paid_search');
assert.equal(acq('?gclid=abc').channel, 'google_paid_search');
assert.equal(acq('', 'https://search.naver.com/search.naver?query=watch').channel, 'naver_organic');
assert.equal(acq('', 'https://blog.naver.com/example').channel, 'naver_blog');
assert.equal(acq('', 'https://www.google.com/search?q=watch').channel, 'google_organic');
assert.equal(acq('', 'https://bellore.co.kr/#home').channel, 'direct');
assert.equal(acq('?utm_source=instagram&utm_medium=paid_social').channel, 'paid_social');
assert.equal(acq('?n_query=%EB%A1%A4%EB%A0%89%EC%8A%A4&n_keyword=%EB%AA%85%ED%92%88%EC%8B%9C%EA%B3%84&utm_term=watch').n_query, '롤렉스');
assert.equal(acq('?n_query=%EB%A1%A4%EB%A0%89%EC%8A%A4&n_keyword=%EB%AA%85%ED%92%88%EC%8B%9C%EA%B3%84&utm_term=watch').n_keyword, '명품시계');

const pii = acq('?utm_source=naver&utm_medium=cpc&email=a%40b.com&phone=01012345678&token=secret');
assert.equal(pii.email, undefined);
assert.equal(pii.phone, undefined);
assert.equal(pii.token, undefined);
assert.equal(pii.utm_source, 'naver');

assert.equal(Core.sessionExpired(Date.now() - 29 * 60 * 1000, Date.now(), 30 * 60 * 1000), false);
assert.equal(Core.sessionExpired(Date.now() - 31 * 60 * 1000, Date.now(), 30 * 60 * 1000), true);

assert.deepEqual(
  Core.sanitizeProperties('phone_call', { measurement: 'click_intent', phone: '010-1234-5678', text: '전화하기' }),
  { measurement: 'click_intent' }
);
assert.equal(Core.sanitizeProperties('made_up_event', {}), null);

const sql = fs.readFileSync(path.join(root, 'analytics_v3_canonical.sql'), 'utf8');
assert.match(sql, /primary key \(site_id, event_id\)/i);
assert.match(sql, /revoke all on public\.analytics_events from public, anon, authenticated/i);
assert.match(sql, /grant execute on function public\.analytics_ingest_event[\s\S]*to service_role/i);
assert.match(sql, /analytics_finalize_paid_order[\s\S]*analytics_conversion_attributions/i);
assert.match(sql, /attribution_balanced/i);
assert.match(sql, /raw_event_retention_days is not null/i);
assert.match(sql, /ip_hash text/i);
assert.match(sql, /ip_network cidr/i);
assert.match(sql, /set_masklen\(p_ip::inet[\s\S]*24[\s\S]*56/i);
assert.match(sql, /analytics_events_ip_subject_idx/i);
assert.match(sql, /ip_clients/i);
assert.match(sql, /drop function if exists public\.analytics_ingest_event\(jsonb,text,uuid\)/i);
assert.match(sql, /legacy_page_views/i);
assert.match(sql, /'trend'/i);
assert.match(sql, /'hours'/i);
assert.match(sql, /'visitor_types'/i);
assert.match(sql, /'devices'/i);
assert.match(sql, /'top_pages'/i);
assert.match(sql, /'top_products'/i);
assert.match(sql, /'recent_activity'/i);
assert.match(sql, /'keywords'/i);
assert.match(sql, /actual_query/i);
assert.match(sql, /registered_keyword/i);
assert.match(sql, /'source_performance'/i);
assert.match(sql, /create table if not exists public\.analytics_consent_daily/i);
assert.match(sql, /enable row level security[\s\S]*analytics_consent_daily/i);
assert.match(sql, /analytics_record_consent_aggregate/i);
assert.match(sql, /analytics_consent_dashboard_v1/i);
assert.match(sql, /'consent_total'/i);
assert.match(sql, /'consent_groups'/i);
assert.match(sql, /e\.received_at >= v_from[\s\S]*event_name not in/i);

const collector = fs.readFileSync(path.join(root, 'supabase/functions/collect-analytics/index.ts'), 'utf8');
assert.match(collector, /ANALYTICS_IP_HASH_KEY/);
assert.match(collector, /crypto\.subtle\.sign\("HMAC"/);
assert.doesNotMatch(collector, /console\.(log|info|warn|error)\([^\n]*ip/i);
assert.match(collector, /aggregate_only/);
assert.match(collector, /analytics_record_consent_aggregate/);

const maintenance = fs.readFileSync(path.join(root, '.github/workflows/db-maintenance.yml'), 'utf8');
assert.match(maintenance, /analytics_ingest_event\(jsonb,text,uuid,text,text\)/);
assert.match(maintenance, /legacy_ingest_removed/);

const client = fs.readFileSync(path.join(root, 'analytics-client.js'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'supabase.js'), 'utf8');
assert.match(client, /벨로르 AI로, 원하는 시계에 더 가까이/);
assert.match(client, /개인 식별 정보 없이 동의 상태별 방문 숫자만 합산/);
assert.match(client, /필수 기능은 동일하게 이용할 수 있습니다/);
assert.match(client, /data-consent="options"/);
assert.match(client, /data-consent="essential"/);
assert.match(client, /sendConsentAggregate/);
assert.match(client, /aggregate_only:\s*true/);
assert.match(client, /\{ analytics: 'pending', ads: 'pending', policy_version: current \}/,
  'optional analytics and ads remain off while the compact first-visit choice is pending');
assert.match(client, /else showConsent\(false\)/,
  'the compact first-visit choice is shown until a choice is stored');
assert.match(client, /data-consent="all">허용</);
assert.match(client, /data-consent="essential">필수</);
assert.match(client, /class="analytics-consent-more" data-consent="options">상세 설정</);
assert.match(client, /openConsentSettings: function \(\) \{ showConsent\(true\); \}/,
  'privacy settings still allow an explicit opt-in later');
assert.match(backend, /analytics_consent_dashboard_v1/);

const confirm = fs.readFileSync(path.join(root, 'supabase/functions/confirm-payment/index.ts'), 'utf8');
assert.match(confirm, /admin\.rpc\("finalize_paid_order_v2"/);
assert.doesNotMatch(confirm, /\.from\("orders"\)\s*\.update\(\{\s*status:\s*"paid"/);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
assert.doesNotMatch(html, /<script[^>]+googletagmanager\.com\/gtag/i);
assert.doesNotMatch(html, /<script[^>]+wcs\.naver\.net/i);
assert.match(html, /analytics-client\.js/);
assertVersionedAsset(html, 'analytics-client.js');
assertVersionedAsset(html, 'styles.css');
assertVersionedAsset(html, 'script.js');
assert.match(html, /접속 IP 원문은 저장하지 않고/);
assert.match(html, /동의·비동의 및 회원·비회원 구분별 일별 방문 횟수/);
assert.match(html, /첫 방문에는 선택 분석과 광고 측정을 기본 비활성화합니다/);
assert.match(dashboard, /conic-gradient/);
assert.match(dashboard, /저장된 유입 키워드/);
assert.match(dashboard, /어디서 와서 구매했나/);
assert.match(dashboard, /검색엔진 미제공/);
assert.match(dashboard, /상세 행동 기록/);
assert.match(dashboard, /분석 동의 상태별 방문/);
assert.match(dashboard, /비동의 회원/);
assert.match(dashboard, /전체 방문/);

console.log('analytics-v3 invariants: ok');
