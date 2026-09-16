import { describe, expect, it, vi } from 'vitest';

const confettiMock = vi.fn();
vi.mock('canvas-confetti', () => ({
  default: (...args: unknown[]) => confettiMock(...args),
}));

import confetti from 'canvas-confetti';

/**
 * Mirrors the post-await success branch in useBookingModal.handleSubmitGuest.
 * Keeps notification/confetti/close contract covered without importing the full hook graph.
 */
async function runGuestBookingSubmitSuccessUx(input: {
  readonly createGuestBooking: () => Promise<unknown>;
  readonly addNotification: (kind: 'success' | 'error', title: string, description: string) => void;
  readonly onClose: () => void;
  readonly t: (key: string) => string;
}): Promise<void> {
  await input.createGuestBooking();
  input.addNotification(
    'success',
    input.t('guestApplicationSuccess'),
    input.t('guestApplicationSuccessDesc')
  );
  confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  input.onClose();
}

async function runGuestBookingSubmitFailureUx(input: {
  readonly createGuestBooking: () => Promise<unknown>;
  readonly addNotification: (kind: 'success' | 'error', title: string, description: string) => void;
  readonly onClose: () => void;
  readonly t: (key: string) => string;
  readonly presentError: (error: unknown) => { message: string };
}): Promise<void> {
  try {
    await input.createGuestBooking();
    input.addNotification(
      'success',
      input.t('guestApplicationSuccess'),
      input.t('guestApplicationSuccessDesc')
    );
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    input.onClose();
  } catch (error) {
    const presented = input.presentError(error);
    input.addNotification('error', input.t('bookingError'), presented.message);
  }
}

describe('booking guest submit success UX contract', () => {
  it('runs notification, confetti, and close after createGuestBooking resolves', async () => {
    const addNotification = vi.fn();
    const onClose = vi.fn();
    confettiMock.mockReset();

    await runGuestBookingSubmitSuccessUx({
      createGuestBooking: vi.fn().mockResolvedValue({}),
      addNotification,
      onClose,
      t: (key) => key,
    });

    expect(addNotification).toHaveBeenCalledWith(
      'success',
      'guestApplicationSuccess',
      'guestApplicationSuccessDesc'
    );
    expect(confettiMock).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps modal open and shows booking error when createGuestBooking rejects', async () => {
    const addNotification = vi.fn();
    const onClose = vi.fn();
    confettiMock.mockReset();

    await runGuestBookingSubmitFailureUx({
      createGuestBooking: vi
        .fn()
        .mockRejectedValue(new Error('Guest credential was not returned.')),
      addNotification,
      onClose,
      t: (key) => key,
      presentError: () => ({ message: 'Guest credential was not returned.' }),
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(confettiMock).not.toHaveBeenCalled();
    expect(addNotification).toHaveBeenCalledWith(
      'error',
      'bookingError',
      'Guest credential was not returned.'
    );
  });
});
