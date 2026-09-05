/** Default gift balance for new registrations. Overridable in admin settings.
 * Persisted as `settings/starter_credit.amountKzt` (preferred) with legacy
 * `amountUsd` dual-written for Rules/registration compatibility. Numeric units are KZT. */
export const DEFAULT_STARTER_CREDIT_USD = 250;

/** Alias kept for existing call sites; prefer reading the live setting from the store. */
export const STARTER_CREDIT_USD = DEFAULT_STARTER_CREDIT_USD;

export const MIN_STARTER_CREDIT_USD = 0;
/** Upper bound matches Firestore Rules and admin UI (KZT units). */
export const MAX_STARTER_CREDIT_USD = 10_000;

export const SCHOOL_GLOBAL_STATS_USER_ID = 'school_global_stats';

export function normalizeStarterCreditUsd(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return DEFAULT_STARTER_CREDIT_USD;
  return Math.min(MAX_STARTER_CREDIT_USD, Math.max(MIN_STARTER_CREDIT_USD, Math.round(num)));
}

/** Resolve gift amount from settings doc: prefer amountKzt, fall back to legacy amountUsd. */
export function resolveStarterCreditAmountKzt(data: {
  amountKzt?: unknown;
  amountUsd?: unknown;
} | null | undefined): number {
  if (data == null) return DEFAULT_STARTER_CREDIT_USD;
  if (data.amountKzt !== undefined && data.amountKzt !== null) {
    return normalizeStarterCreditUsd(data.amountKzt);
  }
  if (data.amountUsd !== undefined && data.amountUsd !== null) {
    return normalizeStarterCreditUsd(data.amountUsd);
  }
  return DEFAULT_STARTER_CREDIT_USD;
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

/**
 * Fields applied when resetting a wallet to the registration gift only.
 * `balanceUSD` is the persisted Rules-compatible field name; the numeric gift is KZT.
 */
export function starterOnlyWalletFields(creditUsd: number = DEFAULT_STARTER_CREDIT_USD) {
  const amount = normalizeStarterCreditUsd(creditUsd);
  return {
    balanceUSD: amount,
    walletBalances: { KZT: amount, USD: 0 },
    pendingWalletCredit: 0,
  };
}
