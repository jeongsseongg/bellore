const SUPABASE_URL = 'https://iumsnacuxgssnnbckurq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bXNuYWN1eGdzc25uYmNrdXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDQ5ODQsImV4cCI6MjA5NjIyMDk4NH0.lwej8g4YCaiYuoQSXczwRp6ez-X26DD5d1ycMkYwpIk';
const STORAGE_KEY = 'bellore-admin-auth-v1';

const startupUrl = new URL(window.location.href);
if (startupUrl.searchParams.has('username') || startupUrl.searchParams.has('password')) {
  startupUrl.searchParams.delete('username');
  startupUrl.searchParams.delete('password');
  window.history.replaceState({}, '', startupUrl);
}

const authRoot = document.getElementById('adminAuth');
const appRoot = document.getElementById('adminApp');
const form = document.getElementById('adminLoginForm');
const usernameInput = document.getElementById('adminLoginId');
const passwordInput = document.getElementById('adminLoginPassword');
const submitButton = document.getElementById('adminLoginButton');
const errorBox = document.getElementById('adminAuthError');

function readSession() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function writeSession(session) {
  if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(STORAGE_KEY);
}

async function requestJson(path, { method = 'GET', body, token } = {}) {
  const response = await window.fetch(`${SUPABASE_URL}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error_description || payload?.msg || payload?.message || '인증 요청에 실패했습니다.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function normalizeSession(payload) {
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(payload.expires_in || 3600),
    user: payload.user
  };
}

async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  try {
    const payload = await requestJson('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token }
    });
    const next = normalizeSession(payload);
    writeSession(next);
    return next;
  } catch {
    writeSession(null);
    return null;
  }
}

async function activeSession(candidate = readSession()) {
  if (!candidate?.access_token) return null;
  if (Number(candidate.expires_at || 0) <= Math.floor(Date.now() / 1000) + 60) {
    return refreshSession(candidate);
  }
  return candidate;
}

async function revokeSession(session) {
  writeSession(null);
  if (!session?.access_token) return;
  try {
    await requestJson('/auth/v1/logout', { method: 'POST', token: session.access_token });
  } catch {
    // 로컬 세션은 이미 제거했으며 서버 만료 실패는 다음 토큰 만료로 제한됩니다.
  }
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function setPending(pending) {
  submitButton.disabled = pending;
  submitButton.textContent = pending ? '확인 중' : '로그인';
}

async function getAdminIdentity(candidate) {
  const session = await activeSession(candidate);
  if (!session) return null;

  try {
    const user = await requestJson('/auth/v1/user', { token: session.access_token });
    const rows = await requestJson(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,username,display_name,role,approved,suspended`, {
      token: session.access_token
    });
    const profile = Array.isArray(rows) ? rows[0] : null;
    const tokenRole = user?.app_metadata?.role;
    if (profile?.role !== 'admin' || tokenRole !== 'admin' || profile.suspended || !profile.approved) {
      await revokeSession(session);
      return null;
    }
    session.user = user;
    writeSession(session);
    return { user, profile, session };
  } catch (error) {
    if (error?.status === 401) {
      const refreshed = await refreshSession(session);
      return refreshed ? getAdminIdentity(refreshed) : null;
    }
    await revokeSession(session);
    return null;
  }
}

async function signIn(username, password) {
  const normalized = String(username || '').trim();
  if (!normalized || !password) throw new Error('아이디와 비밀번호를 입력해 주세요.');

  let email;
  try {
    email = await requestJson('/rest/v1/rpc/email_for_username', {
      method: 'POST',
      body: { uname: normalized }
    });
  } catch {
    throw new Error('아이디 또는 비밀번호를 확인해 주세요.');
  }
  if (!email) throw new Error('아이디 또는 비밀번호를 확인해 주세요.');

  let session;
  try {
    session = normalizeSession(await requestJson('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password }
    }));
  } catch {
    throw new Error('아이디 또는 비밀번호를 확인해 주세요.');
  }

  const identity = await getAdminIdentity(session);
  if (!identity) throw new Error('관리자 권한이 확인되지 않았습니다.');
  return identity;
}

function showApp(identity) {
  const name = identity.profile.display_name || identity.profile.username || '벨로르 관리자';
  const initial = name.trim().slice(0, 1) || '벨';
  document.getElementById('adminProfileName').textContent = name;
  document.getElementById('adminProfileInitial').textContent = initial;
  authRoot.hidden = true;
  appRoot.hidden = false;
  document.documentElement.dataset.adminReady = 'true';
}

export async function requireAdminSession() {
  const existing = await getAdminIdentity();
  if (existing) {
    showApp(existing);
    return existing;
  }

  authRoot.hidden = false;
  appRoot.hidden = true;
  window.setTimeout(() => usernameInput.focus(), 0);

  return new Promise((resolve) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.hidden = true;
      setPending(true);
      try {
        const identity = await signIn(usernameInput.value, passwordInput.value);
        passwordInput.value = '';
        showApp(identity);
        resolve(identity);
      } catch (error) {
        passwordInput.value = '';
        showError(error?.message || '로그인할 수 없습니다.');
      } finally {
        setPending(false);
      }
    });
  });
}

export async function signOutAdmin() {
  await revokeSession(readSession());
  window.location.replace('/admin/');
}
