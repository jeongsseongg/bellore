const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-method.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const moduleJs = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-method.js'), 'utf8');
const draftOwnerJs = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-draft-owner.js'), 'utf8');
const referenceJs = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-reference-controller.js'), 'utf8');
const quoteJs = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-quote-controller.js'), 'utf8');
const quoteCss = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-quotes.css'), 'utf8');
const serviceJs = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-service-pages.js'), 'utf8');
const serviceCss = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-service-pages.css'), 'utf8');
const serviceActionCss = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-service-action.css'), 'utf8');
const serviceNavigationCss = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-service-navigation.css'), 'utf8');
const guestCss = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-guest-access.css'), 'utf8');
const guestJs = fs.readFileSync(path.join(root, 'app/features/sell-method/sell-guest-access.js'), 'utf8');
const backendJs = fs.readFileSync(path.join(root, 'app/services/sell/sell-request-access.js'), 'utf8');
const bootstrapJs = fs.readFileSync(path.join(root, 'app/bootstrap.js'), 'utf8');
const guestEdge = fs.readFileSync(path.join(root, 'supabase/functions/sell-request-access/index.ts'), 'utf8');
const guestMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20260826234000_sell_request_guest_access.sql'), 'utf8');

const sheetRule = css.match(/\.sell-method__sheet\s*\{([\s\S]*?)\}/)?.[1] || '';

