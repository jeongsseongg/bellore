function inFilter(values) {
  return `in.(${values.map(String).join(',')})`;
}

export function createAdminTradeService(client) {
  async function listOrders(status = '') {
    return client.list('orders', {
      select: '*', ...(status ? { status: `eq.${status}` } : {}), order: 'created_at.desc', limit: 300
    });
  }

  function updateOrder(id, patch) {
    return client.update('orders', { id: `eq.${id}` }, patch);
  }

  function refundOrder(orderNo, reason) {
    return client.edge('cancel-payment', { orderNo, reason: reason || '관리자 환불' });
  }

  function listReturns() {
    return client.list('return_requests', { select: '*', order: 'created_at.desc', limit: 300 });
  }

  function updateReturn(id, patch) {
    const next = { ...patch };
    if (next.status === 'done' || next.status === 'rejected') next.resolved_at = new Date().toISOString();
    return client.update('return_requests', { id: `eq.${id}` }, next);
  }

  async function listQuotes(status = '') {
    const quotes = await client.list('quote_requests', {
      select: '*', ...(status ? { status: `eq.${status}` } : {}), order: 'created_at.desc', limit: 300
    });
    if (!quotes.length) return [];
    const ids = quotes.map((quote) => quote.id);
    const bids = await client.list('bids', {
      select: '*', quote_request_id: inFilter(ids), order: 'created_at.desc', limit: 1000
    }).catch(() => []);
    const contacts = bids.length ? await client.list('bid_admin_contacts', {
      select: '*', bid_id: inFilter(bids.map((bid) => bid.id)), limit: 1000
    }).catch(() => []) : [];
    const phoneByBid = new Map(contacts.map((row) => [String(row.bid_id), row.vendor_phone || '']));
    const bidsByQuote = new Map();
    bids.forEach((bid) => {
      const key = String(bid.quote_request_id);
      const rows = bidsByQuote.get(key) || [];
      rows.push({ ...bid, vendor_phone: phoneByBid.get(String(bid.id)) || '' });
      bidsByQuote.set(key, rows);
    });
    return quotes.map((quote) => ({ ...quote, bids: bidsByQuote.get(String(quote.id)) || [] }));
  }

  async function approveQuote(id) {
    const rows = await client.update('quote_requests', { id: `eq.${id}`, status: 'eq.pending' }, { status: 'open' });
    if (!rows?.length) throw new Error('승인 처리된 견적이 없습니다. 현재 상태와 관리자 권한을 확인해 주세요.');
    client.edge('notify-vip-kakao', { quoteId: id }).catch((error) => {
      console.warn('견적 승인은 완료됐지만 우수 견적업체 알림 요청은 실패했습니다.', error);
    });
    return rows[0];
  }

  function setQuoteStatus(id, status) {
    return client.update('quote_requests', { id: `eq.${id}` }, { status });
  }

  function deleteQuote(id) {
    return client.remove('quote_requests', { id: `eq.${id}` });
  }

  async function addAdminBid({ quoteId, operatorId, vendorName, vendorPhone, amount, message }) {
    const rows = await client.insert('bids', {
      quote_request_id: quoteId,
      vendor_id: operatorId,
      vendor_name: String(vendorName || '').trim(),
      amount: Number(amount),
      message: message || null,
      created_by_admin: true
    });
    const bid = rows?.[0];
    if (bid && vendorPhone) await client.insert('bid_admin_contacts', { bid_id: bid.id, vendor_phone: vendorPhone });
    return bid;
  }

  function updateQuoteFollowup(id, values) {
    return client.update('quote_requests', { id: `eq.${id}`, status: 'eq.awarded' }, {
      customer_contacted: !!values.customer_contacted,
      vendor_contacted: !!values.vendor_contacted,
      trade_completed: !!values.trade_completed,
      followup_updated_at: new Date().toISOString()
    });
  }

  function listAuctions() {
    return client.list('auctions', { select: '*', order: 'created_at.desc', limit: 300 }).catch((error) => {
      if (error.code === '42P01' || error.status === 404) return [];
      throw error;
    });
  }

  function createAuction(row) {
    return client.insert('auctions', row);
  }

  function updateAuction(id, patch) {
    return client.update('auctions', { id: `eq.${id}` }, patch);
  }

  function deleteAuction(id) {
    return client.remove('auctions', { id: `eq.${id}` });
  }

  async function overview() {
    const [orders, quotes, returns, settlements] = await Promise.all([
      listOrders(), listQuotes(), listReturns(),
      client.list('settlements', { select: 'id,status,net_amount,created_at', order: 'created_at.desc', limit: 500 }).catch(() => [])
    ]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      orders, quotes, returns, settlements,
      metrics: {
        todayOrders: orders.filter((row) => Date.parse(row.created_at) >= today.getTime()).length,
        ordersPending: orders.filter((row) => ['paid', 'inspecting', 'preparing', 'cancel_req'].includes(row.status)).length,
        quotesPending: quotes.filter((row) => row.status === 'pending').length,
        quotesOpen: quotes.filter((row) => row.status === 'open').length,
        returnsPending: returns.filter((row) => ['requested', 'approved', 'collecting'].includes(row.status)).length,
        settlementsPending: settlements.filter((row) => row.status === 'pending').length
      }
    };
  }

  return {
    listOrders, updateOrder, refundOrder, listReturns, updateReturn, listQuotes, approveQuote,
    setQuoteStatus, deleteQuote, addAdminBid, updateQuoteFollowup, listAuctions, createAuction,
    updateAuction, deleteAuction, overview
  };
}
