import { createSignupVerification } from '../member-verification/signup-verification.js';
import { getAuthSignupBackend } from '../../services/auth/auth-signup-backend.js';

const { backend } = getAuthSignupBackend(window);
const form = document.getElementById('signupForm');
const status = document.getElementById('signupStatus');
const step1 = document.getElementById('signupStep1');
const step2 = document.getElementById('signupStep2');
const step3 = document.getElementById('signupStep3');
const step4 = document.getElementById('signupStep4');
const progress = document.getElementById('signupProgress');
const heading = document.getElementById('signupTitle');
let checkedUsername = '';
const SIGNUP_DRAFT_KEY = 'bellore.signup.draft.v1';
const DRAFT_FIELDS = [
  'suName', 'suUsername', 'suEmail', 'signupPostcode', 'signupAddr1', 'signupAddr2',
  'suPhone', 'suCompany', 'suBizNo', 'suCeo', 'suBizOpen',
];
let currentStep = 1;

function setStatus(message) { if (status) status.textContent = message || ''; }
function fieldValue(id) { return String(document.getElementById(id)?.value || '').trim(); }
function role() { return form.querySelector('[name="role"]:checked')?.value || 'customer'; }
function isBusiness() { return role() === 'vendor'; }
function verificationLive(kind) { return !!window.BELLORE_VERIFY?.[kind === 'biz' ? 'business' : kind]?.enabled; }

const active = new URLSearchParams(location.search).get('view') === 'signup';
document.getElementById('signupShell').hidden = !active;
if (active) document.getElementById('authShell').hidden = true;

function readDraft() {
  try { return JSON.parse(sessionStorage.getItem(SIGNUP_DRAFT_KEY) || '{}'); }
  catch (_) { return {}; }
}

function saveDraft() {
  const fields = Object.fromEntries(DRAFT_FIELDS.map((id) => [id, document.getElementById(id)?.value || '']));
  try {
    sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify({
      fields,
      role: role(),
      agree: document.getElementById('signupAgree').checked,
      adConsent: document.getElementById('signupAdConsent').checked,
    }));
  } catch (_) { /* 저장소 차단 환경에서도 회원가입은 계속 진행한다. */ }
}

function restoreDraft() {
  const draft = readDraft();
  for (const id of DRAFT_FIELDS) {
    const input = document.getElementById(id);
    if (input && typeof draft.fields?.[id] === 'string') input.value = draft.fields[id];
  }
  const roleInput = form.querySelector(`[name="role"][value="${draft.role === 'vendor' ? 'vendor' : 'customer'}"]`);
  if (roleInput) roleInput.checked = true;
  document.getElementById('signupAgree').checked = draft.agree === true;
  document.getElementById('signupAdConsent').checked = draft.adConsent === true;
}

if (active) restoreDraft();

const verification = createSignupVerification({
  document,
  form,
  backend,
  config: window.BELLORE_VERIFY || {},
});

function applyRole() {
  const business = isBusiness();
  document.getElementById('suBizBlock').hidden = !business;
  document.getElementById('signupStep2Hint').textContent = business
    ? '이메일을 확인한 뒤 사업자·계좌 인증을 진행해 주세요.'
    : '이메일 인증을 완료해 주세요.';
  document.getElementById('signupSubmitBtn').textContent = business ? '가입 신청' : '가입 완료';
  verification.reset('biz');
  verification.reset('account');
}

form.querySelectorAll('[name="role"]').forEach((input) => input.addEventListener('change', applyRole));
applyRole();

