import { describe, expect, it } from 'vitest';
import {
  CorrelationIdSchema,
  LIVE_CANONICAL_EXECUTION_SCOPE,
  TestSessionIdSchema,
  testCanonicalExecutionScope,
} from '@ski-academy/shared-domain';
import { createInMemoryCanonicalTransactionExecutor } from './index';
import { scopeCanonicalTransactionSession } from './scopedCanonicalTransaction';

const correlationId = CorrelationIdSchema.parse('correlation_live_scope_writer_test');
const testSessionId = TestSessionIdSchema.parse('test_scope_instructor_a01');
const otherTestSessionId = TestSessionIdSchema.parse('test_scope_instructor_b01');

describe('new LIVE canonical writes', () => {
  it('stamps scoped identity, course days, money, and outbox while leaving relationships unscoped', async () => {
    const paths = [
      'participants/participant_scope_writer_01',
      'instructors/instructor_scope_writer_01',
      'courses/course_scope_writer_01/days/course_day_scope_writer_01',
      'payments/payment_scope_writer_01',
      'provider_event_receipts/receipt_scope_writer_01',
      'domain_outbox/outbox_scope_writer_01',
      'participant_management/management_scope_writer_01',
    ];
    const executor = createInMemoryCanonicalTransactionExecutor();

    await executor.runAtomic({
      correlationId,
      run: async (baseSession) => {
        const session = scopeCanonicalTransactionSession(baseSession, LIVE_CANONICAL_EXECUTION_SCOPE);
        for (const path of paths) {
          await session.tx.get({ path });
          session.plan.planRead({ path, category: 'aggregate' });
          session.plan.planMutation({
            path,
            kind: 'create',
            category: 'aggregate',
            estimatedPayloadBytes: 128,
          });
        }
        await session.transitionToWrites();
        for (const path of paths) {
          session.tx.create(
            { path },
            path.startsWith('participant_management/')
              ? { id: path }
              : { id: path, testSessionId: undefined }
          );
        }
      },
    });

    const docs = executor.snapshot().docs;
    for (const path of paths.slice(0, -1)) {
      expect(docs.get(path)?.data).toMatchObject({ dataScope: 'live' });
      expect(docs.get(path)?.data).not.toHaveProperty('testSessionId');
    }
    expect(docs.get(paths.at(-1)!)?.data).not.toHaveProperty('dataScope');
  });
});

describe('scoped Instructor catalog reads', () => {
  const instructorPath = 'instructors/instructor_scope_reader_01';

  it('allows an Instructor read from the active TestSession', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [instructorPath]: {
        instructorId: 'instructor_scope_reader_01',
        dataScope: 'test',
        testSessionId,
      },
    });

    await executor.runAtomic({
      correlationId,
      run: async (baseSession) => {
        const session = scopeCanonicalTransactionSession(
          baseSession,
          testCanonicalExecutionScope(testSessionId)
        );
        const result = await session.tx.get({ path: instructorPath });
        session.plan.planRead({ path: instructorPath, category: 'aggregate' });
        expect(result.exists).toBe(true);
      },
    });
  });

  it('rejects an Instructor read from a different TestSession', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [instructorPath]: {
        instructorId: 'instructor_scope_reader_01',
        dataScope: 'test',
        testSessionId: otherTestSessionId,
      },
    });

    await expect(
      executor.runAtomic({
        correlationId,
        run: async (baseSession) => {
          const session = scopeCanonicalTransactionSession(
            baseSession,
            testCanonicalExecutionScope(testSessionId)
          );
          await session.tx.get({ path: instructorPath });
        },
      })
    ).rejects.toMatchObject({
      code: 'cross_scope_forbidden',
      details: { reason: 'conflict' },
    });
  });
});
