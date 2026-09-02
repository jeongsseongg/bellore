const SESSION_PREFIX = 'bellore-guest-sell-session:';

export function installSellRequestAccess({ backend, getClient, window }) {
  if (!backend) return;
  const sessionKey = (receiptNo) => SESSION_PREFIX + String(receiptNo || '').toUpperCase();
  const invoke = (body) => getClient().functions.invoke('sell-request-access', { body }).then((response) => {
    if (response.error) throw response.error;
    if (!response.data?.ok) throw new Error(response.data?.code || 'SELL_REQUEST_FAILED');
    return response.data;
  });

  backend.createSellRequest = (data) => backend.uploadPhotos(data.photos, 10).then((urls) => invoke({
    action: 'create', method: data.method || 'compare', name: data.name, phone: data.phone,
    brand: data.brand, model: data.model, ref: data.ref || '', year: data.year || '',
    parts: data.parts || [], memo: data.memo || '', photoUrls: urls,
  }));
  backend.listMySellRequests = () => backend.currentUser()
    ? invoke({ action: 'list' }).then((result) => result.records || [])
    : Promise.resolve([]);
  backend.exchangeGuestSellLink = (linkToken) => invoke({ action: 'exchange', token: linkToken }).then((result) => {
    const receiptNo = result.record?.receiptNo;
    if (receiptNo && result.sessionToken) window.localStorage.setItem(sessionKey(receiptNo), result.sessionToken);
    return result;
  });
  backend.guestSellStatus = (receiptNo) => {
    const sessionToken = window.localStorage.getItem(sessionKey(receiptNo));
    if (!sessionToken) return Promise.reject(new Error('GUEST_SESSION_REQUIRED'));
    return invoke({ action: 'status', sessionToken }).then((result) => result.record);
  };
  backend.requestSellHandoff = (record, values) => {
    const body = {
      action: 'request-handoff', requestId: record?.id,
      tradeMethod: values?.tradeMethod,
      visitBranch: values?.visitBranch || '', requestedVisitAt: values?.requestedVisitAt || '',
    };
    if (!backend.currentUser()) body.sessionToken = window.localStorage.getItem(sessionKey(record?.receiptNo)) || '';
    return invoke(body).then((result) => result.record);
  };
  backend.verifyGuestSellRequest = (receiptNo) => {
    const payments = window.BELLORE_PAYMENTS || {};
    const verify = window.BELLORE_VERIFY?.phone || {};
    if (!window.PortOne || !payments.storeId || !verify.channelKey) return Promise.reject(new Error('NOT_CONFIGURED'));
    const randomId = window.crypto?.randomUUID?.().replace(/-/g, '') || Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    const identityVerificationId = 'guest_sell_' + randomId;
    return window.PortOne.requestIdentityVerification({ storeId: payments.storeId, identityVerificationId, channelKey: verify.channelKey })
      .then((response) => {
        if (response?.code != null) throw new Error(response.message || 'IDENTITY_FAILED');
        return invoke({ action: 'verify-phone', receiptNo, identityVerificationId });
      }).then((result) => {
        if (result.sessionToken) window.localStorage.setItem(sessionKey(receiptNo), result.sessionToken);
        return result;
      });
  };
}
