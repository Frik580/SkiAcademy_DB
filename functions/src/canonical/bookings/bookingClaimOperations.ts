import {
  ResourceClaimIdentityInputSchema,
  ResourceClaimReplacementIgnore,
  resourceClaimIdFromIdentity,
  type Booking,
  type CommandId,
  type CorrelationId,
  type InstructorId,
  type OccurrenceId,
  type ParticipantId,
  type TimeInterval,
} from '@ski-academy/shared-domain';
import {
  commitResourceClaimPlan,
  readAndPlanAcquireResourceClaim,
  readAndPlanReleaseResourceClaim,
} from '../resourceClaims/resourceClaimEngine';

export function bookingClaimIdentities(input: {
  readonly bookingId: Booking['bookingId'];
  readonly occurrenceId: OccurrenceId;
  readonly instructorId: InstructorId;
  readonly participantId: ParticipantId;
}) {
  const instructorIdentity = ResourceClaimIdentityInputSchema.parse({
    strategyVersion: 'claim:v1',
    claimKind: 'instructor_booking_occurrence',
    resourceKind: 'instructor',
    resourceId: input.instructorId,
    ownerKind: 'booking',
    ownerId: input.bookingId,
    occurrenceId: input.occurrenceId,
  });
  const participantIdentity = ResourceClaimIdentityInputSchema.parse({
    strategyVersion: 'claim:v1',
    claimKind: 'participant_booking_occurrence',
    resourceKind: 'participant',
    resourceId: input.participantId,
    ownerKind: 'booking',
    ownerId: input.bookingId,
    occurrenceId: input.occurrenceId,
  });
  return {
    instructorClaimId: resourceClaimIdFromIdentity(instructorIdentity),
    participantClaimId: resourceClaimIdFromIdentity(participantIdentity),
    instructorIdentity,
    participantIdentity,
  };
}

export function bookingClaimIds(booking: Booking) {
  return booking.party.participantIds.map((participantId) =>
    bookingClaimIdentities({
      bookingId: booking.bookingId,
      occurrenceId: booking.occurrence.occurrenceId,
      instructorId: booking.occurrence.instructorId,
      participantId,
    })
  );
}

export async function planReleaseParticipantBookingClaim(
  session: Parameters<typeof readAndPlanReleaseResourceClaim>[0],
  booking: Booking,
  participantId: ParticipantId,
  metadata: {
    readonly correlationId: CorrelationId;
    readonly commandId: CommandId;
  },
  decidedAt: Date
) {
  const identities = bookingClaimIdentities({
    bookingId: booking.bookingId,
    occurrenceId: booking.occurrence.occurrenceId,
    instructorId: booking.occurrence.instructorId,
    participantId,
  });
  return readAndPlanReleaseResourceClaim(session, {
    correlationId: metadata.correlationId,
    commandId: metadata.commandId,
    decidedAt,
    claimId: identities.participantClaimId,
  });
}

export async function planAcquireParticipantBookingClaim(
  session: Parameters<typeof readAndPlanAcquireResourceClaim>[0],
  input: {
    readonly booking: Booking;
    readonly participantId: ParticipantId;
    readonly correlationId: CorrelationId;
    readonly commandId: CommandId;
    readonly decidedAt: Date;
  }
) {
  const identities = bookingClaimIdentities({
    bookingId: input.booking.bookingId,
    occurrenceId: input.booking.occurrence.occurrenceId,
    instructorId: input.booking.occurrence.instructorId,
    participantId: input.participantId,
  });
  return readAndPlanAcquireResourceClaim(session, {
    correlationId: input.correlationId,
    commandId: input.commandId,
    decidedAt: input.decidedAt,
    identity: identities.participantIdentity,
    interval: input.booking.occurrence.interval,
    replacementIgnore: replacementIgnoreForBookingOccurrence(input.booking),
  });
}

export function replacementIgnoreForBookingOccurrence(
  booking: Booking
): ResourceClaimReplacementIgnore {
  return {
    ownerKind: 'booking',
    ownerId: booking.bookingId,
    occurrenceId: booking.occurrence.occurrenceId,
  };
}

export async function planReleaseBookingClaims(
  session: Parameters<typeof readAndPlanReleaseResourceClaim>[0],
  booking: Booking,
  metadata: {
    readonly correlationId: CorrelationId;
    readonly commandId: CommandId;
  },
  decidedAt: Date
) {
  const claimIds = bookingClaimIds(booking);
  const claimMetadata = {
    correlationId: metadata.correlationId,
    commandId: metadata.commandId,
    decidedAt,
  };
  const instructorClaimId = bookingClaimIdentities({
    bookingId: booking.bookingId,
    occurrenceId: booking.occurrence.occurrenceId,
    instructorId: booking.occurrence.instructorId,
    participantId: booking.party.participantIds[0]!,
  }).instructorClaimId;
  const plans = [];
  plans.push(
    await readAndPlanReleaseResourceClaim(session, {
      ...claimMetadata,
      claimId: instructorClaimId,
    })
  );
  for (const claimIdentity of claimIds) {
    plans.push(
      await readAndPlanReleaseResourceClaim(session, {
        ...claimMetadata,
        claimId: claimIdentity.participantClaimId,
      })
    );
  }
  return plans;
}

