/** Default gift balance for new registrations (USD). Overridable in admin settings. */
export const DEFAULT_STARTER_CREDIT_USD = 250;

/** Alias kept for existing call sites; prefer reading the live setting from the store. */
export const STARTER_CREDIT_USD = DEFAULT_STARTER_CREDIT_USD;

export const MIN_STARTER_CREDIT_USD = 0;
export const MAX_STARTER_CREDIT_USD = 10_000;

export const SCHOOL_GLOBAL_STATS_USER_ID = 'school_global_stats';

export function normalizeStarterCreditUsd(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_STARTER_CREDIT_USD;
  return Math.min(MAX_STARTER_CREDIT_USD, Math.max(MIN_STARTER_CREDIT_USD, Math.round(num)));
}

/** Profiles that hold a client wallet (admins keep their own balances under rules). */
export function isResettableWalletUser(
  userId: string,
  profile: { role?: string } | undefined
): boolean {
  if (userId === SCHOOL_GLOBAL_STATS_USER_ID) return false;
  if (!profile) return false;
  return profile.role !== 'admin';
}

/** Fields applied when resetting a wallet to the registration gift only. */
export function starterOnlyWalletFields(creditUsd: number = DEFAULT_STARTER_CREDIT_USD) {
  const amount = normalizeStarterCreditUsd(creditUsd);
  return {
    balanceUSD: amount,
    walletBalances: { USD: amount, KZT: 0 },
    pendingWalletCredit: 0,
  };
}
