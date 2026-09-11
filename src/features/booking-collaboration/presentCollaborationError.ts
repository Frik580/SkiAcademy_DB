import { CanonicalCommandClientError } from '../../lib/canonical/mapCanonicalCommandError';
import {
  presentCanonicalCommandError,
  presentCanonicalCommandErrorWithContext as presentLessonBookingCommandErrorWithContext,
  type PresentedCanonicalCommandError,
} from '../lesson-bookings/presentCanonicalCommandError';

export { presentCanonicalCommandError, type PresentedCanonicalCommandError };

export function presentCanonicalCommandErrorWithContext(
  error: unknown,
  context: { readonly t: (key: string, ...args: unknown[]) => string }
): PresentedCanonicalCommandError {
  const presented = presentCanonicalCommandError(error);
  const details = error instanceof CanonicalCommandClientError ? error.details : undefined;

  if (presented.code === 'participant_conflict') {
    return { ...presented, message: context.t('collabParticipantBusyAtTime') };
  }

  if (presented.code === 'forbidden') {
    if (details?.resourceKind === 'participant') {
      return { ...presented, message: context.t('collabProposalNotPermitted') };
    }
    return presented;
  }

  return presentLessonBookingCommandErrorWithContext(error, context);
}
