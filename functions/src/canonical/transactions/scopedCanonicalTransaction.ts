import {
  CanonicalCommandError,
  PersistedCanonicalScopeError,
  assertSameCanonicalScope,
  canonicalScopeFields,
  type CanonicalExecutionScope,
} from '@ski-academy/shared-domain';
import type {
  CanonicalAtomicTransactionSession,
  CanonicalTransactionCollectionQuery,
  CanonicalTransactionDocumentRef,
  CanonicalTransactionOperations,
} from './index';

const SCOPE_STAMPED_COLLECTIONS = new Set([
  'bookings',
  'booking_proposals',
  'booking_change_requests',
  'attendance',
  'course_enrollments',
  'resource_claims',
  'resource_claim_guards',
  'active_course_enrollment_guards',
  'command_idempotency',
  'domain_outbox',
  'activity_logs',
  'admin_issues',
  'administrative_availability_blocks',
]);

// T42B-3 will make these aggregates fully scope-aware. Until then TEST execution
// may inspect only same-session clones and therefore fails closed on legacy/LIVE rows.
const TEST_FAIL_CLOSED_COLLECTIONS = new Set([
  'courses',
  'course_days',
  'participants',
  'instructors',
  'wallets',
  'payments',
  'monetary_events',
  'participant_progress',
  'participant_achievements',
  'instructor_reviews',
  'instructor_rating_summaries',
]);

const TEST_UNSUPPORTED_WRITE_COLLECTIONS = new Set([
  'courses',
  'course_days',
  'participants',
  'instructors',
  'wallets',
  'payments',
  'monetary_events',
  'participant_progress',
  'participant_achievements',
  'participant_lesson_feedback',
  'instructor_reviews',
  'instructor_rating_summaries',
  'homework',
]);

function transactionCollection(path: string): string {
  const segments = path.replace(/^\//, '').split('/');
  if (segments[0] === 'users' && segments[2] === 'wallet' && segments[3] === 'state') {
    return 'wallets';
  }
  return segments[0] ?? '';
}

function shouldAssertRead(path: string, scope: CanonicalExecutionScope): boolean {
  const collection = transactionCollection(path);
  return (
    SCOPE_STAMPED_COLLECTIONS.has(collection) ||
    (scope.dataScope === 'test' && TEST_FAIL_CLOSED_COLLECTIONS.has(collection))
  );
}

function scopeError(
  correlationId: CanonicalAtomicTransactionSession['correlationId'],
  error: PersistedCanonicalScopeError
): CanonicalCommandError {
  return new CanonicalCommandError('cross_scope_forbidden', {
    correlationId,
    details: {
      reason: error.code === 'MALFORMED_PERSISTED_SCOPE' ? 'malformed' : 'conflict',
    },
  });
}

export function scopeCanonicalTransactionSession(
  base: CanonicalAtomicTransactionSession,
  scope: CanonicalExecutionScope
): CanonicalAtomicTransactionSession {
  const compatiblePaths = new Set<string>();

  const assertCompatible = (path: string, data: Record<string, unknown>): void => {
    try {
      assertSameCanonicalScope(scope, data);
      compatiblePaths.add(path);
    } catch (error) {
      if (error instanceof PersistedCanonicalScopeError) {
        throw scopeError(base.correlationId, error);
      }
      throw error;
    }
  };

  const stamp = (path: string, data: Record<string, unknown>): Record<string, unknown> => {
    if (!SCOPE_STAMPED_COLLECTIONS.has(transactionCollection(path))) {
      return data;
    }
    if (data.dataScope !== undefined || data.testSessionId !== undefined) {
      assertCompatible(path, data);
    }
    return { ...data, ...canonicalScopeFields(scope) };
  };

  const assertTestWriteAllowed = (path: string): void => {
    if (
      scope.dataScope === 'test' &&
      TEST_UNSUPPORTED_WRITE_COLLECTIONS.has(transactionCollection(path))
    ) {
      throw new CanonicalCommandError('cross_scope_forbidden', {
        correlationId: base.correlationId,
        details: { reason: 'unsupported' },
      });
    }
  };

  const tx: CanonicalTransactionOperations = {
    get phase() {
      return base.tx.phase;
    },
    async get(ref: CanonicalTransactionDocumentRef) {
      const result = await base.tx.get(ref);
      if (result.exists && result.data && shouldAssertRead(ref.path, scope)) {
        assertCompatible(ref.path, result.data);
      } else if (!result.exists) {
        compatiblePaths.add(ref.path);
      }
      return result;
    },
    async query(input: CanonicalTransactionCollectionQuery) {
      const results = await base.tx.query(input);
      for (const result of results) {
        if (result.data && shouldAssertRead(result.path, scope)) {
          assertCompatible(result.path, result.data);
        }
      }
      return results;
    },
    create(ref, data) {
      assertTestWriteAllowed(ref.path);
      base.tx.create(ref, stamp(ref.path, data));
    },
    update(ref, data) {
      assertTestWriteAllowed(ref.path);
      if (
        SCOPE_STAMPED_COLLECTIONS.has(transactionCollection(ref.path)) &&
        !compatiblePaths.has(ref.path)
      ) {
        throw new CanonicalCommandError('cross_scope_forbidden', {
          correlationId: base.correlationId,
          details: { reason: 'conflict' },
        });
      }
      base.tx.update(ref, stamp(ref.path, data));
    },
    delete(ref) {
      assertTestWriteAllowed(ref.path);
      if (
        SCOPE_STAMPED_COLLECTIONS.has(transactionCollection(ref.path)) &&
        !compatiblePaths.has(ref.path)
      ) {
        throw new CanonicalCommandError('cross_scope_forbidden', {
          correlationId: base.correlationId,
          details: { reason: 'conflict' },
        });
      }
      base.tx.delete(ref);
    },
  };

  return {
    correlationId: base.correlationId,
    scope,
    plan: base.plan,
    tx,
    assertWithinBudget: () => base.assertWithinBudget(),
    transitionToWrites: () => base.transitionToWrites(),
  };
}
