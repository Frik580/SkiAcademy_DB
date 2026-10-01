import {
  CanonicalCommandClientError,
  mapCanonicalErrorMessage,
} from '../../lib/canonical/mapCanonicalCommandError';
import type { CommandErrorCode } from '@ski-academy/shared-domain';
import {
  formatParticipantBookingConflictMessage,
  participantConflictIdsFromDetails,
} from './lessonBookingParticipantPresentation';

export interface PresentedCanonicalCommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
  readonly correlationId?: string;
  readonly currentRevision?: number;
  readonly details?: CanonicalCommandClientError['details'];
  readonly shouldRefresh?: boolean;
}

export function presentCanonicalCommandError(error: unknown): PresentedCanonicalCommandError {
  const normalized =
    error instanceof CanonicalCommandClientError
      ? error
      : new CanonicalCommandClientError('internal', {
          correlationId: 'correlation_unknown',
          cause: error,
        });

  const shouldRefresh =
    normalized.code === 'stale_version' ||
    normalized.code === 'concurrent_modification' ||
    normalized.code === 'idempotency_conflict' ||
    normalized.code === 'instructor_conflict' ||
    normalized.code === 'participant_conflict' ||
    normalized.code === 'resource_conflict';

  return {
    code: normalized.code,
    message: mapCanonicalErrorMessage(normalized.code),
    correlationId: normalized.correlationId,
    currentRevision: normalized.currentRevision,
    details: normalized.details,
    shouldRefresh,
  };
}

export function presentCanonicalCommandErrorWithContext(
  error: unknown,
  context: {
    readonly t: (key: string, ...args: unknown[]) => string;
    readonly resolveParticipantDisplayName?: (participantId: string) => string | undefined;
  }
): PresentedCanonicalCommandError {
  const presented = presentCanonicalCommandError(error);
  switch (presented.code) {
    case 'insufficient_funds':
      return { ...presented, message: context.t('insufficientFunds') };
    case 'payment_required':
      return { ...presented, message: context.t('bookingBalanceTooLow') };
    case 'participant_conflict': {
      const conflictParticipantIds = participantConflictIdsFromDetails(presented.details);
      if (conflictParticipantIds.length > 0 && context.resolveParticipantDisplayName) {
        return {
          ...presented,
          message: formatParticipantBookingConflictMessage({
            participantIds: conflictParticipantIds,
            resolveDisplayName: context.resolveParticipantDisplayName,
            t: context.t,
          }),
        };
      }
      return { ...presented, message: context.t('slotUnavailable') };
    }
    case 'instructor_conflict':
    case 'resource_conflict':
      return { ...presented, message: context.t('slotUnavailable') };
    case 'forbidden':
      return { ...presented, message: context.t('accessSuspended') };
    case 'unauthorized':
      return { ...presented, message: context.t('signInRequired') };
    case 'blocked_relationship':
      return { ...presented, message: context.t('instructorNotAccepting') };
    case 'duplicate_active_enrollment':
      return { ...presented, message: context.t('alreadyEnrolledDesc') };
    case 'guest_reservation_limit':
      return { ...presented, message: context.t('guestReservationLimit') };
    default:
      return presented;
  }
}
