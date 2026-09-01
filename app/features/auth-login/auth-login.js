import { getAuthBackend } from '../../services/auth/auth-login-backend.js';
import { createSocialAuthService } from '../../services/auth/social-auth-service.js?v=20260902-social-profile-v1';
import { safeReturnPath } from '../auth-social-completion/social-profile-data.mjs?v=20260902-social-profile-v1';

const backend = getAuthBackend();
const socialAuth = createSocialAuthService();
const status = document.getElementById('authStatus');
const params = new URLSearchParams(location.search);
const view = params.get('view') || 'login';

function pendingSocialReturn() {
  try {
    if (sessionStorage.getItem('bellore_social_pending') !== '1') return '';
    return sessionStorage.getItem('bellore_auth_return') || '';
  } catch (_) {
    return '';
  }
}

function clearSocialReturn() {
  try {
    sessionStorage.removeItem('bellore_social_pending');
    sessionStorage.removeItem('bellore_auth_return');
    sessionStorage.removeItem('bellore_social_provider');
  } catch (_) {}
}

function pendingSocialProvider() {
  try {
    return sessionStorage.getItem('bellore_social_provider') || '';
  } catch (_) {
    return '';
  }
}

const returnUrl = (() => {
  const requested = params.get('returnTo') || params.get('return') || pendingSocialReturn() || '/';
  try {
    const target = new URL(requested, location.origin);
    return target.origin === location.origin ? target.pathname + target.search + target.hash : '/';
  } catch (_) {
    return '/';
  }
})();

function message(text) {
  if (status) status.textContent = text || '';
}

function socialErrorMessage() {
  const error = params.get('error') || params.get('error_code');
  if (!error) return '';
  const provider = pendingSocialProvider();
  const providerName = provider === 'naver' ? '네이버' : provider === 'kakao' ? '카카오' : '소셜';
  if (error === 'access_denied') return `${providerName} 로그인이 취소되었습니다.`;
  return `${providerName} 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.`;
}

const emailForm = document.getElementById('authEmailForm');
const loginId = document.getElementById('authLoginId');
const loginPassword = document.getElementById('authLoginPassword');
const rememberButton = document.getElementById('authRemember');
const passwordToggle = document.getElementById('authPasswordToggle');
const passwordField = loginPassword?.closest('.auth-field');
const submitButton = emailForm?.querySelector('.auth-submit');

if (view === 'find-password') {
  if (loginId) loginId.placeholder = '가입 이메일';
  if (passwordField) passwordField.hidden = true;
  if (submitButton) submitButton.textContent = '비밀번호 재설정 메일 받기';
  message('가입한 이메일로 비밀번호 재설정 안내를 보내드립니다.');
} else if (view === 'find-id') {
  if (loginId) loginId.placeholder = '가입 이메일';
  if (passwordField) passwordField.hidden = true;
  if (submitButton) submitButton.textContent = '아이디 안내 확인';
  message('가입 이메일은 로그인 아이디로 바로 사용할 수 있습니다.');
}

const socialError = socialErrorMessage();
if (socialError) {
  message(socialError);
  clearSocialReturn();
  for (const key of ['error', 'error_code', 'error_description', 'error_id']) params.delete(key);
  const cleanSearch = params.toString();
  history.replaceState(null, '', `${location.pathname}${cleanSearch ? `?${cleanSearch}` : ''}${location.hash}`);
}

try {
  const remembered = localStorage.getItem('bellore_saved_id') || '';
  if (remembered && loginId) {
    loginId.value = remembered;
    rememberButton?.setAttribute('aria-pressed', 'true');
  }
} catch (_) {}

rememberButton?.addEventListener('click', () => {
  const pressed = rememberButton.getAttribute('aria-pressed') === 'true';
  rememberButton.setAttribute('aria-pressed', String(!pressed));
});

passwordToggle?.addEventListener('click', () => {
  const reveal = loginPassword?.type === 'password';
  if (loginPassword) loginPassword.type = reveal ? 'text' : 'password';
  passwordToggle.setAttribute('aria-label', reveal ? '비밀번호 숨기기' : '비밀번호 표시');
});

emailForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!backend?.signIn) {
    message('로그인 기능을 불러오지 못했습니다.');
    return;
  }
  const idOrEmail = loginId?.value.trim() || '';
  const password = loginPassword?.value || '';
  if (view === 'find-id') {
    message(idOrEmail.includes('@') ? '입력한 이메일로 로그인할 수 있습니다. 별도 아이디 확인은 고객센터에 문의해 주세요.' : '가입 이메일을 입력해 주세요.');
    return;
  }
  if (view === 'find-password') {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(idOrEmail)) { message('가입 이메일을 정확히 입력해 주세요.'); return; }
    submitButton.disabled = true;
    message('재설정 메일을 보내고 있습니다.');
    try {
      await backend.ready;
      await backend.resetPassword(idOrEmail);
      message('비밀번호 재설정 메일을 보냈습니다. 메일함을 확인해 주세요.');
    } catch (_) {
      submitButton.disabled = false;
      message('재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    return;
  }
  if (!idOrEmail || !password) {
    message('아이디 또는 이메일과 비밀번호를 입력해 주세요.');
    return;
  }
  const submit = emailForm.querySelector('.auth-submit');
  submit.disabled = true;
  message('로그인 중입니다.');
  try {
    await backend.ready;
    await backend.signIn({ idOrEmail, password });
    try {
      if (rememberButton?.getAttribute('aria-pressed') === 'true') localStorage.setItem('bellore_saved_id', idOrEmail);
      else localStorage.removeItem('bellore_saved_id');
    } catch (_) {}
    clearSocialReturn();
    location.replace(returnUrl);
  } catch (error) {
    submit.disabled = false;
    message(error?.message === 'USER_NOT_FOUND' ? '등록된 계정을 찾을 수 없습니다.' : '아이디 또는 비밀번호를 확인해 주세요.');
  }
});

async function signIn(provider, button) {
  const method = {
    google: 'signInWithGoogle',
    kakao: 'signInWithKakao',
    naver: 'signInWithNaver',
  }[provider];
  if (!backend || !method || typeof backend[method] !== 'function') {
    message('로그인 연동을 준비하고 있습니다.');
    return;
  }
  button.disabled = true;
  message('로그인 화면으로 이동합니다.');
  try {
    sessionStorage.setItem('bellore_social_pending', '1');
    sessionStorage.setItem('bellore_auth_return', returnUrl);
    sessionStorage.setItem('bellore_social_provider', provider);
    await backend.ready;
    await backend[method]();
  } catch (error) {
    clearSocialReturn();
    button.disabled = false;
    message(error?.message || '로그인을 시작하지 못했습니다.');
  }
}

document.querySelectorAll('[data-provider]').forEach((button) => {
  button.addEventListener('click', () => signIn(button.dataset.provider, button));
});

backend?.ready?.then(() => {
  const current = backend.currentUser?.();
  if (!current) return;
  return socialAuth.loadSocialProfileState().then(async (currentSocial) => {
    if (!currentSocial) return;
    const { state } = currentSocial;
    if (state.required && !state.complete) {
      if (view !== 'social-complete') {
        const target = new URL('/login.html', location.origin);
        target.searchParams.set('view', 'social-complete');
        target.searchParams.set('returnTo', safeReturnPath(returnUrl, location.origin));
        location.replace(`${target.pathname}${target.search}`);
      }
      return;
    }
    clearSocialReturn();
    location.replace(returnUrl);
  });
}).catch(() => {
  if (view === 'social-complete') message('회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
});
