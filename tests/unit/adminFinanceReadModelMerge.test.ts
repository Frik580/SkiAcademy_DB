import { describe, expect, it } from 'vitest';
import type { AdminPaymentDetailReadModel } from '@ski-academy/shared-domain';
import { mergeAdminPaymentEventPage } from '../../src/features/admin/components/finance/useAdminFinanceReadModels';

describe('Admin finance Payment pagination merge', () => {
  it('does not replace a newer provider state with an older page state', () => {
    const current = {
      providerState: {
        latestEventId: 'monetary_event_new',
        recordedAt: { seconds: 20, nanoseconds: 0 },
      },
      events: [],
    } as unknown as AdminPaymentDetailReadModel;
    const incoming = {
      providerState: {
        latestEventId: 'monetary_event_old',
        recordedAt: { seconds: 10, nanoseconds: 0 },
      },
      events: [],
    } as unknown as AdminPaymentDetailReadModel;

    expect(mergeAdminPaymentEventPage(current, incoming).providerState).toEqual(
      current.providerState
    );
  });
});
