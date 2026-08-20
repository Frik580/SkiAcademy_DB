/** Synthetic ledger owner for school guest cash payments. */
export const SCHOOL_GUEST_WALLET_USER_ID = 'school_guest';

export const GUEST_WALLET_SETTINGS_COLLECTION = 'settings';
export const GUEST_WALLET_SETTINGS_DOC_ID = 'guest_wallet';

export function guestWalletSettingsPath(): {
  collection: typeof GUEST_WALLET_SETTINGS_COLLECTION;
  docId: typeof GUEST_WALLET_SETTINGS_DOC_ID;
} {
  return {
    collection: GUEST_WALLET_SETTINGS_COLLECTION,
    docId: GUEST_WALLET_SETTINGS_DOC_ID,
  };
}

export function normalizeGuestWalletBalance(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isGuestCashSubject(booking: { userId?: string; isGuest?: boolean }): boolean {
  if (!booking.userId || booking.userId.startsWith('system_block_')) return false;
  return booking.isGuest === true || booking.userId.startsWith('guest_');
}
