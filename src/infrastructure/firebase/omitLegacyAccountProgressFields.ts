const LEGACY_ACCOUNT_PROGRESS_KEYS = ['level', 'skillScores', 'skillComments'] as const;

type LegacyAccountProgressKey = (typeof LEGACY_ACCOUNT_PROGRESS_KEYS)[number];

/**
 * Strip leftover /users progress fields from Account create/claim payloads.
 * Existing production leftover data is not deleted; it is simply not copied
 * onto a new Account document.
 */
export function omitLegacyAccountProgressFields<T extends object>(
  profile: T
): Omit<T, LegacyAccountProgressKey> {
  const next = { ...profile } as T & Partial<Record<LegacyAccountProgressKey, unknown>>;
  for (const key of LEGACY_ACCOUNT_PROGRESS_KEYS) {
    delete next[key];
  }
  return next;
}
