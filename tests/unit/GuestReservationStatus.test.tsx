import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GuestReservationStatus } from '../../src/features/guest-reservations/GuestReservationStatus';
import { LanguageProvider } from '../../src/app/providers/LanguageContext';
import { translations, type TranslationKey } from '../../src/lib/i18n/translations';

const deadline = { seconds: 1_800_000_000, nanoseconds: 0 };
const payment = {
  currency: 'KZT' as const,
  price: 25_000,
  outstandingAmount: 25_000,
  paymentSatisfied: false,
  unpaidCancellationEligible: true,
};
const t = (key: TranslationKey) => translations.en[key];

function show(overrides: Partial<Parameters<typeof GuestReservationStatus>[0]> = {}) {
  const onRefresh = vi.fn();
  const onClose = vi.fn();
  render(
    <LanguageProvider>
      <GuestReservationStatus
        kind="lesson"
        lifecycleStatus="pending"
        reservationExpiresAt={deadline}
        payment={payment}
        language="en"
        t={t}
        onRefresh={onRefresh}
        refreshing={false}
        refreshError={false}
        statusHydrated
        onClose={onClose}
        {...overrides}
      />
    </LanguageProvider>
  );
  return { onRefresh, onClose };
}

describe('guest reservation status', () => {
  it('shows canonical pending amount, deadline, and manual payment instructions without a payment action', () => {
    const { onRefresh } = show();
    expect(screen.getByText('Request created')).toBeInTheDocument();
    expect(screen.getByText(/25,000 KZT/)).toBeInTheDocument();
    expect(screen.getByText(/temporarily held until/)).toBeInTheDocument();
    expect(screen.getByText(/administrator will contact you/i)).toBeInTheDocument();
    expect(screen.getByText(/after full payment is received/i)).toBeInTheDocument();
    expect(screen.queryByText('Booking confirmed')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pay/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('shows remaining amount for partial funding while remaining pending', () => {
    show({
      payment: { ...payment, outstandingAmount: 15_000, unpaidCancellationEligible: false },
      onCancelPending: vi.fn(),
    });
    expect(screen.getByText(/Booking price: 25,000 KZT/)).toBeInTheDocument();
    expect(screen.getByText(/Remaining to pay: 15,000 KZT/)).toBeInTheDocument();
    expect(screen.queryByText('Booking confirmed')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
  });

  it('offers token-scoped cancellation only for an unpaid pending guest request', async () => {
    const onCancelPending = vi.fn().mockResolvedValue(true);
    show({ onCancelPending });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(
      screen.getByText(/Your place will no longer be held after cancellation/)
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel request' })[0]);
    await waitFor(() => expect(onCancelPending).toHaveBeenCalledOnce());
  });

  it('keeps cancellation confirmation open when the command fails', async () => {
    const onCancelPending = vi.fn().mockResolvedValue(false);
    show({ onCancelPending });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel request' })[0]);
    await waitFor(() => expect(onCancelPending).toHaveBeenCalledOnce());
    expect(
      screen.getByText(/Your place will no longer be held after cancellation/)
    ).toBeInTheDocument();
  });

  it('uses course-specific pending wording with the canonical amount and deadline', () => {
    show({ kind: 'course' });
    expect(screen.getByText(/place on the course is temporarily held until/)).toBeInTheDocument();
    expect(screen.getByText(/25,000 KZT/)).toBeInTheDocument();
    expect(
      screen.getByText(/course enrollment will be confirmed after full payment/i)
    ).toBeInTheDocument();
  });

  it('renders prepared course reservation details and permits canonical unpaid cancellation', () => {
    show({
      kind: 'course',
      onCancelPending: vi.fn(),
      reservationDetails: {
        title: 'Carving course',
        participantName: 'Guest participant',
        scheduleLines: [{ courseDayId: 'day_01', label: 'Dec 12, 2026 · 10:00–12:00' }],
      },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Carving course');
    expect(screen.getByRole('status')).toHaveTextContent('Guest participant');
    expect(screen.getByRole('listitem')).toHaveTextContent('Dec 12, 2026 · 10:00–12:00');
    expect(screen.getByRole('button', { name: 'Cancel request' })).toBeEnabled();
  });

  it('shows confirmed only for canonical confirmed lifecycle', () => {
    show({
      lifecycleStatus: 'confirmed',
      payment: {
        ...payment,
        outstandingAmount: 0,
        paymentSatisfied: true,
        unpaidCancellationEligible: false,
      },
    });
    expect(screen.getByText('Booking confirmed')).toBeInTheDocument();
    expect(
      screen.getByText('Payment received. Your reservation is confirmed.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/administrator will contact/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument();
  });

  it('shows expiry without active payment instructions for lesson and course', () => {
    show({ kind: 'course', lifecycleStatus: 'cancelled', reasonCode: 'reservation_expired' });
    expect(screen.getByText('Course place hold expired')).toBeInTheDocument();
    expect(screen.queryByText(/administrator will contact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Booking price:/)).not.toBeInTheDocument();
  });

  it('shows a generic cancellation for a different canonical reason', () => {
    show({ lifecycleStatus: 'cancelled', reasonCode: 'administrator_cancelled' });
    expect(screen.getByText('Reservation cancelled')).toBeInTheDocument();
    expect(screen.queryByText('Reservation expired')).not.toBeInTheDocument();
  });

  it('offers a new booking for a terminal request', () => {
    const onNewBooking = vi.fn();
    show({ lifecycleStatus: 'cancelled', reasonCode: 'reservation_expired', onNewBooking });
    fireEvent.click(screen.getByRole('button', { name: 'New booking' }));
    expect(onNewBooking).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Check status' })).not.toBeInTheDocument();
  });

  it('preserves the state and reports a neutral refresh error', () => {
    show({ refreshError: true });
    expect(screen.getByText('Request created')).toBeInTheDocument();
    expect(screen.getByText(/Could not refresh the reservation status/)).toBeInTheDocument();
  });
});
