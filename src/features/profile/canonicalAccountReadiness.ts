/**
 * Client-side read gate for server-owned canonical Account initialization.
 *
 * A newly verified signup first writes a presentation-only UserProfile.
 * Firestore Rules prohibit the browser from setting canonical account fields;
 * provision_self_participant writes these fields through a server transaction.
 * Until that happens, account read callables correctly reject the principal.
 *
 * This is a scheduling hint, never an authorization decision. Server read
 * handlers continue to verify canonical Account and participant ownership.
 */
export function isCanonicalAccountReadyForReads(
  raw: Record<string, unknown>,
  authenticatedUid: string
): boolean {
  const lifecycle = raw.lifecycle;
  const audit = raw.audit;
  return (
    raw.accountId === authenticatedUid &&
    (raw.dataScope === 'live' || raw.dataScope === 'test') &&
    lifecycle !== null &&
    typeof lifecycle === 'object' &&
    !Array.isArray(lifecycle) &&
    (lifecycle as Record<string, unknown>).status === 'active' &&
    typeof raw.revision === 'number' &&
    Number.isInteger(raw.revision) &&
    raw.revision >= 1 &&
    audit !== null &&
    typeof audit === 'object' &&
    !Array.isArray(audit) &&
    typeof (audit as Record<string, unknown>).createdByCommandId === 'string'
  );
}