assert.match(sheetRule, /width:\s*100%\s*;/, 'sell sheet fills only the current Bellore frame');
assert.match(
  sheetRule,
  /max-width:\s*var\(--app-panel-w,\s*660px\)\s*;/,
  'sell sheet inherits the fixed 660px Bellore panel token'
);
assert.doesNotMatch(sheetRule, /720px/, 'sell sheet must never use the out-of-spec 720px width');
assert.match(
  html,
  /sell-method\.css\?v=20260826-sell-motion-v2/,
  'the page requests the panel-width-corrected stylesheet'
);
assert.match(sheetRule, /transform:\s*translateY\(104%\)/, 'the closed sheet starts below the Bellore frame');
assert.match(sheetRule, /transition:\s*transform 1600ms/, 'the sheet uses the approved slower open and close duration');
assert.match(moduleJs, /\}, 1600\);/, 'the sheet remains mounted until the slower close animation completes');
assert.doesNotMatch(html, /class="compare-entry"/, 'the superseded sell landing page is removed');
assert.match(css, /\.sell-method__card\s*\{[\s\S]*?min-height:\s*350px/, 'method cards use the restored original height');
assert.match(css, /\.sell-method__visual\s*\{[\s\S]*?width:\s*180px;[\s\S]*?height:\s*150px/, 'method images use the enlarged desktop size');
assert.match(css, /\.sell-method__instant\s*\{[\s\S]*?min-height:\s*106px/, 'instant purchase action is 20% taller');
assert.doesNotMatch(html, /sell-method__instant-copy[^>]*>[\s\S]*?<small>/, 'instant purchase has no descriptive copy');
assert.match(html, /id="sellMethodFormMount"/, 'all sell forms mount inside the fixed-width sheet');
assert.match(html, /id="sellMethodResume"/, 'the sheet exposes a saved-draft resume action');
assert.match(html, /작성 중인 양식을 나갈까요\?/, 'the sheet contains the same-design leave confirmation');
assert.match(
  moduleJs,
  /indexedDB\.open\(DB_NAME, 1\)/,
  'sell drafts persist across page navigation with IndexedDB'
);
assert.doesNotMatch(script, /var VALID = \[[^\]]*'compare'/, 'the retired compare page is no longer routable');
assert.match(
  moduleJs,
  /if \(oldPage\) oldPage\.remove\(\)/,
  'the retired compare page is removed after its form is mounted in the sheet'
);
assert.match(moduleJs, /visibilitychange/, 'switching tabs or windows immediately flushes the current draft');
assert.match(moduleJs, /pagehide/, 'leaving the document flushes the current draft when possible');
assert.match(html, /id="sellGuidedFlow"/, 'the form starts with guided brand and model selection');
assert.match(html, /id="sellDirectEntry">직접입력/, 'the guided form exposes the requested direct-entry action');
assert.match(moduleJs, /ACCESSORY_QUESTIONS/, 'accessories are collected as sequential questions');
assert.match(moduleJs, /window\.BELLORE_BRANDS/, 'brand previews use the canonical Bellore brand source');
assert.match(moduleJs, /FALLBACK_BRANDS/, 'major brand logos remain available when the legacy global is unavailable');
assert.match(html, /구성품 이미지\/ChatGPT Image 2026년 8월 26일 오전 11_18_56 \(1\)\.png/, 'the new accessory artwork replaces emoji icons');
assert.match(css, /\.sell-guide__question-visual img\s*\{[\s\S]*?height:\s*160px/, 'guided accessory artwork stays fully visible');
assert.match(css, /\.sell-guide__suggestions\s*\{[\s\S]*?max-height:\s*234px;[\s\S]*?overflow-y:\s*auto/, 'brand preview shows six cards and scrolls the complete list');
assert.match(css, /\.sell-guide__suggestions--models\s*\{[\s\S]*?max-height:\s*186px/, 'model preview shows three rows and scrolls the complete list');
assert.doesNotMatch(moduleJs, /matches = [^;]+\.slice\(0, 8\)/, 'guided previews no longer truncate the available options');
assert.match(html, /id="sellGuideDetails"/, 'reference and stamping/year are collected before accessory questions');
assert.match(html, /스탬핑\/연식/, 'the purchase timing field uses the approved stamping/year label');
assert.match(html, /assets\/cq-guide\/front\.jpg/, 'the guided detail page uses the supplied photo examples');
assert.match(css, /\.sell-method__form-mount\.is-guided-details[\s\S]*?#sellWatchInfoBlock/, 'the second guided page hides already-completed watch fields');
assert.match(moduleJs, /stage:\s*entryMode,\s*guideComplete/, 'the completed guided stage is persisted with the draft');
assert.match(referenceJs, /subscribeProducts/, 'reference previews use the live Bellore listing catalog');
assert.match(referenceJs, /function render\(/, 'reference previews are filtered after brand and model selection');
assert.match(quoteCss, /\.sell-guide__preview--text/, 'reference and year rows do not render circular initials');
assert.match(quoteCss, /\.sell-method__quote-status\s*\{\s*display:\s*none/, 'the old inline quote status card stays hidden');
assert.match(quoteJs, /data-sell-view="quotes"/, 'quote details stay inside the fixed sell sheet');
assert.match(quoteJs, /방문거래[\s\S]*택배거래[\s\S]*퀵거래/, 'a customer can select all three requested transaction methods');
assert.match(script, /act:\s*'quotes',\s*label:\s*'내 비교견적'/, 'customer My Page links back to the sell quote sheet');
assert.match(quoteJs, /awardBid\(quoteId, bidId,[\s\S]*tradeMethod\)/, 'sale requests persist the selected quote and transaction method');
assert.match(quoteJs, /seconds[\s\S]*초/, 'active quote countdown includes seconds');
assert.doesNotMatch(quoteJs, /vendor_name/, 'customer bid cards do not expose vendor names');
assert.match(quoteCss, /\.sell-quotes__bid b\s*\{\s*color:\s*#176fb8/, 'customer quote amounts use the requested blue emphasis');
assert.doesNotMatch(html, />\s*온라인\s*·\s*비교견적/, 'quote status does not spell out online as Korean copy');
assert.match(quoteCss, /@keyframes sell-online-pulse/, 'active quote status uses the requested online pulse animation');
assert.match(serviceJs, /id=\\?"sellServiceNoticeToggle/, 'active applications live in the top-right notification menu');
assert.ok(serviceJs.includes('list.before(draftResume)'), 'saved drafts live only in the top-right notification menu');
assert.match(serviceJs, /visible\.length \+ draftCount/, 'the notification badge counts both drafts and active applications');
assert.match(serviceJs, /MutationObserver\(renderNotice\)/, 'draft save and removal refresh the notification badge immediately');
assert.match(serviceJs, /data-sell-view=\\?"service/, 'service applications open a dedicated page inside the Bellore sheet');
assert.match(serviceJs, /data-service-page="compare"/, 'comparison estimates have a dedicated quote page');
assert.match(serviceJs, /data-service-page="consignment"/, 'consignment has a dedicated offer and fee page');
assert.match(serviceJs, /data-service-page="instant"/, 'instant purchase has a dedicated appraisal and deduction page');
assert.match(serviceJs, /0\.07[\s\S]*판매 수수료/, 'consignment page calculates and explains the seven-percent fee');
assert.match(serviceJs, /감가 사유/, 'instant purchase exposes itemized depreciation reasons');
assert.match(serviceJs, /awardBid\(record\.id, selectedBidId/, 'the unified comparison page keeps the server award path');
for (const image of ['방문거래.png', '택배거래.png', '퀵거래.png']) {
  assert.match(serviceJs, new RegExp(`assets/sell/trade/${image}`), `${image} is connected to its transaction method`);
}
assert.match(serviceActionCss, /max-width:\s*var\(--app-panel-w,\s*660px\)/, 'nested transaction popup inherits the 660px panel token');
assert.match(serviceActionCss, /\.sell-service-action__methods img[\s\S]*?object-fit:\s*cover/, 'transaction artwork fills the compact method cards');
assert.match(serviceCss, /\.sell-service__status--blue[\s\S]*?#eef6ff/, 'all service status cards use the common blue surface');
assert.doesNotMatch(serviceCss, /#(?:fff7ed|fff5e9|a95f12|a85d10|efd7b9)/i, 'gold and orange accents cannot return to sell service pages');
assert.doesNotMatch(script, /saleMethod === 'consignment' && !desiredPrice/, 'consignment no longer asks the customer to choose a price first');
assert.match(script, /NWBackend\.createSellRequest/, 'all three sell methods use the server request path');
assert.match(script, /NWBackend\.createSellRequest\([\s\S]*?\.then\(function \(result\) \{[\s\S]*?sendAdminLead\(\)/, 'the supplemental inquiry is sent only after the durable server request succeeds');
assert.match(draftOwnerJs, /'member:' \+ member\.uid/, 'member drafts are scoped by the authenticated member id');
assert.match(draftOwnerJs, /'guest:' \+ guestId/, 'guest drafts are scoped by a random browser owner id instead of IP');
assert.match(guestJs, /id=\\?"sellGuestAccessToggle/, 'a guest access icon sits beside the sell notification control');
assert.match(guestJs, /verifyGuestSellRequest/, 'guest lookup requires the phone identity verification flow');
assert.match(guestCss, /\.sell-method__guest-toggle/, 'guest access uses the shared sell panel styling');
assert.match(backendJs, /action: 'verify-phone'/, 'the client sends the PortOne result to the server for verification');
assert.match(
  bootstrapJs,
  /installSellRequestAccess\(\{[\s\S]*?backend:\s*window\.NWBackend,[\s\S]*?getClient:\s*\(\)\s*=>\s*window\.sbClient,[\s\S]*?window,[\s\S]*?\}\);/,
  'the sell request client receives the live backend and Supabase client instead of silently skipping installation'
);
assert.match(html, /app\/bootstrap\.js\?v=20260827-sell-request-persistence-v1/, 'the repaired bootstrap bypasses the previous browser cache key');
assert.match(guestEdge, /validatePortOneIdentity/, 'the Edge Function validates the provider response server-side');
assert.match(guestEdge, /token_kind", "link"/, 'security links are exchanged through a one-time link token');
assert.match(guestMigration, /revoke all on table public\.sell_service_requests from anon, authenticated/i, 'guest records have no direct Data API access');
assert.match(guestMigration, /auth\.uid\(\).*owner_user_id/i, 'member records are protected by an ownership RLS policy');

console.log('sell method sheet width invariants: ok');
