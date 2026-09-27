import { CanonicalCommandClientError } from '../../lib/canonical/mapCanonicalCommandError';
import {
  presentCanonicalCommandErrorWithContext,
  type PresentedCanonicalCommandError,
} from '../lesson-bookings/presentCanonicalCommandError';

export function presentCancellationError(
  error: unknown,
  t: (key: string) => string,
  guest = false
): PresentedCanonicalCommandError {
  const presented = presentCanonicalCommandErrorWithContext(error, { t });
  if (!(error instanceof CanonicalCommandClientError)) return presented;

  if (guest && (error.code === 'unauthorized' || error.code === 'forbidden')) {
    return { ...presented, message: t('cancelUnauthorized') };
  }
  if (error.code === 'expired' || error.details?.field === 'reservationExpiresAt') {
    return { ...presented, message: t('cancelReservationExpired') };
  }
  if (error.code === 'invalid_transition') {
    if (error.details?.field === 'startsAt') {
      return { ...presented, message: t('cancelTooLate') };
    }
    if (error.details?.field === 'paymentId') {
      return { ...presented, message: t(guest ? 'cancelPaymentConflict' : 'cancelPaymentChanged') };
    }
    return { ...presented, message: t('cancelStatusChanged') };
  }
  return presented;
}
