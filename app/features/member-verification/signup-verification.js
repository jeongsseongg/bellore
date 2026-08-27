export function createSignupVerification({ document, form, backend, config }) {
  const state = {
    phone: { ok: false, real: false, nc: false },
    email: { ok: false, real: false, nc: false, sent: false },
    biz: { ok: false, real: false, nc: false },
    account: { ok: false, real: false, nc: false },
  };
  const fieldKind = {
    suPhone: 'phone', suEmail: 'email', suCompany: 'biz', suBizNo: 'biz',
    suCeo: 'biz', suBizOpen: 'biz', suBank: 'account', suAccount: 'account', suHolder: 'account',
  };
  const softMessage = '준비 중 — 입력만으로 가입 진행됩니다.';

  function customerMessage(error, context, fallback) {
    const message = document.defaultView?.belloreCustomerMessage?.(error, context);
    return message || fallback;
  }

  function displayPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 11 ? digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : digits;
  }

  function syncEmailValue() {
    const email = String(document.getElementById('suEmail')?.value || '').trim();
    const value = form.querySelector('#suEmailVerifyValue');
    if (value) value.textContent = email || '이메일을 확인해 주세요.';
  }

  function isLive(kind) {
    const item = config[kind === 'biz' ? 'business' : kind];
    return !!(item && item.enabled);
  }

  function setState(kind, className, message) {
    const element = form.querySelector(`[data-vstate="${kind}"]`);
    if (!element) return;
    element.textContent = message || '';
    element.className = `vrow-state${className ? ` ${className}` : ''}`;
  }

  function showCode(kind, visible) {
    const row = form.querySelector(`[data-v="${kind}"]`);
    const code = row?.querySelector('.vrow-code');
    if (code) code.hidden = !visible;
  }

  function reset(kind) {
    state[kind] = { ok: false, real: false, nc: false, sent: false };
    setState(kind, '', '');
    if (kind === 'phone' || kind === 'email') showCode(kind, false);
  }

  Object.entries(fieldKind).forEach(([id, kind]) => {
    document.getElementById(id)?.addEventListener('input', () => {
      if (state[kind] && (state[kind].ok || state[kind].real)) reset(kind);
      if (kind === 'email') syncEmailValue();
    });
  });
  syncEmailValue();

  function requireEmailSession(kind, done) {
    if (backend.currentUser && backend.currentUser()) return true;
    setState(kind, 'err', '이메일 인증을 먼저 완료해 주세요.');
    done();
    return false;
  }

  function send(kind, button) {
    const data = new FormData(form);
    button.disabled = true;
    const done = () => { button.disabled = false; };

    if (kind === 'phone') {
      const phone = String(data.get('phone') || '').replace(/\D/g, '');
      if (phone.length < 10) { setState(kind, 'err', '휴대폰 번호를 정확히 입력해주세요.'); done(); return; }
      if (!isLive(kind) || !backend.verifyIdentityPortone) {
        state.phone = { ok: true, real: false, nc: true }; setState(kind, 'ok', softMessage); done(); return;
      }
      if (!requireEmailSession(kind, done)) return;
      setState(kind, '', '본인인증 진행 중…');
      backend.verifyIdentityPortone({ phone })
        .then((result) => {
          const verifiedPhone = displayPhone(result?.phone);
          const input = document.getElementById('suPhone');
          if (verifiedPhone && input) input.value = verifiedPhone;
          state.phone = { ok: true, real: true, nc: false };
          setState(kind, 'ok', '✓ 휴대폰 명의 확인 완료');
        })
        .catch((error) => setState(kind, 'err', customerMessage(error, 'identity', '본인인증을 완료하지 못했습니다. 다시 시도해 주세요.')))
        .then(done);
      return;
    }

    if (kind === 'email') {
      const email = String(data.get('email') || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setState(kind, 'err', '이메일 형식을 확인해주세요.'); done(); return; }
      if (!isLive(kind) || !backend.sendEmailOtp) {
        state.email = { ok: true, real: false, nc: true, sent: false }; setState(kind, 'ok', softMessage); done(); return;
      }
      setState(kind, '', '인증번호 발송 중…');
      backend.sendEmailOtp(email, { shouldCreateUser: true })
        .then(() => { state.email.sent = true; showCode(kind, true); setState(kind, '', '메일로 받은 인증번호를 입력하세요.'); })
        .catch((error) => setState(kind, 'err', customerMessage(error, 'auth', '인증번호를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.')))
        .then(done);
      return;
    }

    if (kind === 'biz') {
      const businessNo = String(data.get('businessNo') || '').replace(/\D/g, '');
      const representative = String(data.get('ceoName') || '').trim();
      const openDate = String(data.get('bizOpenDate') || '').replace(/\D/g, '');
      if (!String(data.get('company') || '').trim()) { setState(kind, 'err', '상호를 입력해주세요.'); done(); return; }
      if (businessNo.length !== 10) { setState(kind, 'err', '사업자등록번호 10자리를 입력해주세요.'); done(); return; }
      if (!representative) { setState(kind, 'err', '대표자명을 입력해주세요.'); done(); return; }
      if (openDate.length !== 8) { setState(kind, 'err', '개업일을 YYYYMMDD로 입력해주세요.'); done(); return; }
      if (!isLive(kind) || !backend.verifyBusinessData) {
        state.biz = { ok: true, real: false, nc: true }; setState(kind, 'ok', softMessage); done(); return;
      }
      if (!requireEmailSession(kind, done)) return;
      setState(kind, '', '국세청 진위확인 중…');
      backend.verifyBusinessData({ businessNo, ceoName: representative, bizOpenDate: openDate })
        .then(() => { state.biz = { ok: true, real: true, nc: false }; setState(kind, 'ok', '✓ 사업자 인증 완료'); })
        .catch(() => setState(kind, 'err', '인증 실패 — 상호·사업자번호·대표자·개업일을 확인해주세요.'))
        .then(done);
      return;
    }

    const bank = String(data.get('bank') || '').trim();
    const account = String(data.get('account') || '').replace(/\D/g, '');
    const holder = String(data.get('holder') || '').trim();
    if (!bank || !account || !holder) { setState(kind, 'err', '은행·계좌번호·예금주를 입력해주세요.'); done(); return; }
    if (!isLive(kind) || !backend.verifyAccountData) {
      state.account = { ok: true, real: false, nc: true }; setState(kind, 'ok', softMessage); done(); return;
    }
    if (!requireEmailSession(kind, done)) return;
    setState(kind, '', '계좌 실명조회 중…');
    backend.verifyAccountData({ bank, account, holder })
      .then(() => { state.account = { ok: true, real: true, nc: false }; setState(kind, 'ok', '✓ 계좌 인증 완료'); })
      .catch(() => setState(kind, 'err', '예금주가 일치하지 않습니다. 다시 확인해주세요.'))
      .then(done);
  }

  function confirm(kind, button) {
    if (kind !== 'email') return;
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const code = String(document.getElementById('suEmailCode')?.value || '').trim();
    if (!code) { setState(kind, 'err', '인증번호를 입력해주세요.'); return; }
    if (!backend.verifyEmailOtp) { setState(kind, 'err', '인증을 사용할 수 없습니다.'); return; }
    button.disabled = true;
    setState(kind, '', '인증번호 확인 중…');
    backend.verifyEmailOtp(email, code)
      .then(() => { state.email = { ok: true, real: true, nc: false, sent: true }; showCode(kind, false); setState(kind, 'ok', '✓ 이메일 인증 완료'); })
      .catch((error) => setState(kind, 'err', customerMessage(error, 'auth', '인증번호가 올바르지 않거나 만료되었습니다.')))
      .then(() => { button.disabled = false; });
  }

  form.addEventListener('click', (event) => {
    const sendButton = event.target.closest('[data-vsend]');
    const confirmButton = event.target.closest('[data-vconfirm]');
    if (sendButton) { event.preventDefault(); send(sendButton.dataset.vsend, sendButton); }
    else if (confirmButton) { event.preventDefault(); confirm(confirmButton.dataset.vconfirm, confirmButton); }
  });

  return { state, isLive, reset };
}
