import { getAuthBackend } from '../../services/auth/auth-login-backend.js';

const backend = getAuthBackend();
const status = document.getElementById('authStatus');
const returnUrl = (() => {
  const requested = new URLSearchParams(location.search).get('return') || '/';
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

const emailForm = document.getElementById('authEmailForm');
const loginId = document.getElementById('authLoginId');
const loginPassword = document.getElementById('authLoginPassword');
const rememberButton = document.getElementById('authRemember');
const passwordToggle = document.getElementById('authPasswordToggle');

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
    await backend.ready;
    await backend[method]();
  } catch (error) {
    button.disabled = false;
    message(error?.message || '로그인을 시작하지 못했습니다.');
  }
}

document.querySelectorAll('[data-provider]').forEach((button) => {
  button.addEventListener('click', () => signIn(button.dataset.provider, button));
});

backend?.ready?.then(() => {
  if (backend.currentUser?.()) location.replace(returnUrl);
});
