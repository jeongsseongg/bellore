const logEl = document.getElementById('log');
const writeLog = (...values) => { logEl.textContent += `${values.join(' ')}\n`; };
const setState = (id, state, text) => {
  const element = document.getElementById(id);
  element.className = `row ${state}`;
  if (text) element.lastChild.textContent = text;
};

const config = window.BELLORE_SUPABASE || {};
if (!config.url || !config.anonKey) {
  setState('c-config', 'bad', '설정 없음 (supabase-config.js 확인)');
} else if (!window.supabase?.createClient) {
  setState('c-config', 'ok', `설정 로드 OK — ${config.url}`);
  setState('c-sdk', 'bad', 'SDK 로드 실패');
} else {
  setState('c-config', 'ok', `설정 로드 OK — ${config.url}`);
  setState('c-sdk', 'ok', 'SDK 로드 OK');

  let client;
  try {
    client = window.supabase.createClient(config.url, config.anonKey);
    setState('c-client', 'ok', '클라이언트 생성 OK');
  } catch (error) {
    setState('c-client', 'bad', `클라이언트 생성 실패: ${error.message}`);
  }

  if (client) {
    client.from('listings').select('id,category').limit(1).then((result) => {
      if (result.error) {
        setState('c-read', 'bad', `읽기 실패: ${result.error.message}`);
        writeLog('listings error:', result.error.message);
      } else {
        setState('c-read', 'ok', `읽기 OK (행 ${result.data?.length || 0}개 응답) — 연동 정상 ✅`);
        writeLog('listings ok:', JSON.stringify(result.data));
      }
    });

    const tables = ['profiles', 'listings', 'quote_requests', 'bids', 'community_posts', 'reviews', 'notifications'];
    Promise.all(tables.map((table) => client.from(table).select('*', { count: 'exact', head: true })
      .then((result) => `${table}: ${result.error ? `ERR ${result.error.message}` : 'OK'}`)))
      .then((lines) => {
        const allOk = lines.every((line) => line.includes('OK'));
        setState('c-tables', allOk ? 'ok' : 'bad', allOk ? '전체 테이블 접근 OK' : '일부 테이블 접근 문제(아래 로그)');
        writeLog(`--- tables ---\n${lines.join('\n')}`);
      });

    const showAuth = (session) => {
      if (!session?.user) {
        setState('c-auth', '', '로그인 상태: 로그아웃됨');
        return;
      }
      client.from('profiles').select('role,approved,display_name').eq('id', session.user.id).single().then((profile) => {
        const role = profile.data?.role || '(profiles 행 없음)';
        const admin = role === 'admin';
        setState('c-auth', admin ? 'ok' : 'run', `로그인됨: ${session.user.email} · role=${role}${admin ? ' · 관리자 ✅' : ' · (관리자 아니면 SQL로 role=admin 지정 필요)'}`);
        writeLog('login ok:', session.user.email, 'role=', role);
      });
    };

    client.auth.getSession().then((result) => showAuth(result.data.session));
    client.auth.onAuthStateChange((_event, session) => showAuth(session));
    document.getElementById('btnLogin').addEventListener('click', () => {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('pw').value;
      setState('c-auth', 'run', '로그인 시도 중…');
      client.auth.signInWithPassword({ email, password }).then((result) => {
        if (result.error) {
          setState('c-auth', 'bad', `로그인 실패: ${result.error.message}`);
          writeLog('login error:', result.error.message);
        }
      });
    });
    document.getElementById('btnLogout').addEventListener('click', () => client.auth.signOut());
  }
}
