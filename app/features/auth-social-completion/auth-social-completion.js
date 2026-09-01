import { createSocialAuthService } from '../../services/auth/social-auth-service.js?v=20260902-social-profile-v1';
import { safeReturnPath } from './social-profile-data.mjs?v=20260902-social-profile-v1';
import { socialProgressiveStep } from './social-progressive-flow.mjs?v=20260902-progressive-social-v1';

const params = new URLSearchParams(location.search);
const active = params.get('view') === 'social-complete';
const shell = document.getElementById('socialCompleteShell');

if (active && shell) {
  document.getElementById('authShell').hidden = true;
  document.getElementById('signupShell').hidden = true;
  shell.hidden = false;

  const socialAuth = createSocialAuthService();
  const form = document.getElementById('socialCompleteForm');
  const status = document.getElementById('socialCompleteStatus');
  const verifyButton = document.getElementById('socialIdentityVerify');
  const submitButton = document.getElementById('socialCompleteSubmit');
  const progress = document.getElementById('socialCompleteProgress');
  const title = document.getElementById('socialCompleteTitle');
  let currentUser = null;
  let currentState = null;

  const flow = [
    { id: 'socialNameStep', title: '이름을<br>알려주세요.' },
    { id: 'socialBirthStep', title: '생년월일을<br>알려주세요.' },
    { id: 'socialAddressStep', title: '주소를<br>알려주세요.' },
    { id: 'socialIdentityStep', title: '휴대폰 본인인증을<br>진행해 주세요.' },
    { id: 'socialFinishStep', title: '마지막 내용을<br>확인해 주세요.' },
  ];

  function setStatus(message, type = '') {
    status.textContent = message || '';
    status.className = `signup-status${type ? ` ${type}` : ''}`;
  }

  function input(id) { return document.getElementById(id); }
  function fill(id, value) { const field = input(id); if (field) field.value = value || ''; }

  function updateFlow() {
    const activeIndex = socialProgressiveStep({
      name: input('socialName').value,
      birthDate: input('socialBirthDate').value,
      postcode: input('socialPostcode').value,
      addr1: input('socialAddr1').value,
      identityVerified: currentState?.profile?.phone_verified === true
        && Boolean(currentState.profile.birth_date),
    });
    flow.forEach((step, index) => { document.getElementById(step.id).hidden = index > activeIndex; });
    progress.textContent = `${activeIndex + 1} / ${flow.length}`;
    title.innerHTML = flow[activeIndex].title;
  }

  function returnPath() {
    let stored = '';
    try { stored = sessionStorage.getItem('bellore_auth_return') || ''; } catch { /* storage unavailable */ }
    return safeReturnPath(params.get('returnTo') || stored || '/', location.origin);
  }

  function clearPending() {
    try {
      sessionStorage.removeItem('bellore_social_pending');
      sessionStorage.removeItem('bellore_social_provider');
      sessionStorage.removeItem('bellore_auth_return');
    } catch { /* storage unavailable */ }
  }

  function renderState(state) {
    const data = state.prefill;
    document.getElementById('socialProviderLabel').textContent = `${data.providerLabels.join(' · ')} 로그인`;
    document.getElementById('socialLinkedEmail').textContent = data.email || '이메일 정보 없음';
    fill('socialName', data.name);
    fill('socialBirthDate', data.birthDate);
    fill('socialPhone', data.phone);
    fill('socialPostcode', data.postcode);
    fill('socialAddr1', data.addr1);
    fill('socialAddr2', data.addr2);
    const verified = data.phoneVerified && Boolean(state.profile?.birth_date);
    input('socialName').readOnly = verified;
    input('socialBirthDate').readOnly = verified;
    verifyButton.textContent = verified ? '본인인증 완료' : '휴대폰 본인인증';
    verifyButton.disabled = verified;
    document.getElementById('socialIdentityState').textContent = verified
      ? '✓ 이름·생년월일·휴대폰이 확인되었습니다.'
      : '가져온 정보가 있어도 본인인증 결과로 최종 확정합니다.';
    updateFlow();
  }

  async function reloadState() {
    currentUser = await socialAuth.getUser();
    if (!currentUser) throw new Error('SIGNED_OUT');
    currentState = await socialAuth.loadState(currentUser);
    if (!currentState.required || currentState.complete) {
      clearPending();
      location.replace(returnPath());
      return false;
    }
    renderState(currentState);
    return true;
  }

  async function finishReturnedIdentity() {
    const url = new URL(location.href);
    let storedId = '';
    try { storedId = sessionStorage.getItem('belloreIdentityVerificationId') || ''; } catch { /* storage unavailable */ }
    if (url.searchParams.get('belloreIdentityReturn') !== '1' && !url.searchParams.get('identityVerificationId')) return;
    const identityId = url.searchParams.get('identityVerificationId') || storedId;
    for (const key of ['belloreIdentityReturn', 'identityVerificationId', 'identityVerificationTxId', 'transactionType', 'code', 'message', 'pgCode', 'pgMessage']) {
      url.searchParams.delete(key);
    }
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    if (!identityId) throw new Error('BAD_IDENTITY_ID');
    setStatus('본인인증 결과를 확인하고 있습니다.');
    await socialAuth.completeIdentityVerification(identityId);
    try { sessionStorage.removeItem('belloreIdentityVerificationId'); } catch { /* storage unavailable */ }
  }

  verifyButton.addEventListener('click', async () => {
    verifyButton.disabled = true;
    setStatus('본인인증 화면을 열고 있습니다.');
    try {
      await socialAuth.verifyIdentity();
      await reloadState();
      setStatus('이름·생년월일·휴대폰 확인이 완료되었습니다.', 'ok');
    } catch (error) {
      verifyButton.disabled = false;
      setStatus(window.belloreCustomerMessage?.(error, 'identity') || '본인인증을 완료하지 못했습니다. 다시 시도해 주세요.', 'err');
    }
  });

  input('socialName').addEventListener('input', updateFlow);
  input('socialBirthDate').addEventListener('input', updateFlow);
  input('socialAddr2').addEventListener('input', updateFlow);

  document.getElementById('socialFindAddr').addEventListener('click', () => {
    if (!window.daum?.Postcode) { setStatus('주소 검색을 불러오지 못했습니다.', 'err'); return; }
    new window.daum.Postcode({ oncomplete(data) {
      fill('socialPostcode', data.zonecode || '');
      fill('socialAddr1', data.roadAddress || data.jibunAddress || '');
      updateFlow();
      input('socialAddr2').focus();
    } }).open();
  });

  document.getElementById('socialSignOut').addEventListener('click', async () => {
    await socialAuth.signOut();
    clearPending();
    location.replace('/login.html');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!document.getElementById('socialAgree').checked) { setStatus('이용약관과 개인정보처리방침에 동의해 주세요.', 'err'); return; }
    if (!currentState?.profile?.phone_verified || !currentState.profile.birth_date) { setStatus('휴대폰 본인인증을 먼저 완료해 주세요.', 'err'); return; }
    const values = {
      name: input('socialName').value,
      postcode: input('socialPostcode').value,
      addr1: input('socialAddr1').value,
      addr2: input('socialAddr2').value,
    };
    if (!values.postcode.trim() || !values.addr1.trim()) { setStatus('주소를 입력해 주세요.', 'err'); return; }
    submitButton.disabled = true;
    setStatus('회원 정보를 안전하게 저장하고 있습니다.');
    try {
      await socialAuth.saveSocialProfile({ user: currentUser, state: currentState, values });
      clearPending();
      setStatus('회원가입이 완료되었습니다.', 'ok');
      window.setTimeout(() => location.replace(returnPath()), 500);
    } catch (error) {
      submitButton.disabled = false;
      setStatus(error?.message === 'IDENTITY_VERIFICATION_REQUIRED'
        ? '휴대폰 본인인증을 먼저 완료해 주세요.'
        : '회원가입을 완료하지 못했습니다. 입력 내용을 확인해 주세요.', 'err');
    }
  });

  socialAuth.ready()
    .then(finishReturnedIdentity)
    .then(reloadState)
    .catch((error) => setStatus(error?.message === 'SIGNED_OUT'
      ? '로그인 세션이 만료되었습니다. 다시 로그인해 주세요.'
      : '회원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 'err'));
}
