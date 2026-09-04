import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signupNotificationContext, installSignupNotificationContext } from '../app/services/auth/signup-notification-context.mjs';
import { formatSignupNotice, createSignupNoticeDelivery } from '../supabase/functions/telegram-ops/telegram-signup-notice.mjs';

test('비동의 분석은 식별자와 유입경로를 읽지도 않는다', () => {
  let reads = 0;
  const result = signupNotificationContext({ consent: () => ({ analytics: 'denied', ads: 'denied' }),
    conversionContext() { reads++; throw new Error('must not read'); } });
  assert.deepEqual(result, { analytics: 'denied', ads: 'denied' });
  assert.equal(reads, 0);
});
test('동의된 유입도 클릭 ID와 원문 URL은 보내지 않는다', () => {
  const result = signupNotificationContext({ consent: () => ({ analytics: 'granted', ads: 'denied' }),
    conversionContext: () => ({ first_touch: { utm_source: 'naver', gclid: 'secret', url: 'https://x/?phone=1' },
      session_touch: { channel: 'organic', referrer_host: 'search.naver.com' } }) });
  assert.deepEqual(result.first, { utm_source: 'naver' });
  assert.deepEqual(result.session, { channel: 'organic', referrer_host: 'search.naver.com' });
});
test('비동의 메시지에도 기본 가입정보와 동의 상태가 있다', () => {
  const message = formatSignupNotice({ name: '테스트고객', phone: '01000000000', addr1: '테스트 주소',
    completedAt: '2026-09-04T01:00:00Z', provider: 'kakao', phoneVerified: true,
    context: { analytics: 'denied', ads: 'denied', first: { utm_source: 'should-not-leak' } } });
  assert.match(message, /테스트고객/); assert.match(message, /010-0000-0000/);
  assert.match(message, /가입방법: 카카오/); assert.match(message, /비동의로 미수집/);
  assert.doesNotMatch(message, /should-not-leak/);
});
test('동의한 고객의 유입과 광고 수신 동의를 구분한다', () => {
  const message = formatSignupNotice({ marketingConsent: false,
    context: { analytics: 'granted', ads: 'granted', first: { utm_source: 'naver' } } });
  assert.match(message, /최초 유입: naver/); assert.match(message, /광고성 정보 수신: 비동의/);
});

function deliveryFixture(changes = {}) {
  const calls = [];
  const results = { getChat: { type: 'group' }, getChatMemberCount: 2,
    getChatAdministrators: [{ status: 'creator', user: { id: 42 } }], sendMessage: { message_id: 7 }, ...changes };
  const send = createSignupNoticeDelivery({ token: 'test', chatId: '-1', ownerId: '42',
    telegramWithToken: async (_token, method, body) => { calls.push({ method, body }); return results[method]; } });
  return { send, calls };
}
test('사장님과 봇만 있는 비공개방에 보호 메시지를 보낸다', async () => {
  const { send, calls } = deliveryFixture();
  assert.equal((await send({ name: '테스트' })).message_id, 7);
  assert.equal(calls.at(-1).body.protect_content, true);
});
for (const [name, change, error] of [
  ['공개방', { getChat: { type: 'supergroup', username: 'public_group' } }, /PRIVATE_GROUP/],
  ['다른 구성원 추가', { getChatMemberCount: 3 }, /MEMBERSHIP_CHANGED/],
  ['소유자 변경', { getChatAdministrators: [{ status: 'creator', user: { id: 999 } }] }, /OWNER_CHANGED/],
]) test(`${name}이면 개인정보 전송을 막는다`, async () => {
  const { send, calls } = deliveryFixture(change);
  await assert.rejects(send({}), error);
  assert.equal(calls.filter((call) => call.method === 'sendMessage').length, 0);
});
test('반복 로그인 이벤트는 같은 문맥을 중복 전송하지 않는다', async () => {
  let calls = 0;
  const win = { document: { addEventListener() {} }, addEventListener() {},
    NWBackend: { ready: new Promise(() => {}) },
    BelloreAnalytics: { consent: () => ({ analytics: 'denied', ads: 'pending' }) },
    sbClient: { auth: { getSession: async () => ({ data: { session: { user: { id: 'new' } } } }) },
      rpc: async () => { calls++; return { data: { accepted: true } }; } } };
  const { sync } = installSignupNotificationContext(win);
  await sync(); await sync(); assert.equal(calls, 1);
});

test('전송 도중 동의 철회도 마지막 상태로 다시 반영한다', async () => {
  let consent = 'granted';
  let release;
  const sent = [];
  const win = { document: { addEventListener() {} }, addEventListener() {},
    NWBackend: { ready: new Promise(() => {}) },
    BelloreAnalytics: { consent: () => ({ analytics: consent, ads: 'denied' }) },
    sbClient: { auth: { getSession: async () => ({ data: { session: { user: { id: 'new' } } } }) },
      rpc: async (_name, args) => {
        sent.push(args.p_context.analytics);
        if (sent.length === 1) await new Promise((resolve) => { release = resolve; });
        return { data: { accepted: true } };
      } } };
  const { sync } = installSignupNotificationContext(win);
  const first = sync();
  await new Promise((resolve) => setImmediate(resolve));
  consent = 'denied'; await sync(); release(); await first;
  assert.deepEqual(sent, ['granted', 'denied']);
});
