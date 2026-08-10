'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const Core = require(path.join(root, 'analytics-core.js'));

function acq(query, referrer) {
  return Core.parseAcquisition('https://bellore.co.kr/' + query, referrer || '', ['bellore.co.kr', 'www.bellore.co.kr']);
}

assert.equal(acq('').channel, 'direct');
assert.equal(acq('?utm_source=naver&utm_medium=cpc').channel, 'naver_paid_search');
assert.equal(acq('?gclid=abc').channel, 'google_paid_search');
assert.equal(acq('', 'https://search.naver.com/search.naver?query=watch').channel, 'naver_organic');
assert.equal(acq('', 'https://blog.naver.com/example').channel, 'naver_blog');
assert.equal(acq('', 'https://www.google.com/search?q=watch').channel, 'google_organic');
assert.equal(acq('', 'https://bellore.co.kr/#home').channel, 'direct');
assert.equal(acq('?utm_source=instagram&utm_medium=paid_social').channel, 'paid_social');

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

const collector = fs.readFileSync(path.join(root, 'supabase/functions/collect-analytics/index.ts'), 'utf8');
assert.match(collector, /ANALYTICS_IP_HASH_KEY/);
assert.match(collector, /crypto\.subtle\.sign\("HMAC"/);
assert.doesNotMatch(collector, /console\.(log|info|warn|error)\([^\n]*ip/i);

const maintenance = fs.readFileSync(path.join(root, '.github/workflows/db-maintenance.yml'), 'utf8');
assert.match(maintenance, /analytics_ingest_event\(jsonb,text,uuid,text,text\)/);
assert.match(maintenance, /legacy_ingest_removed/);

const client = fs.readFileSync(path.join(root, 'analytics-client.js'), 'utf8');
assert.match(client, /더 나은 벨로르 경험을 위해/);
assert.match(client, /IP 원문은 저장하지 않으며, 선택은 언제든 바꿀 수 있어요/);

const confirm = fs.readFileSync(path.join(root, 'supabase/functions/confirm-payment/index.ts'), 'utf8');
assert.match(confirm, /admin\.rpc\("analytics_finalize_paid_order"/);
assert.doesNotMatch(confirm, /\.from\("orders"\)\s*\.update\(\{\s*status:\s*"paid"/);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.doesNotMatch(html, /<script[^>]+googletagmanager\.com\/gtag/i);
assert.doesNotMatch(html, /<script[^>]+wcs\.naver\.net/i);
assert.match(html, /analytics-client\.js/);
assert.match(html, /analytics-client\.js\?v=20260810-consent-copy-v2/);
assert.match(html, /styles\.css\?v=20260810-analytics-dashboard-v4/);
assert.match(html, /script\.js\?v=20260810-analytics-dashboard-v4/);
assert.match(html, /접속 IP 원문은 저장하지 않고/);

console.log('analytics-v3 invariants: ok');
