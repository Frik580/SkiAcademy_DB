import {
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  type Account,
  type Booking,
  type CommandEnvelope,
  type Participant,
  type ParticipantManagement,
} from '@ski-academy/shared-domain';
import {
  assertAdministrator,
  assertAuthorizedParticipantManager,
  requireAccountActor,
} from '../participantAccess/participantAccessAuthorization';

export function assertAuthenticatedClientCancellationAuthorization(
  envelope: CommandEnvelope<'request_booking_cancellation' | 'withdraw_booking_cancellation_request'>,
  input: Readonly<{
    account: Account;
    participant: Participant;
    management: ParticipantManagement;
    participantId: string;
  }>
): void {
  if (envelope.context.source !== 'client_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (
    envelope.context.exercisedCapability !== 'account_owner' &&
    envelope.context.exercisedCapability !== 'parent_guardian'
  ) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }

  const access = assertAuthorizedParticipantManager(
    envelope,
    input,
    input.participantId as Participant['participantId']
  );
  if (!access.allowed) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (access.authority === 'self' && envelope.context.exercisedCapability !== 'account_owner') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (
    access.authority === 'parent_guardian' &&
    envelope.context.exercisedCapability !== 'parent_guardian'
  ) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

export function assertResolveBookingCancellationAuthorization(
  envelope: CommandEnvelope<'resolve_booking_cancellation'>
): void {
  if (envelope.context.source !== 'admin_callable') {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
  assertAdministrator(envelope);
  requireAccountActor(envelope);
}

export function assertConfirmedGuestCannotSelfCancel(
  envelope: CommandEnvelope<'request_booking_cancellation'>,
  booking: Booking
): void {
  if (
    envelope.context.source === 'guest_callable' &&
    booking.attribution.bookingOrigin === 'guest' &&
    booking.lifecycle.status === 'confirmed'
  ) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
      details: { resourceKind: 'booking', reason: 'unsupported' },
    });
  }
}

export function isAdministratorRequest(envelope: CommandEnvelope): boolean {
  return administratorCapabilityExercisedByAccount(envelope.context);
}