function showStep(number, { historyMode = 'none' } = {}) {
  currentStep = number;
  step1.hidden = number !== 1;
  step2.hidden = number !== 2;
  step3.hidden = number !== 3;
  step4.hidden = number !== 4;
  progress.textContent = `${number} / 4`;
  heading.innerHTML = [
    '',
    '어떤 회원으로<br>가입할까요?',
    '이름과 휴대폰을<br>확인해 주세요.',
    '본인인증을<br>진행해 주세요.',
    '가입 정보를<br>마무리해 주세요.',
  ][number];
  if (historyMode === 'push') history.pushState({ belloreSignupStep: number }, '', location.href);
  if (historyMode === 'replace') history.replaceState({ ...history.state, belloreSignupStep: number }, '', location.href);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

if (active) {
  const initialStep = [1, 2, 3, 4].includes(Number(history.state?.belloreSignupStep))
    ? Number(history.state.belloreSignupStep) : 1;
  showStep(initialStep, { historyMode: 'replace' });
  window.addEventListener('popstate', (event) => {
    const next = [1, 2, 3, 4].includes(Number(event.state?.belloreSignupStep))
      ? Number(event.state.belloreSignupStep) : 1;
    showStep(next);
  });
  form.addEventListener('input', saveDraft);
  form.addEventListener('change', saveDraft);
}

function setHelp(id, message, type = '') {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.className = type;
}

document.getElementById('suUsername').addEventListener('input', () => {
  checkedUsername = '';
  setHelp('suIdHelp', '중복확인을 눌러 주세요.');
});
document.getElementById('suPw2').addEventListener('input', () => {
  const matches = fieldValue('suPw') === fieldValue('suPw2');
  setHelp('suPw2Help', matches ? '비밀번호가 일치합니다.' : '비밀번호가 일치하지 않습니다.', matches ? 'ok' : 'err');
});

document.getElementById('suIdCheck').addEventListener('click', async (event) => {
  const username = fieldValue('suUsername');
  if (!/^[A-Za-z0-9_]{4,}$/.test(username)) {
    setHelp('suIdHelp', '영문·숫자·밑줄 4자 이상으로 입력해 주세요.', 'err');
    return;
  }
  event.currentTarget.disabled = true;
  setHelp('suIdHelp', '확인 중입니다.');
  try {
    await backend.ready;
    const available = await backend.checkUsername(username);
    checkedUsername = available ? username : '';
    setHelp('suIdHelp', available ? '사용 가능한 아이디입니다.' : '이미 사용 중인 아이디입니다.', available ? 'ok' : 'err');
  } catch (_) {
    checkedUsername = '';
    setHelp('suIdHelp', '중복확인을 완료하지 못했습니다. 다시 시도해 주세요.', 'err');
  } finally {
    event.currentTarget.disabled = false;
  }
});

document.getElementById('signupFindAddr').addEventListener('click', () => {
  if (!window.daum?.Postcode) { setStatus('주소 검색을 불러오지 못했습니다.'); return; }
  new window.daum.Postcode({ oncomplete(data) {
    document.getElementById('signupPostcode').value = data.zonecode || '';
    document.getElementById('signupAddr1').value = data.roadAddress || data.jibunAddress || '';
    document.getElementById('signupAddr2').focus();
  } }).open();
});

document.getElementById('signupNext').addEventListener('click', () => {
  if (!fieldValue('suName')) { setStatus('이름을 입력해 주세요.'); return; }
  if (!verified('phone')) { setStatus('휴대폰 본인인증을 완료해 주세요.'); return; }
  setStatus('');
  saveDraft();
  showStep(3, { historyMode: 'push' });
});

function validateAccountFields() {
  const username = fieldValue('suUsername');
  const password = document.getElementById('suPw').value;
  if (checkedUsername !== username) { setStatus('아이디 중복확인을 완료해 주세요.'); return; }
  if (password.length < 8) { setStatus('비밀번호는 8자 이상이어야 합니다.'); return; }
  if (password !== document.getElementById('suPw2').value) { setStatus('비밀번호가 일치하지 않습니다.'); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fieldValue('suEmail'))) { setStatus('이메일을 정확히 입력해 주세요.'); return; }
  return true;
}
if (active) verification.completeReturnedIdentity()
  .then((handled) => { if (handled) showStep(2, { historyMode: 'replace' }); });
document.getElementById('signupRoleNext').addEventListener('click', () => {
  saveDraft();
  showStep(2, { historyMode: 'push' });
});
document.getElementById('signupInfoPrev').addEventListener('click', () => history.back());
document.getElementById('signupAccountPrev').addEventListener('click', () => history.back());
document.getElementById('signupVerifyNext').addEventListener('click', () => {
  if (!validateAccountFields()) return;
  if (!verified('email')) { setStatus('이메일 인증을 완료해 주세요.'); return; }
  setStatus('');
  saveDraft();
  showStep(4, { historyMode: 'push' });
});
document.getElementById('signupPrev').addEventListener('click', () => {
  if (currentStep > 1 && Number(history.state?.belloreSignupStep) === currentStep) history.back();
  else showStep(Math.max(1, currentStep - 1), { historyMode: 'replace' });
});

function verified(kind) {
  const item = verification.state[kind];
  return verificationLive(kind) ? item?.real === true : item?.nc === true || item?.real === true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validateAccountFields()) return;
  if (!fieldValue('signupPostcode') || !fieldValue('signupAddr1')) { setStatus('주소를 입력해 주세요.'); return; }
  if (!document.getElementById('signupAgree').checked) { setStatus('필수 약관에 동의해 주세요.'); return; }
  const required = isBusiness() ? ['email', 'phone', 'biz', 'account'] : ['email', 'phone'];
  if (required.some((kind) => !verified(kind))) { setStatus('필수 인증을 모두 완료해 주세요.'); return; }
  const submit = document.getElementById('signupSubmitBtn');
  submit.disabled = true;
  setStatus('회원 정보를 안전하게 저장하고 있습니다.');
  const data = new FormData(form);
  try {
    await backend.ready;
    await backend.signUp({
      role: role(), name: fieldValue('suName'), username: fieldValue('suUsername'),
      email: fieldValue('suEmail'), password: document.getElementById('suPw').value,
      phone: fieldValue('suPhone'), phoneVerificationTicket: verification.state.phone.ticket || '',
      postcode: fieldValue('signupPostcode'),
      addr1: fieldValue('signupAddr1'), addr2: fieldValue('signupAddr2'),
      adConsent: document.getElementById('signupAdConsent').checked,
      company: fieldValue('suCompany'), bizName: fieldValue('suCompany'),
      businessNo: fieldValue('suBizNo'), ceoName: fieldValue('suCeo'), bizOpenDate: fieldValue('suBizOpen'),
      bank: fieldValue('suBank'), account: fieldValue('suAccount'), holder: fieldValue('suHolder'),
    });
    try { sessionStorage.removeItem(SIGNUP_DRAFT_KEY); } catch (_) { /* noop */ }
    setStatus(isBusiness() ? '가입 신청이 완료되었습니다. 관리자 승인 후 이용할 수 있습니다.' : '회원가입이 완료되었습니다.');
    window.setTimeout(() => location.replace('/'), 900);
  } catch (error) {
    submit.disabled = false;
    const code = String(error?.code || error?.message || '');
    setStatus(code.includes('already') || code.includes('exists') ? '이미 가입된 이메일입니다.' : '회원가입을 완료하지 못했습니다. 입력 내용과 인증 상태를 확인해 주세요.');
  }
});

backend?.ready?.catch(() => setStatus('회원 기능을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'));
