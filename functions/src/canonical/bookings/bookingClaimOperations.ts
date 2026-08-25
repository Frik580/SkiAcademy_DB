import {
  ResourceClaimIdentityInputSchema,
  resourceClaimIdFromIdentity,
  type Booking,
  type CommandId,
  type CorrelationId,
} from '@ski-academy/shared-domain';
import {
  commitResourceClaimPlan,
  readAndPlanReleaseResourceClaim,
} from '../resourceClaims/resourceClaimEngine';

export function bookingClaimIds(booking: Booking) {
  const occurrenceId = booking.occurrence.occurrenceId;
  const instructorIdentity = ResourceClaimIdentityInputSchema.parse({
    strategyVersion: 'claim:v1',
    claimKind: 'instructor_booking_occurrence',
    resourceKind: 'instructor',
    resourceId: booking.occurrence.instructorId,
    ownerKind: 'booking',
    ownerId: booking.bookingId,
    occurrenceId,
  });
  const participantIdentity = ResourceClaimIdentityInputSchema.parse({
    strategyVersion: 'claim:v1',
    claimKind: 'participant_booking_occurrence',
    resourceKind: 'participant',
    resourceId: booking.party.participantIds[0]!,
    ownerKind: 'booking',
    ownerId: booking.bookingId,
    occurrenceId,
  });
  return {
    instructorClaimId: resourceClaimIdFromIdentity(instructorIdentity),
    participantClaimId: resourceClaimIdFromIdentity(participantIdentity),
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
  const plans = [];
  for (const claimId of [claimIds.instructorClaimId, claimIds.participantClaimId]) {
    plans.push(
      await readAndPlanReleaseResourceClaim(session, {
        ...claimMetadata,
        claimId,
      })
    );
  }
  return plans;
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
