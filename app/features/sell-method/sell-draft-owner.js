const GUEST_OWNER_KEY = 'bellore-sell-guest-owner-v1';

export function createSellDraftOwner({ window, backend }) {
  function ownerId() {
    const member = backend?.currentUser?.();
    if (member?.uid) return 'member:' + member.uid;
    let guestId = window.localStorage.getItem(GUEST_OWNER_KEY);
    if (!guestId) {
      guestId = window.crypto?.randomUUID?.() || ('guest-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
      window.localStorage.setItem(GUEST_OWNER_KEY, guestId);
    }
    return 'guest:' + guestId;
  }
  return {
    ownerId, draftId: () => 'current:' + ownerId(),
    bindAuth: (reload) => backend?.onAuthChange?.(() => reload()),
  };
}
