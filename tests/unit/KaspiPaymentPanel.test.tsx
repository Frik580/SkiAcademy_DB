import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWalletStore } from '../../src/features/wallet/walletStore';
import { KaspiPaymentPanel } from '../../src/features/kaspi-payments/KaspiPaymentPanel';
import { translations, type TranslationKey } from '../../src/lib/i18n/translations';
const service = vi.hoisted(() => ({
  kaspiConfiguration: vi.fn(),
  loadKaspiRequests: vi.fn(),
  loadKaspiRequest: vi.fn(),
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
    useWalletStore.getState().resetCanonicalWallet();
    service.kaspiConfiguration.mockResolvedValue({
      enabled: true,
      qrImageUrl: 'https://example.invalid/test.png',
      merchantName: 'TEST ONLY',
      merchantKey: 'test-merchant',
    });
    service.loadKaspiRequests.mockResolvedValue({ items: [], hasMore: false });
    service.loadKaspiRequest.mockResolvedValue({ items: [request], hasMore: false });
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
    expect(screen.queryByText(request.requestId)).not.toBeInTheDocument();
    expect(screen.getByText(/10000 ₸/)).toBeInTheDocument();
    expect(screen.getByText('kaspiReportPastPayment')).toBeInTheDocument();
  });
  it('creates a request and shows only server-provided QR and amount', async () => {
    service.loadKaspiRequests
      .mockResolvedValueOnce({ items: [], hasMore: false })
      .mockResolvedValue({ items: [request], hasMore: false });
    render(<KaspiPaymentPanel accountId="owner" />);
    await screen.findByText('kaspiTopup');
    fireEvent.click(screen.getByText('kaspiTopup'));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10000' } });
    fireEvent.click(screen.getByText('kaspiConfirmAmount'));
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
    expect(screen.queryByText('kaspiWalletStatus_confirmed')).not.toBeInTheDocument();
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
    expect(screen.queryByText('kaspiWalletStatus_confirmed')).not.toBeInTheDocument();
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
    await screen.findByText(/kaspiWalletStatus_awaiting_payment/);
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
  it.each(['en', 'ru'] as const)(
    'shows the simple amount confirmation flow in %s',
    async (locale) => {
      service.locale = locale;
      render(<KaspiPaymentPanel accountId="owner" />);
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
      fireEvent.click(await screen.findByRole('button', { name: translations[locale].kaspiTopup }));
      const confirm = screen.getByRole('button', { name: translations[locale].kaspiConfirmAmount });
      expect(confirm).toBeDisabled();
      for (const value of ['0', '-1', '1.5', '9007199254740992']) {
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value } });
        expect(confirm).toBeDisabled();
      }
      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1234' } });
      expect(service.createKaspiRequest).not.toHaveBeenCalled();
      fireEvent.click(confirm);
      await waitFor(() => expect(service.createKaspiRequest).toHaveBeenCalledTimes(1));
    }
  );
  it('locks double amount confirmation and reuses its id after an ambiguous failure', async () => {
    service.createKaspiRequest.mockRejectedValueOnce(new Error('connection lost'));
    render(<KaspiPaymentPanel accountId="owner" />);
    fireEvent.click(await screen.findByText('kaspiTopup'));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10000' } });
    const confirm = screen.getByText('kaspiConfirmAmount');
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await screen.findByRole('alert');
    expect(service.createKaspiRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('spinbutton')).toBeDisabled();
    fireEvent.click(screen.getByText('kaspiConfirmAmount'));
    await waitFor(() => expect(service.createKaspiRequest).toHaveBeenCalledTimes(2));
    expect(service.createKaspiRequest.mock.calls[0]).toEqual(
      service.createKaspiRequest.mock.calls[1]
    );
  });
  it('expires the QR locally, allows a new top-up and preserves late payment reporting', async () => {
    const existing = {
      ...request,
      expiresAt: { seconds: Math.floor(Date.now() / 1000) + 2, nanoseconds: 0 },
    };
    service.loadKaspiRequests.mockResolvedValue({ items: [existing], hasMore: false });
    vi.useFakeTimers();
    try {
      await act(async () => {
        render(<KaspiPaymentPanel accountId="owner" />);
      });
      expect(screen.getByRole('img')).toBeInTheDocument();
      await act(async () => vi.advanceTimersByTime(2100));
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.getByText('kaspiWalletStatus_expired')).toBeInTheDocument();
      fireEvent.click(screen.getByText('kaspiTopup'));
      expect(screen.getByRole('spinbutton')).toBeInTheDocument();
      fireEvent.click(screen.getByText('kaspiReportPastPayment'));
      expect(service.claimKaspiRequest).toHaveBeenCalledWith(existing, 'owner', undefined);
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(['en', 'ru'] as const)(
    'translates wallet statuses and hides technical fields in %s',
    async (locale) => {
      service.locale = locale;
      const statuses = [
        'awaiting_payment',
        'payment_claimed',
        'confirmed',
        'expired',
        'requires_clarification',
        'refund_required',
      ] as const;
      service.loadKaspiRequests.mockResolvedValue({
        items: statuses.map((status) => ({ ...request, requestId: `internal-${status}`, status })),
        hasMore: false,
      });
      render(<KaspiPaymentPanel accountId="owner" />);
      await screen.findByText(translations[locale].kaspiWalletStatus_confirmed);
      for (const status of statuses) {
        expect(
          screen.getByText(translations[locale][`kaspiWalletStatus_${status}`])
        ).toBeInTheDocument();
        expect(screen.queryByText(`internal-${status}`)).not.toBeInTheDocument();
      }
      expect(screen.queryByText(translations[locale].kaspiHoldNotice)).not.toBeInTheDocument();
      expect(screen.queryByText(translations[locale].kaspiBankReference)).not.toBeInTheDocument();
    }
  );
  it('refreshes top-up status on the existing canonical wallet revision without a manual action', async () => {
    useWalletStore.getState().syncCanonicalWalletFromSnapshot({
      accountId: 'owner',
      exists: true,
      balanceKzt: 0,
      eventRevision: 0,
    });
    service.loadKaspiRequests.mockResolvedValue({
      items: [{ ...request, status: 'payment_claimed' }],
      hasMore: false,
    });
    render(<KaspiPaymentPanel accountId="owner" />);
    await screen.findByText('kaspiWalletStatus_payment_claimed');
    service.loadKaspiRequests.mockResolvedValue({
      items: [{ ...request, status: 'confirmed' }],
      hasMore: false,
    });
    act(() =>
      useWalletStore.getState().syncCanonicalWalletFromSnapshot({
        accountId: 'owner',
        exists: true,
        balanceKzt: 10000,
        eventRevision: 1,
      })
    );
    await screen.findByText('kaspiWalletStatus_confirmed');
    expect(service.claimKaspiRequest).not.toHaveBeenCalled();
    expect(service.createKaspiRequest).not.toHaveBeenCalled();
  });
  it('shows the created request even when it is beyond the first history page', async () => {
    service.loadKaspiRequests.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, index) => ({
        ...request,
        requestId: `old-${index}`,
        status: 'confirmed',
      })),
      hasMore: true,
      nextCursor: 'old-19',
    });
    render(<KaspiPaymentPanel accountId="owner" />);
    fireEvent.click(await screen.findByText('kaspiTopup'));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '10000' } });
    fireEvent.click(screen.getByText('kaspiConfirmAmount'));
    await screen.findByRole('img');
    expect(service.loadKaspiRequest).toHaveBeenCalledWith(
      service.createKaspiRequest.mock.calls[0][0]
    );
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('kaspiMore')).toBeInTheDocument();
    service.loadKaspiRequests.mockResolvedValue({ items: [request], hasMore: false });
    fireEvent.click(screen.getByText('kaspiMore'));
    await waitFor(() => expect(screen.queryByText('kaspiMore')).not.toBeInTheDocument());
    expect(screen.getAllByText('kaspiWalletStatus_awaiting_payment')).toHaveLength(1);
    expect(service.loadKaspiRequest).toHaveBeenCalledTimes(1);
  });
});
