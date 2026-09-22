import { describe, expect, it } from 'vitest';
import {
  CorrelationIdSchema,
  LIVE_CANONICAL_EXECUTION_SCOPE,
} from '@ski-academy/shared-domain';
import { createInMemoryCanonicalTransactionExecutor } from './index';
import { scopeCanonicalTransactionSession } from './scopedCanonicalTransaction';

const correlationId = CorrelationIdSchema.parse('correlation_live_scope_writer_test');

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
