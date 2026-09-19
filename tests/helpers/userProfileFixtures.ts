/** Canonical current `/users/{uid}` profile used by the client UserProfile parser. */
export const canonicalUserProfileDocument = {
  uid: 'user-canonical',
  email: 'canonical@example.com',
  displayName: 'Canonical User',
  role: 'user' as const,
  avatarUrl: 'https://example.com/avatar.svg',
};

export const PROD_SHAPED_KSUSHA_ACCOUNT_ID = 'F5mwFT8KvAOkYHxlElpagT1yftr1';
export const PROD_SHAPED_KSUSHA_EMAIL = 'ksusha@test.ru';

const prodShapedTimestamp = { seconds: 1_750_000_000, nanoseconds: 0 };

/**
 * Production-shaped dual-purpose `/users/{accountId}` document.
 * Canonical Account fields coexist with a historical UserProfile projection.
 * Missing duplicated uid/avatarUrl/role, Firestore null optionals, and leftover
 * partial `walletBalances` (Zod 4 record requires both USD and KZT) are the
 * remaining raw-schema mismatches after the uid/avatarUrl bootstrap fix.
 */
export const ksushaProductionShapedUserDocument: Record<string, unknown> = {
  accountId: PROD_SHAPED_KSUSHA_ACCOUNT_ID,
  lifecycle: { status: 'active' },
  revision: 1,
  createdAt: prodShapedTimestamp,
  updatedAt: prodShapedTimestamp,
  audit: {
    createdByCommandId: 'command_prod_shaped_account',
    lastChangedByCommandId: 'command_prod_shaped_account',
    correlationId: 'correlation_prod_shaped_account',
  },
  email: PROD_SHAPED_KSUSHA_EMAIL,
  displayName: 'Ксюша Иванова',
  isClientActive: true,
  phoneNumber: null,
  systemRole: null,
  instructorId: null,
  isInstructor: null,
  comments: 'historical extra field',
  balanceUSD: null,
  // KZT-only leftover after the USD→KZT UI migration. Zod 4 record(USD|KZT, number)
  // then fails at `walletBalances.USD` because the USD key is missing.
  walletBalances: { KZT: 0 },
};

export const currentSupportedWalletBalances = { USD: 250, KZT: 0 } as const;
