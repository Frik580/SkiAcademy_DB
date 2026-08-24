import { describe, expect, it } from 'vitest';
import {
  CorrelationIdSchema,
  TRANSACTION_PLANNING_FIXTURES,
  TRANSACTION_SAFETY_BUDGET,
  evaluateTransactionPreflight,
  operationTooLargeFromPreflight,
  syntheticBudgetBoundaryPlan,
} from '@ski-academy/shared-domain';
import {
  CanonicalTransactionPhaseError,
  createInMemoryCanonicalTransactionExecutor,
  guardCanonicalTransactionSideEffect,
  isInsideCanonicalTransactionCallback,
} from './index';

const correlationId = CorrelationIdSchema.parse('correlation_tx_test_01');

describe('canonical transaction phase discipline', () => {
  it('requires reads before writes and rejects late reads', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();

    await expect(
      executor.runAtomic({
        correlationId,
        run: async (session) => {
          session.tx.create({ path: 'bookings/late_read' }, { status: 'confirmed' });
        },
      })
    ).rejects.toBeInstanceOf(CanonicalTransactionPhaseError);

    expect(executor.snapshot().writesAttempted).toBe(0);
  });

  it('commits all planned writes atomically after authoritative preflight', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();

    await executor.runAtomic({
      correlationId,
      run: async (session) => {
        await session.tx.get({ path: 'bookings/read_first' });
        session.plan.planRead({ path: 'bookings/read_first', category: 'aggregate' });
        session.plan.planMutation({
          path: 'bookings/read_first',
          kind: 'create',
          category: 'aggregate',
          estimatedPayloadBytes: 1024,
        });
        await session.transitionToWrites();
        session.tx.create({ path: 'bookings/read_first' }, { status: 'confirmed' });
      },
    });

    const snapshot = executor.snapshot();
    expect(snapshot.docs.has('bookings/read_first')).toBe(true);
    expect(snapshot.writesAttempted).toBe(1);
  });

  it('rejects oversized plans before any authoritative write', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      'bookings/preflight_guard': { status: 'confirmed' },
    });

    await expect(
      executor.runAtomic({
        correlationId,
        run: async (session) => {
          await session.tx.get({ path: 'bookings/preflight_guard' });
          for (let index = 0; index < TRANSACTION_SAFETY_BUDGET.maxMutations + 1; index += 1) {
            session.plan.planMutation({
              path: `synthetic/mutation_${index}`,
              kind: 'create',
              category: 'other',
              estimatedPayloadBytes: 128,
            });
          }
          await session.transitionToWrites();
          session.tx.create({ path: 'bookings/should_not_write' }, { status: 'confirmed' });
        },
      })
    ).rejects.toMatchObject({ code: 'operation_too_large' });

    const snapshot = executor.snapshot();
    expect(snapshot.docs.has('bookings/should_not_write')).toBe(false);
    expect(snapshot.writesAttempted).toBe(0);
  });

  it('rejects static preflight before opening a transaction', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const oversized = syntheticBudgetBoundaryPlan('reads', TRANSACTION_SAFETY_BUDGET.maxReads + 1);

    await expect(
      executor.runAtomic({
        correlationId,
        staticPlan: oversized,
        run: async () => 'never',
      })
    ).rejects.toMatchObject({ code: 'operation_too_large' });
  });

  it('awaits in-flight reads before transitioning to writes', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      'bookings/pending_read': { status: 'confirmed' },
    });
    let readCompleted = false;

    await executor.runAtomic({
      correlationId,
      run: async (session) => {
        const pendingRead = session.tx.get({ path: 'bookings/pending_read' }).then((result) => {
          readCompleted = true;
          return result;
        });
        void pendingRead;
        await session.transitionToWrites();
        expect(readCompleted).toBe(true);
        session.plan.planMutation({
          path: 'bookings/pending_read',
          kind: 'update',
          category: 'aggregate',
          estimatedPayloadBytes: 256,
        });
        session.tx.update({ path: 'bookings/pending_read' }, { status: 'updated' });
      },
    });
  });
});

describe('canonical transaction retry safety', () => {
  it('forbids external side effects inside retryable transaction callbacks', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({}, { simulateRetry: true });

    await expect(
      executor.runAtomic({
        correlationId,
        run: async () => {
          expect(isInsideCanonicalTransactionCallback()).toBe(true);
          guardCanonicalTransactionSideEffect('email');
        },
      })
    ).rejects.toThrow(/External side effect/);
  });

  it('does not leave partial writes when a simulated retry ultimately fails preflight', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({}, { simulateRetry: true });

    await expect(
      executor.runAtomic({
        correlationId,
        run: async (session) => {
          session.plan.planMutation({
            path: 'bookings/retry_fail',
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: TRANSACTION_SAFETY_BUDGET.maxEstimatedRequestBytes + 1,
          });
          await session.transitionToWrites();
        },
      })
    ).rejects.toMatchObject({ code: 'operation_too_large' });

    expect(executor.snapshot().writesAttempted).toBe(0);
  });
});

describe('operation_too_large transport', () => {
  it('does not expose internal preflight diagnostics through transport errors', () => {
    const plan = syntheticBudgetBoundaryPlan('reads', TRANSACTION_SAFETY_BUDGET.maxReads + 1);
    const rejected = evaluateTransactionPreflight(plan);
    expect(rejected.accepted).toBe(false);
    if (!rejected.accepted) {
      const error = operationTooLargeFromPreflight(correlationId);
      const transport = error.toTransport();
      expect(transport.code).toBe('operation_too_large');
      expect(transport).not.toHaveProperty('violations');
      expect(transport).not.toHaveProperty('estimate');
      expect(transport.details).toEqual({ reason: 'out_of_range' });
    }
  });
});

describe('canonical transaction planning fixtures through executor seam', () => {
  it('accepts representative high-fanout fixtures at the planning layer', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const fixtures = [
      TRANSACTION_PLANNING_FIXTURES.individualBooking(),
      TRANSACTION_PLANNING_FIXTURES.eightParticipantBooking(),
      TRANSACTION_PLANNING_FIXTURES.eightParticipantsTenCourseDaysEnrollment(),
      TRANSACTION_PLANNING_FIXTURES.courseTransfer(),
      TRANSACTION_PLANNING_FIXTURES.maximumOutboxObligationBoundary(),
    ];

    for (const fixture of fixtures) {
      await executor.runAtomic({
        correlationId,
        staticPlan: fixture,
        run: async (session) => {
          await session.transitionToWrites();
          return session.plan.build();
        },
      });
    }
  });
});
