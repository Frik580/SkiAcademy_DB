import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentGateway } from '../../src/components/PaymentGateway';

vi.mock('../../src/components/PushNotificationHub', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}));

vi.mock('../../src/lib/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));

describe('PaymentGateway', () => {
  const onClose = vi.fn();
  const onPaymentSuccess = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when closed', () => {
    const { container } = render(
      <PaymentGateway
        isOpen={false}
        onClose={onClose}
        currentBalance={100}
        onPaymentSuccess={onPaymentSuccess}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders current balance and amount options', () => {
    render(
      <PaymentGateway
        isOpen={true}
        onClose={onClose}
        currentBalance={250}
        onPaymentSuccess={onPaymentSuccess}
      />
    );

    expect(screen.getByText('$250')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '$50' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '$100' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '$200' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '$500' })).toBeInTheDocument();
  });

  it('switches selected amount when clicking an option', async () => {
    render(
      <PaymentGateway
        isOpen={true}
        onClose={onClose}
        currentBalance={0}
        onPaymentSuccess={onPaymentSuccess}
      />
    );

    const amount200 = screen.getByRole('button', { name: '$200' });
    await userEvent.click(amount200);
    expect(amount200).toHaveClass('font-bold');
  });

  it('does not submit payment when fields are empty', async () => {
    render(
      <PaymentGateway
        isOpen={true}
        onClose={onClose}
        currentBalance={0}
        onPaymentSuccess={onPaymentSuccess}
      />
    );

    const payButton = screen.getByRole('button', { name: /authorizeTopUp/i });
    await userEvent.click(payButton);

    await waitFor(() => {
      expect(onPaymentSuccess).not.toHaveBeenCalled();
    });
    expect(payButton).not.toBeDisabled();
  });

  it('calls onPaymentSuccess with selected amount after successful simulated payment', async () => {
    render(
      <PaymentGateway
        isOpen={true}
        onClose={onClose}
        currentBalance={0}
        onPaymentSuccess={onPaymentSuccess}
      />
    );

    await userEvent.type(screen.getByPlaceholderText('e.g. Alex Carter'), 'Alex Carter');
    await userEvent.type(screen.getByPlaceholderText('4000 1234 5678 9010'), '4000 1234 5678 9010');
    await userEvent.type(screen.getByPlaceholderText('MM/YY'), '12/30');
    await userEvent.type(screen.getByPlaceholderText('***'), '123');

    const payButton = screen.getByRole('button', { name: /authorizeTopUp/i });
    await userEvent.click(payButton);

    await waitFor(() => expect(onPaymentSuccess).toHaveBeenCalledWith(100), {
      timeout: 5000,
    });
  });
});
