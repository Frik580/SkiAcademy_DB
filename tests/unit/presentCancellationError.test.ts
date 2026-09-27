import { describe, expect, it } from 'vitest';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';
import { presentCancellationError } from '../../src/features/student-cabinet/presentCancellationError';
import { translations } from '../../src/lib/i18n/translations';

const t = (key: string) => translations.en[key as keyof typeof translations.en];

describe('cancellation command errors', () => {
  it.each([
    ['startsAt', 'cancelTooLate'],
    ['reservationExpiresAt', 'cancelReservationExpired'],
    ['paymentId', 'cancelPaymentChanged'],
  ] as const)('uses canonical %s detail for %s copy', (field, key) => {
    const error = new CanonicalCommandClientError('invalid_transition', {
      correlationId: 'correlation_cancel_error',
      details: { field, reason: 'out_of_range' },
    });
    expect(presentCancellationError(error, t).message).toBe(translations.en[key]);
  });

  it('does not label an unrelated lifecycle rejection as expiry', () => {
    const error = new CanonicalCommandClientError('invalid_transition', {
      correlationId: 'correlation_cancel_error',
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
    expect(presentCancellationError(error, t).message).toBe(translations.en.cancelStatusChanged);
  });

  it('uses the paid-reservation explanation for a guest payment conflict', () => {
    const error = new CanonicalCommandClientError('invalid_transition', {
      correlationId: 'correlation_cancel_error',
      details: { field: 'paymentId', reason: 'unsupported' },
    });
    expect(presentCancellationError(error, t, true).message).toBe(translations.en.cancelPaymentConflict);
  });

  it('describes a guest credential rejection without asking the guest to sign in', () => {
    const error = new CanonicalCommandClientError('unauthorized', {
      correlationId: 'correlation_cancel_error',
    });
    expect(presentCancellationError(error, t, true).message).toBe(translations.en.cancelUnauthorized);
  });
});
