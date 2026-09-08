import {
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  resolveClientCallableCapabilityFromPartyAuthorities,
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

function assertClientCallableCancellationEnvelope(envelope: CommandEnvelope): void {
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
}

export function assertAuthenticatedBookingPartyCancellationAuthorization(
  envelope: CommandEnvelope<'request_booking_cancellation' | 'withdraw_booking_cancellation_request'>,
  input: Readonly<{
    account: Account;
    participants: readonly Participant[];
    managements: readonly ParticipantManagement[];
    participantIds: readonly Participant['participantId'][];
  }>
): void {
  assertClientCallableCancellationEnvelope(envelope);

  const authorities: ('self' | 'parent_guardian')[] = [];
  for (const participantId of input.participantIds) {
    const participant = input.participants.find((entry) => entry.participantId === participantId);
    const management = input.managements.find((entry) => entry.participantId === participantId);
    if (!participant || !management || participant.management.kind !== 'managed') {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    const access = assertAuthorizedParticipantManager(
      envelope,
      { account: input.account, participant, management },
      participantId
    );
    if (!access.allowed) {
      throw new CanonicalCommandError('forbidden', {
        correlationId: envelope.context.correlationId,
      });
    }
    authorities.push(access.authority);
  }

  const expectedCapability = resolveClientCallableCapabilityFromPartyAuthorities(authorities);
  if (envelope.context.exercisedCapability !== expectedCapability) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

/** @deprecated Use assertAuthenticatedBookingPartyCancellationAuthorization for party-aware checks. */
export function assertAuthenticatedClientCancellationAuthorization(
  envelope: CommandEnvelope<'request_booking_cancellation' | 'withdraw_booking_cancellation_request'>,
  input: Readonly<{
    account: Account;
    participant: Participant;
    management: ParticipantManagement;
    participantId: string;
  }>
): void {
  assertAuthenticatedBookingPartyCancellationAuthorization(envelope, {
    account: input.account,
    participants: [input.participant],
    managements: [input.management],
    participantIds: [input.participantId as Participant['participantId']],
  });
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
