import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { KaspiPaymentsAdmin } from '../../src/features/kaspi-payments/KaspiPaymentsAdmin';
import { ADMIN_TEST_SESSION_QUERY_KEY } from '../../src/features/admin/adminNavigation';
const query = vi.hoisted(() => vi.fn());
const execute = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/kaspi-payments/kaspiService', () => ({ queryKaspi: query }));
vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: execute,
}));
vi.mock('../../src/features/kaspi-payments/useKaspiTranslations', () => ({
  useKaspiTranslations: () => ({ t: (key: string) => key, formatKzt: String, language: 'en' }),
}));
describe('Kaspi Administrator test-session isolation', () => {
  it('does not read or offer live financial commands when a test session is selected', () => {
    render(
      <MemoryRouter initialEntries={[`/admin?${ADMIN_TEST_SESSION_QUERY_KEY}=test_session_kaspi`]}>
        <KaspiPaymentsAdmin accountId="administrator" />
      </MemoryRouter>
    );
    expect(screen.getByText('kaspiTestUnavailable')).toBeInTheDocument();
    expect(query).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  it('validates and submits a partial bank refund using the selected remaining amount', async () => {
    const request = {
      requestId: 'd197f0ca-6727-40b3-854a-c6e62f94fabc',
      type: 'guest_booking_payment',
      amount: 10000,
      receipt: { amount: 10000, receivedAt: { seconds: 1 } },
      refundedAmount: 2000,
      status: 'refunded',
      revision: 4,
      createdAt: { seconds: 1 },
    };
    query.mockImplementation(async ({ scope }: { scope: string }) => ({
      items: scope === 'admin' ? [request] : [],
      hasMore: false,
    }));
    execute.mockResolvedValue({ status: 'success' });
    render(
      <MemoryRouter>
        <KaspiPaymentsAdmin accountId="administrator" />
      </MemoryRouter>
    );
    await screen
      .findByRole('button', { name: new RegExp(request.requestId) })
      .then((button) => fireEvent.click(button));
    fireEvent.change(screen.getByLabelText('kaspiReason'), {
      target: { value: 'Approved partial refund' },
    });
    const amount = screen.getByLabelText('kaspiRefundAmount');
    expect(amount).toHaveValue(8000);
    for (const invalid of ['0', '8001', '1.5']) {
      fireEvent.change(amount, { target: { value: invalid } });
      fireEvent.click(screen.getByRole('button', { name: 'kaspiAction_require_refund' }));
      expect(execute).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('kaspiError');
    }
    fireEvent.change(amount, { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('button', { name: 'kaspiAction_require_refund' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm', exact: true }));
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(
        'administrator',
        expect.objectContaining({
          intent: expect.objectContaining({ action: 'require_refund', refundAmount: 3000 }),
          expectedRevision: 4,
        })
      )
    );
  });
});
