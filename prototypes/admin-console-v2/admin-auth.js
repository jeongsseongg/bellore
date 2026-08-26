const SUPABASE_URL = 'https://iumsnacuxgssnnbckurq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1bXNuYWN1eGdzc25uYmNrdXJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDQ5ODQsImV4cCI6MjA5NjIyMDk4NH0.lwej8g4YCaiYuoQSXczwRp6ez-X26DD5d1ycMkYwpIk';

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

function getClient() {
  if (!window.supabase?.createClient || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('관리자 인증 설정을 불러오지 못했습니다.');
  }
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'bellore-admin-auth-v1'
    }
  });
}

const client = getClient();

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function setPending(pending) {
  submitButton.disabled = pending;
  submitButton.textContent = pending ? '확인 중' : '로그인';
}

async function getAdminIdentity() {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData?.user) return null;

  const user = userData.user;
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, username, display_name, role, approved, suspended')
    .eq('id', user.id)
    .maybeSingle();

  const tokenRole = user.app_metadata?.role;
  if (profileError || profile?.role !== 'admin' || tokenRole !== 'admin' || profile.suspended || !profile.approved) {
    await client.auth.signOut();
    return null;
  }
  return { user, profile };
}

async function signIn(username, password) {
  const normalized = String(username || '').trim();
  if (!normalized || !password) throw new Error('아이디와 비밀번호를 입력해 주세요.');

  const { data: emailData, error: emailError } = await client.rpc('email_for_username', { uname: normalized });
  if (emailError || !emailData) throw new Error('아이디 또는 비밀번호를 확인해 주세요.');

  const { error: signInError } = await client.auth.signInWithPassword({ email: emailData, password });
  if (signInError) throw new Error('아이디 또는 비밀번호를 확인해 주세요.');

  const identity = await getAdminIdentity();
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
  await client.auth.signOut();
  window.location.replace('/admin/');
}
