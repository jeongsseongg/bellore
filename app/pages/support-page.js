function messageTime(value) {
  const date = new Date(Number(value) || Date.now());
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function renderMessages(rows) {
  const list = document.querySelector('#supportChatList');
  if (!list) return;
  list.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'support-chat-empty';
    empty.textContent = '문의 내용을 남겨주시면 상담시간에 순서대로 답변드립니다.';
    list.append(empty);
    return;
  }
  rows.forEach((message) => {
    const bubble = document.createElement('article');
    bubble.className = `support-message${message.role === 'admin' ? '' : ' mine'}`;
    const body = document.createElement('span');
    body.textContent = message.body || '';
    const time = document.createElement('time');
    time.textContent = messageTime(message.createdAtMs);
    bubble.append(body, time);
    list.append(bubble);
  });
  list.scrollTop = list.scrollHeight;
}

function startSupportPage() {
  const backend = window.NWBackend;
  const form = document.querySelector('#supportChatForm');
  const input = document.querySelector('#supportChatInput');
  if (!backend || !form || !input) return;
  const user = backend.currentUser && backend.currentUser();
  if (!user) return;
  const uid = user.uid || user.id;
  const unsubscribe = backend.subscribeSupportThread(uid, renderMessages);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    const button = form.querySelector('button');
    button.disabled = true;
    backend.sendSupportMessage({ threadUser: uid, body }).then(() => {
      input.value = '';
    }).catch((error) => {
      window.alert(`전송 실패: ${error && error.message || error}`);
    }).finally(() => { button.disabled = false; });
  });
  window.addEventListener('pagehide', () => { if (unsubscribe) unsubscribe(); }, { once: true });
}

if (document.body.dataset.standaloneAuthReady === 'true') startSupportPage();
else window.addEventListener('bellore:standalone-ready', startSupportPage, { once: true });
