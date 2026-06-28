/* Firebase Hosting 오래된 버전 정리 — 저장용량(quota) 초과 방지.
 *
 * 배포할 때마다 옛 버전(릴리스)이 쌓여 무료 Spark 한도를 넘기면 429
 * (RESOURCE_EXHAUSTED)로 새 배포가 막힌다. 이 스크립트가 배포 직전에
 * 최신 KEEP개만 남기고 나머지 FINALIZED 버전 + 실패(미완료) 버전을 지워
 * 용량을 확보한다.
 *
 * 필요 환경변수: FIREBASE_SERVICE_ACCOUNT (서비스 계정 JSON 전체).
 * 없으면 조용히 건너뛴다(로컬/포크 등). 실패해도 배포는 계속되도록
 * 워크플로에서 continue-on-error 로 호출한다.
 */
import crypto from 'crypto';

const SITE = 'newyork-watch';
const KEEP = 5; // 최신 N개 FINALIZED 버전 보존(현재 라이브 포함)

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.hosting',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claim); signer.end();
  const sig = b64url(signer.sign(sa.private_key));
  const jwt = header + '.' + claim + '.' + sig;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('토큰 발급 실패: ' + JSON.stringify(j));
  return j.access_token;
}

async function listVersions(token) {
  const out = [];
  let pageToken = '';
  do {
    const url = 'https://firebasehosting.googleapis.com/v1beta1/sites/' + SITE +
      '/versions?pageSize=100' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    const j = await res.json();
    if (j.error) throw new Error('버전 목록 실패: ' + JSON.stringify(j.error));
    (j.versions || []).forEach(v => out.push(v));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function del(token, name) {
  const res = await fetch('https://firebasehosting.googleapis.com/v1beta1/' + name, {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, msg: res.status + ' ' + t.slice(0, 120) };
  }
  return { ok: true };
}

(async () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { console.log('FIREBASE_SERVICE_ACCOUNT 없음 → prune 건너뜀.'); return; }
  let sa;
  try { sa = JSON.parse(raw); } catch (e) { console.log('서비스계정 JSON 파싱 실패 → prune 건너뜀.'); return; }

  const token = await accessToken(sa);
  const versions = await listVersions(token);
  const alive = versions.filter(v => v.status !== 'DELETED');
  const finalized = alive.filter(v => v.status === 'FINALIZED')
    .sort((a, b) => String(b.createTime).localeCompare(String(a.createTime)));
  const incomplete = alive.filter(v => v.status !== 'FINALIZED'); // CREATED 등 실패/미완료

  const toDelete = incomplete.concat(finalized.slice(KEEP));
  console.log('총 버전 ' + versions.length + ' / 유효 ' + alive.length +
    ' / FINALIZED ' + finalized.length + ' → 삭제 대상 ' + toDelete.length + ' (보존 ' + KEEP + ')');

  let okN = 0, failN = 0;
  for (const v of toDelete) {
    const r = await del(token, v.name);
    if (r.ok) { okN++; } else { failN++; console.log('  삭제 실패 ' + v.name + ' : ' + r.msg); }
  }
  console.log('정리 완료 — 삭제 ' + okN + '건, 실패 ' + failN + '건.');
})().catch(e => { console.log('prune 오류(무시): ' + (e && e.message || e)); process.exitCode = 0; });
