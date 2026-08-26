export function createAdminAccountService(client, operatorId) {
  function listProfiles(role = '') {
    return client.list('profiles', {
      select: '*', ...(role ? { role: `eq.${role}` } : {}), order: 'created_at.desc', limit: 500
    });
  }

  function updateProfile(id, patch) {
    return client.update('profiles', { id: `eq.${id}` }, patch);
  }

  function notification(userId, type, body) {
    return client.insert('notifications', {
      user_id: userId, type, title: '알림', body, is_read: false
    });
  }

  async function saveProfile(item, role, patch) {
    const next = { ...patch };
    const rows = await updateProfile(item.id, next);
    const notices = [];
    if (next.approved && !item.approved && role === 'vendor') {
      notices.push(notification(item.id, 'approved', '업체 승인이 완료되었습니다. 이제 비교견적 입찰에 참여할 수 있어요.'));
    }
    if (next.approved && !item.approved && role === 'partner') {
      notices.push(notification(item.id, 'approved', '공급협력사 승인이 완료되었습니다. 이제 벨로르에 공급할 상품을 등록할 수 있어요.'));
    }
    if (notices.length) {
      const results = await Promise.allSettled(notices);
      results.filter((result) => result.status === 'rejected').forEach((result) => {
        console.warn('프로필 변경은 완료됐지만 앱 알림 저장은 실패했습니다.', result.reason);
      });
    }
    return rows;
  }

  async function manageMember(id, action, reason = '') {
    const result = await client.edge('admin-member-ops', { targetUserId: id, action, reason: reason || null });
    if (result?.warning) console.warn('회원 작업은 반영됐지만 후속 기록 확인이 필요합니다.', result.warning);
    return result;
  }

  function setMemberSuspended(id, suspended) {
    return manageMember(id, suspended ? 'suspend' : 'resume');
  }

  function deleteMember(id, reason = '') {
    return manageMember(id, 'delete', reason);
  }

  function listAuditEvents(limit = 100) {
    return client.edge('admin-audit-events', { limit });
  }

  function getMemberVerification(id) {
    return client.edge('admin-manage-verification', { action: 'get_status', targetUserId: id });
  }

  function listMemberVerificationEvents(id, limit = 30) {
    return client.edge('admin-manage-verification', { action: 'list_events', targetUserId: id, limit });
  }

  function setMemberVerification(id, method, verified, reason) {
    return client.edge('admin-manage-verification', {
      action: 'set_status', targetUserId: id, method, verified: !!verified, reason
    });
  }

  function listSettlements() {
    return client.list('settlements', { select: '*', order: 'created_at.desc', limit: 500 });
  }

  async function updateSettlement(item, status, memo) {
    const rows = await client.update('settlements', { id: `eq.${item.id}` }, {
      status, memo: memo || null, ...(status === 'paid' ? { paid_at: new Date().toISOString() } : {})
    });
    if (status === 'paid' && item.status !== 'paid' && item.seller_id) {
      notification(item.seller_id, 'settlement', `공급대금 ${Number(item.net_amount || 0).toLocaleString('ko-KR')}원이 입금 처리되었습니다.`)
        .catch((error) => console.warn('정산 변경은 완료됐지만 앱 알림 저장은 실패했습니다.', error));
    }
    return rows;
  }

  async function listSupportThreads() {
    const messages = await client.list('support_messages', { select: '*', order: 'created_at.desc', limit: 800 });
    const threads = new Map();
    messages.forEach((message) => {
      const key = String(message.thread_user);
      const existing = threads.get(key) || { user: key, last: message, count: 0, messages: [] };
      existing.count += 1;
      existing.messages.push(message);
      threads.set(key, existing);
    });
    return [...threads.values()];
  }

  function replySupport(threadUser, body, refQuote = null) {
    return client.insert('support_messages', {
      thread_user: threadUser,
      sender_role: 'admin',
      sender_id: operatorId,
      body,
      ...(refQuote ? { ref_quote: refQuote } : {})
    });
  }

  async function loadAnalytics(days = 7) {
    const [dashboard, consent, recentProducts, recentPages] = await Promise.all([
      client.rpc('analytics_dashboard_v3', { p_days: Number(days) || 7 }).catch(() => null),
      client.rpc('analytics_consent_dashboard_v1', { p_days: Number(days) || 7 }).catch(() => null),
      client.rpc('recent_product_views_v2', { lim: 30, off: 0 }).catch(() => []),
      client.rpc('recent_page_views_v2', { lim: 30, off: 0 }).catch(() => [])
    ]);
    return { dashboard, consent, recentProducts, recentPages };
  }

  async function loadAdvisor() {
    const [runtime, profiles, conversations, alerts, knowledge, prices, team, guidelines] = await Promise.all([
      client.rpc('get_shop_ai_runtime_status').catch(() => null),
      client.list('customer_ai_profiles', { select: '*', order: 'updated_at.desc', limit: 200 }).catch(() => []),
      client.list('ai_conversations', { select: '*', order: 'created_at.desc', limit: 200 }).catch(() => []),
      client.list('ai_alert_candidates', { select: '*', order: 'created_at.desc', limit: 200 }).catch(() => []),
      client.list('expert_knowledge_notes', { select: '*', order: 'updated_at.desc', limit: 200 }).catch(() => []),
      client.list('watch_market_prices', { select: '*', order: 'scraped_at.desc', limit: 500 }).catch(() => []),
      client.list('team_messages', { select: '*', order: 'created_at.desc', limit: 200 }).catch(() => []),
      client.list('ai_response_guidelines', { select: '*', order: 'priority.asc', limit: 200 }).catch(() => [])
    ]);
    return { runtime, profiles, conversations, alerts, knowledge, prices, team, guidelines };
  }

  function updateAdvisor(table, id, patch) {
    return client.update(table, { id: `eq.${id}` }, patch);
  }

  function deleteAdvisor(table, id) {
    return client.remove(table, { id: `eq.${id}` });
  }

  function listNotifications() {
    return client.list('notifications', { select: '*', order: 'created_at.desc', limit: 500 }).catch(() => []);
  }

  function updateNotification(id, patch) {
    return client.update('notifications', { id: `eq.${id}` }, patch);
  }

  function deleteNotification(id) {
    return client.remove('notifications', { id: `eq.${id}` });
  }

  return {
    listProfiles, updateProfile, saveProfile, setMemberSuspended, deleteMember,
    getMemberVerification, listMemberVerificationEvents, setMemberVerification, listAuditEvents, listSettlements, updateSettlement,
    listSupportThreads, replySupport, loadAnalytics, loadAdvisor, updateAdvisor,
    deleteAdvisor, listNotifications, updateNotification, deleteNotification
  };
}
