import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KaspiPaymentPanel } from '../../src/features/kaspi-payments/KaspiPaymentPanel';
import { translations, type TranslationKey } from '../../src/lib/i18n/translations';
const service = vi.hoisted(() => ({
  kaspiConfiguration: vi.fn(),
  loadKaspiRequests: vi.fn(),
  createKaspiRequest: vi.fn(),
  claimKaspiRequest: vi.fn(),
  locale: undefined as 'en' | 'ru' | undefined,
}));
vi.mock('../../src/features/kaspi-payments/kaspiService', () => service);
vi.mock('../../src/lib/functions/functionsClient', () => ({
  callFunction: () => {
    throw new Error('Network forbidden in this UI test');
  },
}));
vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: vi.fn(),
  executeGuestCanonicalCommand: vi.fn(),
}));
vi.mock('../../src/features/kaspi-payments/useKaspiTranslations', () => ({
  useKaspiTranslations: () => ({
    t: (key: TranslationKey) => (service.locale ? translations[service.locale][key] : key),
    formatKzt: (amount: number) => `${amount} ₸`,
    language: 'en',
  }),
}));
const request = {
  requestId: 'd197f0ca-6727-40b3-854a-c6e62f94fabc',
  type: 'wallet_topup',
  amount: 10000,
  status: 'awaiting_payment',
  revision: 1,
  expiresAt: { seconds: 4102444800, nanoseconds: 0 },
  merchantKey: 'test-merchant',
};
describe('Kaspi payment request UI', () => {
  it('reports a missing guest credential as a handled asynchronous read error', async () => {
    const actual = await vi.importActual<
      typeof import('../../src/features/kaspi-payments/kaspiService')
    >('../../src/features/kaspi-payments/kaspiService');
    await expect(
      actual.loadKaspiRequests({
        type: 'guest_course_payment',
        subjectId: 'enrollment_missing_credential',
      })
    ).rejects.toThrow('Guest credential unavailable');
  }, 30000);
  beforeEach(() => {
    vi.resetAllMocks();
    service.locale = undefined;
    service.kaspiConfiguration.mockResolvedValue({
      enabled: true,
      qrImageUrl: 'https://example.invalid/test.png',
      merchantName: 'TEST ONLY',
      merchantKey: 'test-merchant',
    });
    service.loadKaspiRequests.mockResolvedValue({ items: [], hasMore: false });
  });
  it('renders no container with flag OFF', async () => {
    service.kaspiConfiguration.mockResolvedValue({ enabled: false });
    const { container } = render(<KaspiPaymentPanel accountId="owner" />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText('kaspiTopup')).not.toBeInTheDocument();
    expect(service.createKaspiRequest).not.toHaveBeenCalled();
  });
  it.each(['en', 'ru'] as const)('uses the same visibility rule in %s', async (locale) => {
    service.locale = locale;
    const { container } = render(<KaspiPaymentPanel accountId="owner" />);
    await screen.findByRole('region', { name: translations[locale].kaspiTitle });
    service.kaspiConfiguration.mockResolvedValue({ enabled: false });
    await act(async () => window.dispatchEvent(new Event('kaspi-configuration-changed')));
    expect(container).toBeEmptyDOMElement();
  });
  it.each(['awaiting_payment', 'requires_clarification'])(
    'allows reporting an existing %s payment after disable',
    async (status) => {
      service.kaspiConfiguration.mockResolvedValue({ enabled: false });
      const existing = { ...request, status };
      service.loadKaspiRequests.mockResolvedValue({ items: [existing], hasMore: false });
      render(<KaspiPaymentPanel accountId="owner" />);
      const report = await screen.findByRole('button', { name: 'kaspiReportPastPayment' });
      expect(screen.getByRole('region', { name: 'kaspiHistoryTitle' })).toBeInTheDocument();
      expect(screen.queryByText('kaspiTitle')).not.toBeInTheDocument();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.queryByText('kaspiTopup')).not.toBeInTheDocument();
      fireEvent.click(report);
      await waitFor(() =>
        expect(service.claimKaspiRequest).toHaveBeenCalledWith(existing, 'owner', undefined)
      );
    }
  );
  it.each([
    undefined,
    { type: 'guest_booking_payment' as const, subjectId: 'booking_123' },
    { type: 'guest_course_payment' as const, subjectId: 'enrollment_123' },
  ])('hides the entire disabled surface for %j', async (guest) => {
    service.kaspiConfiguration.mockResolvedValue({ enabled: false });
    const { container } = render(
      <KaspiPaymentPanel accountId={guest ? '' : 'owner'} guest={guest} />
    );
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(service.createKaspiRequest).not.toHaveBeenCalled();
  });
  it('renders nothing while configuration is loading or fails', async () => {
    let reject!: (reason: Error) => void;
    service.kaspiConfiguration.mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    const { container } = render(<KaspiPaymentPanel accountId="owner" />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    await act(async () => reject(new Error('offline')));
    expect(container).toBeEmptyDOMElement();
  });
  it('revalidates ON/OFF and fails closed on a failed refresh', async () => {
    const { container } = render(<KaspiPaymentPanel accountId="owner" />);
    await screen.findByText('kaspiTopup');
    service.kaspiConfiguration.mockResolvedValue({ enabled: false });
    await act(async () => window.dispatchEvent(new Event('kaspi-configuration-changed')));
    expect(container).toBeEmptyDOMElement();
    service.kaspiConfiguration.mockResolvedValue({ enabled: true });
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(screen.getByText('kaspiTopup')).toBeInTheDocument();
    service.kaspiConfiguration.mockRejectedValue(new Error('offline'));
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(container).toBeEmptyDOMElement();
  });
  it('ignores an older ON response after a newer OFF response', async () => {
    let resolve!: (value: { enabled: boolean }) => void;
    service.kaspiConfiguration.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    const { container } = render(<KaspiPaymentPanel accountId="owner" />);
    service.kaspiConfiguration.mockResolvedValue({ enabled: false });
    await act(async () => window.dispatchEvent(new Event('focus')));
    await act(async () => resolve({ enabled: true }));
    expect(container).toBeEmptyDOMElement();
  });
  it('clears ON immediately while revalidating, retaining history without a payable QR', async () => {
    service.loadKaspiRequests.mockResolvedValue({ items: [request], hasMore: false });
    render(<KaspiPaymentPanel accountId="owner" />);
    await screen.findByRole('img');
    service.kaspiConfiguration.mockReturnValue(new Promise(() => {}));
    fireEvent.focus(window);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText(request.requestId)).toBeInTheDocument();
    expect(screen.getByText('kaspiReportPastPayment')).toBeInTheDocument();
  });
  it('creates a request and shows only server-provided QR and amount', async () => {
    service.loadKaspiRequests
      .mockResolvedValueOnce({ items: [], hasMore: false })
      .mockResolvedValue({ items: [request], hasMore: false });
    render(<KaspiPaymentPanel accountId="owner" />);
    await screen.findByText('kaspiTopup');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10000' } });
    fireEvent.click(screen.getByText('kaspiTopup'));
    expect(await screen.findByRole('img')).toHaveAttribute(
      'src',
      'https://example.invalid/test.png'
    );
    expect(service.createKaspiRequest).toHaveBeenCalledWith(
      expect.stringMatching(/^[\da-f-]{36}$/),
      'owner',
      10000,
      undefined
    );
    expect(screen.queryByText('kaspiStatus_confirmed')).not.toBeInTheDocument();
  });
  it('locks a double payment statement and never reports it as confirmed', async () => {
    service.loadKaspiRequests.mockResolvedValue({ items: [request], hasMore: false });
    let resolve!: () => void;
    service.claimKaspiRequest.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        })
    );
    render(<KaspiPaymentPanel accountId="owner" />);
    const button = await screen.findByText('kaspiIHavePaid');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(service.claimKaspiRequest).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    service.loadKaspiRequests.mockResolvedValue({
      items: [{ ...request, status: 'payment_claimed' }],
      hasMore: false,
    });
    resolve();
    expect(await screen.findByText('kaspiAwaitingReview')).toBeInTheDocument();
    expect(screen.queryByText('kaspiStatus_confirmed')).not.toBeInTheDocument();
  });
  it('does not let an old mutation refresh replace a newly opened guest scope', async () => {
    let resolve!: () => void;
    service.createKaspiRequest.mockReturnValue(
      new Promise<void>((done) => {
        resolve = done;
      })
    );
    const { rerender } = render(
      <KaspiPaymentPanel guest={{ type: 'guest_booking_payment', subjectId: 'first' }} />
    );
    fireEvent.click(await screen.findByText('kaspiOpenPayment'));
    rerender(<KaspiPaymentPanel guest={{ type: 'guest_booking_payment', subjectId: 'second' }} />);
    await waitFor(() => expect(service.kaspiConfiguration).toHaveBeenCalledTimes(2));
    await act(async () => {});
    const reads = service.loadKaspiRequests.mock.calls.length;
    await act(async () => resolve());
    expect(service.kaspiConfiguration).toHaveBeenCalledTimes(2);
    expect(service.loadKaspiRequests).toHaveBeenCalledTimes(reads);
    expect(screen.getByText('kaspiOpenPayment')).toBeEnabled();
  });
  it('opens a guest payment without registration or an amount form', async () => {
    render(
      <KaspiPaymentPanel guest={{ type: 'guest_booking_payment', subjectId: 'booking_123' }} />
    );
    fireEvent.click(await screen.findByText('kaspiOpenPayment'));
    await waitFor(() =>
      expect(service.createKaspiRequest).toHaveBeenCalledWith(expect.any(String), '', 0, {
        type: 'guest_booking_payment',
        subjectId: 'booking_123',
      })
    );
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });
  it('fails closed when history cannot be loaded', async () => {
    service.loadKaspiRequests.mockRejectedValue(new Error('offline'));
    const { container } = render(<KaspiPaymentPanel accountId="owner" />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(service.createKaspiRequest).not.toHaveBeenCalled();
  });
  it('accepts a statement about an expired payment without displaying a payable QR', async () => {
    service.loadKaspiRequests.mockResolvedValue({
      items: [{ ...request, status: 'expired', expiresAt: { seconds: 1, nanoseconds: 0 } }],
      hasMore: false,
    });
    render(<KaspiPaymentPanel accountId="owner" />);
    const button = await screen.findByText('kaspiReportPastPayment');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(service.claimKaspiRequest).toHaveBeenCalledTimes(1));
  });
  it('does not display a new merchant QR for an old merchant request', async () => {
    service.loadKaspiRequests.mockResolvedValue({
      items: [{ ...request, merchantKey: 'previous-merchant' }],
      hasMore: false,
    });
    render(<KaspiPaymentPanel accountId="owner" />);
    await screen.findByText(/kaspiStatus_awaiting_payment/);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('does not offer a new QR request for a guest subject that is no longer eligible', async () => {
    render(
      <KaspiPaymentPanel
        guest={{ type: 'guest_booking_payment', subjectId: 'booking_123' }}
        canCreate={false}
      />
    );
    await screen.findByText('kaspiManualNotice');
    expect(screen.queryByText('kaspiOpenPayment')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'kaspiRefreshPayment' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'guestCheckStatus' })).not.toBeInTheDocument();
  });
});
