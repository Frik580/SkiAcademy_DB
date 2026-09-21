import { describe, expect, it } from 'vitest';
import {
  TEST_SESSION_DELETE_CONFIRMATION,
  TEST_SESSION_RESET_CONFIRMATION,
  TestSessionMaintenanceError,
  assertCandidateDeletable,
  assertMaintenanceConfirmation,
  assertManifestFresh,
  assertResetCompletionStatus,
  assertTestSessionStatusTransition,
  buildMaintenanceManifestHash,
  evaluateMaintenanceLease,
  maintenanceLeaseIsExpired,
  fingerprintMaintenanceCandidates,
  parseLifecycleInput,
  preflightDestructiveCandidates,
  resolveTestSessionLifecycleCommandSupport,
  type TestSessionMaintenanceCandidate,
} from './testSessionLifecycle';

const sessionA = 'test_session_alpha';
const sessionB = 'test_session_beta';

function candidate(
  path: string,
  dataScope: string | null,
  testSessionId: string | null
): TestSessionMaintenanceCandidate {
  return { path, revision: 3, dataScope, testSessionId };
}

describe('TestSession lifecycle policy', () => {
  it('allows the create, close, reset, delete, and failure transitions', () => {
    expect(() => assertTestSessionStatusTransition('provisioning', 'active')).not.toThrow();
    expect(() => assertTestSessionStatusTransition('active', 'closed')).not.toThrow();
    expect(() => assertTestSessionStatusTransition('active', 'locked')).not.toThrow();
    expect(() => assertTestSessionStatusTransition('closed', 'locked')).not.toThrow();
    expect(() => assertTestSessionStatusTransition('locked', 'resetting')).not.toThrow();
    expect(() => assertTestSessionStatusTransition('locked', 'deleting')).not.toThrow();
    expect(() => assertTestSessionStatusTransition('resetting', 'active')).not.toThrow();
    expect(() => assertTestSessionStatusTransition('resetting', 'closed')).not.toThrow();
    expect(() => assertTestSessionStatusTransition('provisioning', 'failed')).not.toThrow();
    expect(() => assertTestSessionStatusTransition('resetting', 'failed')).not.toThrow();
    expect(() => assertTestSessionStatusTransition('failed', 'locked')).not.toThrow();
    expect(() => assertTestSessionStatusTransition('failed', 'provisioning')).not.toThrow();
  });

  it('fails closed on invalid transitions', () => {
    expect(() => assertTestSessionStatusTransition('active', 'deleting')).toThrow(
      TestSessionMaintenanceError
    );
    expect(() => assertTestSessionStatusTransition('closed', 'active')).toThrow(
      expect.objectContaining({ code: 'TEST_SESSION_TRANSITION_FORBIDDEN' })
    );
    expect(() => assertResetCompletionStatus('closed', 'active')).toThrow(
      expect.objectContaining({ code: 'TEST_SESSION_TRANSITION_FORBIDDEN' })
    );
    expect(() => assertResetCompletionStatus('active', 'active')).not.toThrow();
    expect(() => assertResetCompletionStatus('closed', 'closed')).not.toThrow();
  });

  it('requires the exact confirmation token', () => {
    expect(() => assertMaintenanceConfirmation('reset', TEST_SESSION_RESET_CONFIRMATION)).not.toThrow();
    expect(() => assertMaintenanceConfirmation('delete', TEST_SESSION_DELETE_CONFIRMATION)).not.toThrow();
    expect(() => assertMaintenanceConfirmation('reset', 'сбросить')).toThrow(
      expect.objectContaining({ code: 'TEST_MAINTENANCE_CONFIRMATION_INVALID' })
    );
  });

  it('rejects a different operation even after the previous lease would be expired', () => {
    expect(
      evaluateMaintenanceLease({
        currentOperationId: 'op_a',
        requestedOperationId: 'op_b',
      })
    ).toBe('conflict');
    expect(
      evaluateMaintenanceLease({
        currentOperationId: 'op_a',
        requestedOperationId: 'op_a',
      })
    ).toBe('owner');
  });

  it('treats a missing or elapsed maintenance lease as expired', () => {
    const now = new Date('2026-09-22T00:00:00.000Z');
    expect(maintenanceLeaseIsExpired(undefined, now)).toBe(true);
    expect(maintenanceLeaseIsExpired({ seconds: Math.floor(now.getTime() / 1000) - 1 }, now)).toBe(true);
    expect(maintenanceLeaseIsExpired({ seconds: Math.floor(now.getTime() / 1000) + 60 }, now)).toBe(false);
  });

  it('aborts the whole manifest when any candidate is live, missing scope, or another session', () => {
    const valid = candidate('bookings/booking_ok', 'test', sessionA);
    expect(() => preflightDestructiveCandidates([valid], sessionA, 'reset')).not.toThrow();
    expect(() =>
      preflightDestructiveCandidates(
        [valid, candidate('bookings/booking_live', 'live', null)],
        sessionA,
        'reset'
      )
    ).toThrow(expect.objectContaining({ code: 'TEST_MAINTENANCE_SCOPE_VIOLATION' }));
    expect(() =>
      preflightDestructiveCandidates(
        [valid, candidate('bookings/booking_legacy', null, null)],
        sessionA,
        'reset'
      )
    ).toThrow(expect.objectContaining({ code: 'TEST_MAINTENANCE_SCOPE_VIOLATION' }));
    expect(() =>
      preflightDestructiveCandidates(
        [valid, candidate('bookings/booking_other', 'test', sessionB)],
        sessionA,
        'reset'
      )
    ).toThrow(expect.objectContaining({ code: 'TEST_MAINTENANCE_SCOPE_VIOLATION' }));
  });

  it('classifies preserve roots and fixed identity paths', () => {
    const scoped = { dataScope: 'test', testSessionId: sessionA };
    expect(() =>
      assertCandidateDeletable(
        { path: 'settings/starter_credit', revision: 1, ...scoped },
        sessionA,
        'delete'
      )
    ).toThrow(expect.objectContaining({ code: 'TEST_MAINTENANCE_SCOPE_VIOLATION' }));
    expect(() =>
      assertCandidateDeletable(
        { path: 'test_actors/account_parent', revision: 1, ...scoped },
        sessionA,
        'delete'
      )
    ).toThrow(expect.objectContaining({ code: 'TEST_MAINTENANCE_SCOPE_VIOLATION' }));
    expect(() =>
      assertCandidateDeletable(
        { path: 'users/account_parent/wallet/state', revision: 2, ...scoped },
        sessionA,
        'reset'
      )
    ).not.toThrow();
    expect(() =>
      assertCandidateDeletable(
        { path: `test_sessions/${sessionA}/membership/account_parent`, revision: 1, ...scoped },
        sessionA,
        'reset'
      )
    ).toThrow(expect.objectContaining({ code: 'TEST_MAINTENANCE_SCOPE_VIOLATION' }));
    expect(() =>
      assertCandidateDeletable(
        { path: `test_sessions/${sessionA}/membership/account_parent`, revision: 1, ...scoped },
        sessionA,
        'delete'
      )
    ).not.toThrow();
  });

  it('changes the manifest hash when a document is replaced at the same count', () => {
    const left = fingerprintMaintenanceCandidates([
      candidate('bookings/booking_a', 'test', sessionA),
    ]);
    const right = fingerprintMaintenanceCandidates([
      { ...candidate('bookings/booking_b', 'test', sessionA), revision: 3 },
    ]);
    expect(left).not.toBe(right);
    const hash = buildMaintenanceManifestHash({
      operation: 'reset',
      testSessionId: sessionA,
      inventoryRevision: 4,
      fingerprint: left,
    });
    expect(
      buildMaintenanceManifestHash({
        operation: 'reset',
        testSessionId: sessionA,
        inventoryRevision: 5,
        fingerprint: left,
      })
    ).not.toBe(hash);
  });

  it('rejects expired and stale manifests before any destructive work', () => {
    const now = new Date('2026-09-22T00:00:00.000Z');
    expect(() =>
      assertManifestFresh({
        previewHash: 'a',
        currentHash: 'a',
        previewInventoryRevision: 1,
        inventoryRevision: 1,
        expiresAt: new Date('2026-09-22T00:10:00.000Z'),
        now,
      })
    ).not.toThrow();
    expect(() =>
      assertManifestFresh({
        previewHash: 'a',
        currentHash: 'b',
        previewInventoryRevision: 1,
        inventoryRevision: 1,
        expiresAt: new Date('2026-09-22T00:10:00.000Z'),
        now,
      })
    ).toThrow(expect.objectContaining({ code: 'TEST_MAINTENANCE_MANIFEST_STALE' }));
    expect(() =>
      assertManifestFresh({
        previewHash: 'a',
        currentHash: 'a',
        previewInventoryRevision: 1,
        inventoryRevision: 1,
        expiresAt: now,
        now,
      })
    ).toThrow(expect.objectContaining({ code: 'TEST_MAINTENANCE_MANIFEST_EXPIRED' }));
  });

  it('fails closed for unknown lifecycle commands', () => {
    expect(resolveTestSessionLifecycleCommandSupport('create_test_session')).toBe(
      'LIFECYCLE_SUPPORTED'
    );
    expect(resolveTestSessionLifecycleCommandSupport('create_confirmed_booking')).toBe(
      'LIFECYCLE_FORBIDDEN'
    );
    expect(resolveTestSessionLifecycleCommandSupport('drop_collection')).toBe('LIFECYCLE_FORBIDDEN');
    expect(() => parseLifecycleInput({ command: 'drop_collection' })).toThrow(
      expect.objectContaining({ code: 'LIFECYCLE_FORBIDDEN' })
    );
  });
});
