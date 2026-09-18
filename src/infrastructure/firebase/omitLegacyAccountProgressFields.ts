const LEGACY_ACCOUNT_CREATE_STRIP_KEYS = [
  'level',
  'skillScores',
  'skillComments',
  'balanceUSD',
  'walletBalances',
  'pendingWalletCredit',
  'lastRefundBookingId',
] as const;

type LegacyAccountCreateStripKey = (typeof LEGACY_ACCOUNT_CREATE_STRIP_KEYS)[number];

/**
 * Strip leftover /users progress and money fields from Account create/claim payloads.
 * Canonical spendable balance lives on `/users/{accountId}/wallet/state`.
 */
export function omitLegacyAccountProgressFields<T extends object>(
  profile: T
): Omit<T, LegacyAccountCreateStripKey> {
  const next = { ...profile } as T & Partial<Record<LegacyAccountCreateStripKey, unknown>>;
  for (const key of LEGACY_ACCOUNT_CREATE_STRIP_KEYS) {
    delete next[key];
  }
  return next;
}
