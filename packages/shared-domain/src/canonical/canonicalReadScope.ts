import {
  LIVE_CANONICAL_EXECUTION_SCOPE,
  parsePersistedCanonicalScope,
  testCanonicalExecutionScope,
  type CanonicalExecutionScope,
} from './canonicalScope';
import type { TestSessionId } from './identifiers';

/**
 * Read purpose is server-owned. Clients cannot choose it.
 *
 * - `live_product` — normal application reads (LIVE only)
 * - `product_test` — interactive TEST reads; session must be active
 * - `maintenance_test` — Admin Testing inventory/preview; non-active sessions allowed
 */
export const CANONICAL_READ_PURPOSES = [
  'live_product',
  'product_test',
  'maintenance_test',
] as const;

export type CanonicalReadPurpose = (typeof CANONICAL_READ_PURPOSES)[number];

export type CanonicalReadScope = CanonicalExecutionScope & {
  readonly purpose: CanonicalReadPurpose;
};

/**
 * Optional Testing-boundary field. Not authority: the server peels and
 * revalidates it. Ordinary LIVE callers omit it.
 */
export type CanonicalReadSessionRequest = {
  readonly requestedTestSessionId?: TestSessionId;
};

/**
 * Compatibility window until T42B-8 backfill + strict contract.
 *
 * LIVE: missing `dataScope` is legacy LIVE.
 * TEST: missing `dataScope` is never accepted.
 *
 * Flip `missingDataScope` to `reject` in T42B-8 to hide unstamped docs from LIVE.
 */
export const LIVE_READ_COMPATIBILITY_MODE = {
  missingDataScope: 'legacy_live',
} as const;

export type LiveReadCompatibilityMode = typeof LIVE_READ_COMPATIBILITY_MODE;

/** Cross-scope known-ID reads look like a missing resource. Do not reveal session mismatch. */
export const CROSS_SCOPE_READ_VISIBILITY = 'not_found' as const;

export const LIVE_CANONICAL_READ_SCOPE: CanonicalReadScope = Object.freeze({
  dataScope: 'live',
  purpose: 'live_product',
});

export function liveCanonicalReadScope(): CanonicalReadScope {
  return LIVE_CANONICAL_READ_SCOPE;
}

export function testCanonicalReadScope(
  testSessionId: TestSessionId,
  purpose: Exclude<CanonicalReadPurpose, 'live_product'> = 'product_test'
): CanonicalReadScope {
  return Object.freeze({
    ...testCanonicalExecutionScope(testSessionId),
    purpose,
  });
}

export function canonicalReadScopeFromExecution(
  scope: CanonicalExecutionScope,
  purpose: CanonicalReadPurpose = scope.dataScope === 'live' ? 'live_product' : 'product_test'
): CanonicalReadScope {
  if (scope.dataScope === 'live') {
    if (purpose !== 'live_product') {
      return LIVE_CANONICAL_READ_SCOPE;
    }
    return LIVE_CANONICAL_READ_SCOPE;
  }
  const testPurpose = purpose === 'live_product' ? 'product_test' : purpose;
  return testCanonicalReadScope(scope.testSessionId, testPurpose);
}

export function liveReadAllowsLegacyMissingScope(): boolean {
  return LIVE_READ_COMPATIBILITY_MODE.missingDataScope === 'legacy_live';
}

export function executionScopeFromReadScope(
  readScope: CanonicalReadScope
): CanonicalExecutionScope {
  return readScope.dataScope === 'live'
    ? LIVE_CANONICAL_EXECUTION_SCOPE
    : testCanonicalExecutionScope(readScope.testSessionId);
}

/**
 * Central LIVE/TEST document visibility. Do not scatter
 * `dataScope === undefined || dataScope === "live"` across readers.
 */
export function documentMatchesReadScope(
  readScope: CanonicalExecutionScope,
  persisted: unknown
): boolean {
  if (persisted === undefined || persisted === null) {
    return false;
  }
  try {
    const actual = parsePersistedCanonicalScope(persisted, {
      allowLegacyLive:
        readScope.dataScope === 'live' && liveReadAllowsLegacyMissingScope(),
    });
    if (readScope.dataScope === 'live') {
      return actual.dataScope === 'live';
    }
    return (
      actual.dataScope === 'test' &&
      actual.testSessionId === readScope.testSessionId
    );
  } catch {
    return false;
  }
}

/**
 * Identity graph (Account, Participant, ParticipantManagement, Instructor).
 *
 * LIVE hides explicit TEST identities. Missing scope remains legacy LIVE until
 * T42B-8. TEST product reads may see unstamped identity and persistent TestActor
 * identity (`dataScope=test` without a session stamp) so cabinets work before
 * the identity backfill. Explicit LIVE identity is never visible in TEST.
 */
export function identityDocumentMatchesReadScope(
  readScope: CanonicalExecutionScope,
  persisted: unknown
): boolean {
  if (persisted === undefined || persisted === null || typeof persisted !== 'object') {
    return false;
  }
  const record = persisted as Record<string, unknown>;
  const dataScope = record.dataScope;
  const testSessionId = record.testSessionId;

  if (readScope.dataScope === 'live') {
    if (dataScope === 'test') return false;
    if (dataScope === undefined) {
      return testSessionId === undefined && liveReadAllowsLegacyMissingScope();
    }
    if (dataScope === 'live') return testSessionId === undefined;
    return false;
  }

  if (dataScope === undefined) {
    return testSessionId === undefined;
  }
  if (dataScope === 'live') return false;
  if (dataScope === 'test') {
    if (testSessionId === undefined) return true;
    return testSessionId === readScope.testSessionId;
  }
  return false;
}

export function filterRecordsMatchingReadScope<T>(
  records: readonly T[],
  readScope: CanonicalExecutionScope,
  persisted: (record: T) => unknown = (record) => record
): T[] {
  return records.filter((record) => documentMatchesReadScope(readScope, persisted(record)));
}