export async function planAcquireBookingOccurrenceClaims(
  session: Parameters<typeof readAndPlanAcquireResourceClaim>[0],
  input: {
    readonly bookingId: Booking['bookingId'];
    readonly occurrenceId: OccurrenceId;
    readonly instructorId: InstructorId;
    readonly participantId: ParticipantId;
    readonly interval: TimeInterval;
    readonly replacementIgnore?: ResourceClaimReplacementIgnore;
    readonly correlationId: CorrelationId;
    readonly commandId: CommandId;
    readonly decidedAt: Date;
  }
) {
  const identities = bookingClaimIdentities({
    bookingId: input.bookingId,
    occurrenceId: input.occurrenceId,
    instructorId: input.instructorId,
    participantId: input.participantId,
  });
  const claimMetadata = {
    correlationId: input.correlationId,
    commandId: input.commandId,
    decidedAt: input.decidedAt,
  };
  const instructorClaimPlan = await readAndPlanAcquireResourceClaim(session, {
    ...claimMetadata,
    identity: identities.instructorIdentity,
    interval: input.interval,
    replacementIgnore: input.replacementIgnore,
  });
  const participantClaimPlan = await readAndPlanAcquireResourceClaim(session, {
    ...claimMetadata,
    identity: identities.participantIdentity,
    interval: input.interval,
    replacementIgnore: input.replacementIgnore,
  });
  return { instructorClaimPlan, participantClaimPlan };
}

export interface BookingOccurrenceClaimSwapPlan {
  readonly releasePlans: Awaited<ReturnType<typeof planReleaseBookingClaims>>;
  readonly instructorClaimPlan: Awaited<
    ReturnType<typeof planAcquireBookingOccurrenceClaims>
  >['instructorClaimPlan'];
  readonly participantClaimPlan: Awaited<
    ReturnType<typeof planAcquireBookingOccurrenceClaims>
  >['participantClaimPlan'];
}

export async function planSwapBookingOccurrenceClaims(
  session: Parameters<typeof readAndPlanReleaseResourceClaim>[0],
  input: {
    readonly booking: Booking;
    readonly newOccurrenceId: OccurrenceId;
    readonly newInstructorId: InstructorId;
    readonly newInterval: TimeInterval;
    readonly correlationId: CorrelationId;
    readonly commandId: CommandId;
    readonly decidedAt: Date;
  }
): Promise<BookingOccurrenceClaimSwapPlan> {
  const participantId = input.booking.party.participantIds[0]!;
  const replacementIgnore = replacementIgnoreForBookingOccurrence(input.booking);
  const releasePlans = await planReleaseBookingClaims(
    session,
    input.booking,
    { correlationId: input.correlationId, commandId: input.commandId },
    input.decidedAt
  );
  const acquired = await planAcquireBookingOccurrenceClaims(session, {
    bookingId: input.booking.bookingId,
    occurrenceId: input.newOccurrenceId,
    instructorId: input.newInstructorId,
    participantId,
    interval: input.newInterval,
    replacementIgnore,
    correlationId: input.correlationId,
    commandId: input.commandId,
    decidedAt: input.decidedAt,
  });
  return {
    releasePlans,
    instructorClaimPlan: acquired.instructorClaimPlan,
    participantClaimPlan: acquired.participantClaimPlan,
  };
}

export function commitPlannedReleaseBookingClaims(
  session: Parameters<typeof commitResourceClaimPlan>[0],
  plans: Awaited<ReturnType<typeof planReleaseBookingClaims>>,
  metadata: {
    readonly correlationId: CorrelationId;
    readonly commandId: CommandId;
  },
  decidedAt: Date
): void {
  const claimMetadata = {
    correlationId: metadata.correlationId,
    commandId: metadata.commandId,
    decidedAt,
  };
  for (const plan of plans) {
    commitResourceClaimPlan(session, plan, claimMetadata);
  }
}

export function commitPlannedBookingOccurrenceClaimSwap(
  session: Parameters<typeof commitResourceClaimPlan>[0],
  plan: BookingOccurrenceClaimSwapPlan,
  metadata: {
    readonly correlationId: CorrelationId;
    readonly commandId: CommandId;
  },
  decidedAt: Date
): void {
  const claimMetadata = {
    correlationId: metadata.correlationId,
    commandId: metadata.commandId,
    decidedAt,
  };
  commitResourceClaimPlan(session, plan.instructorClaimPlan, claimMetadata);
  commitResourceClaimPlan(session, plan.participantClaimPlan, claimMetadata);
  for (const releasePlan of plan.releasePlans) {
    commitResourceClaimPlan(session, releasePlan, claimMetadata);
  }
}
