import { describe, expect, it } from 'vitest';
import { TestSessionIdSchema } from './identifiers';
import {
  LIVE_CANONICAL_EXECUTION_SCOPE,
  testCanonicalExecutionScope,
} from './canonicalScope';
import {
  CROSS_SCOPE_READ_VISIBILITY,
  LIVE_CANONICAL_READ_SCOPE,
  LIVE_READ_COMPATIBILITY_MODE,
  canonicalReadScopeFromExecution,
  documentMatchesReadScope,
  filterRecordsMatchingReadScope,
  identityDocumentMatchesReadScope,
  liveReadAllowsLegacyMissingScope,
  testCanonicalReadScope,
} from './canonicalReadScope';

const sessionA = TestSessionIdSchema.parse('test_read_scope_a01');
const sessionB = TestSessionIdSchema.parse('test_read_scope_b01');

describe('canonicalReadScope', () => {
  it('treats missing dataScope as LIVE during the compatibility window', () => {
    expect(LIVE_READ_COMPATIBILITY_MODE.missingDataScope).toBe('legacy_live');
    expect(liveReadAllowsLegacyMissingScope()).toBe(true);
    expect(documentMatchesReadScope(LIVE_CANONICAL_EXECUTION_SCOPE, {})).toBe(true);
    expect(documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, { title: 'legacy' })).toBe(true);
  });

  it('treats explicit live scope as LIVE', () => {
    expect(documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, { dataScope: 'live' })).toBe(true);
  });

  it('hides TEST documents from LIVE reads', () => {
    expect(
      documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, {
        dataScope: 'test',
        testSessionId: sessionA,
      })
    ).toBe(false);
  });

  it('never accepts missing scope for TEST reads', () => {
    const testScope = testCanonicalReadScope(sessionA);
    expect(documentMatchesReadScope(testScope, {})).toBe(false);
    expect(documentMatchesReadScope(testScope, { dataScope: 'live' })).toBe(false);
    expect(
      documentMatchesReadScope(testScope, { dataScope: 'test', testSessionId: sessionA })
    ).toBe(true);
    expect(
      documentMatchesReadScope(testScope, { dataScope: 'test', testSessionId: sessionB })
    ).toBe(false);
  });

  it('does not treat requestedTestSessionId as client-side authority', () => {
    const request: { requestedTestSessionId?: string } = {
      requestedTestSessionId: sessionA,
    };
    expect(request.requestedTestSessionId).toBe(sessionA);
    expect(LIVE_CANONICAL_READ_SCOPE.dataScope).toBe('live');
  });

  it('does not reveal cross-scope existence through the visibility contract', () => {
    expect(CROSS_SCOPE_READ_VISIBILITY).toBe('not_found');
  });

  it('filters mixed fixture sets to the requested scope', () => {
    const records = [
      { id: 'legacy' },
      { id: 'live', dataScope: 'live' },
      { id: 'a', dataScope: 'test', testSessionId: sessionA },
      { id: 'b', dataScope: 'test', testSessionId: sessionB },
    ];
    expect(
      filterRecordsMatchingReadScope(records, LIVE_CANONICAL_READ_SCOPE).map((row) => row.id)
    ).toEqual(['legacy', 'live']);
    expect(
      filterRecordsMatchingReadScope(records, testCanonicalReadScope(sessionA)).map((row) => row.id)
    ).toEqual(['a']);
  });

  it('derives read purpose from execution scope without a second scope model', () => {
    expect(canonicalReadScopeFromExecution(LIVE_CANONICAL_EXECUTION_SCOPE)).toEqual({
      dataScope: 'live',
      purpose: 'live_product',
    });
    expect(canonicalReadScopeFromExecution(testCanonicalExecutionScope(sessionA))).toEqual({
      dataScope: 'test',
      testSessionId: sessionA,
      purpose: 'product_test',
    });
    expect(
      canonicalReadScopeFromExecution(testCanonicalExecutionScope(sessionA), 'maintenance_test')
    ).toEqual({
      dataScope: 'test',
      testSessionId: sessionA,
      purpose: 'maintenance_test',
    });
  });

  it('hides TEST identities from LIVE People without using email', () => {
    expect(
      identityDocumentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, {
        email: 'ksusha@test.ru',
      })
    ).toBe(true);
    expect(
      identityDocumentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, {
        dataScope: 'test',
        email: 'customer@example.com',
      })
    ).toBe(false);
  });

  it('lets TEST identity reads see unstamped and persistent TestActor docs', () => {
    const testScope = testCanonicalReadScope(sessionA);
    expect(identityDocumentMatchesReadScope(testScope, { displayName: 'Child' })).toBe(true);
    expect(
      identityDocumentMatchesReadScope(testScope, { dataScope: 'test' })
    ).toBe(true);
    expect(
      identityDocumentMatchesReadScope(testScope, { dataScope: 'live', displayName: 'Live' })
    ).toBe(false);
    expect(
      identityDocumentMatchesReadScope(testScope, {
        dataScope: 'test',
        testSessionId: sessionB,
      })
    ).toBe(false);
  });

  it('hides malformed persisted scope instead of throwing into product reads', () => {
    expect(
      documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, {
        dataScope: 'live',
        testSessionId: sessionA,
      })
    ).toBe(false);
    expect(documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, null)).toBe(false);
    expect(documentMatchesReadScope(testCanonicalReadScope(sessionA), undefined)).toBe(false);
  });
});
