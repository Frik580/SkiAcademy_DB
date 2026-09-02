import {
  ResourceClaimIdentityInputSchema,
  administrativeAvailabilityBlockOccurrenceIdFromRevision,
  resourceClaimIdFromIdentity,
  type AdministrativeAvailabilityBlock,
  type AdministrativeAvailabilityBlockId,
  type InstructorId,
  type ResourceClaimReplacementIgnore,
  type TimeInterval,
} from '@ski-academy/shared-domain';
import {
  commitResourceClaimPlan,
  readAndPlanAcquireResourceClaim,
  readAndPlanMoveResourceClaim,
  readAndPlanReleaseResourceClaim,
} from '../resourceClaims/resourceClaimEngine';

export function administrativeAvailabilityBlockClaimIdentity(input: {
  readonly blockId: AdministrativeAvailabilityBlockId;
  readonly instructorId: InstructorId;
  readonly scheduleRevision: number;
}) {
  const occurrenceId = administrativeAvailabilityBlockOccurrenceIdFromRevision(
    input.blockId,
    input.scheduleRevision
  );
  const identity = ResourceClaimIdentityInputSchema.parse({
    strategyVersion: 'claim:v1',
    claimKind: 'administrative_availability_block',
    resourceKind: 'instructor',
    resourceId: input.instructorId,
    ownerKind: 'administrative_block',
    ownerId: input.blockId,
    occurrenceId,
  });
  return {
    occurrenceId,
    identity,
    claimId: resourceClaimIdFromIdentity(identity),
  };
}

export function replacementIgnoreForAdministrativeAvailabilityBlock(
  block: AdministrativeAvailabilityBlock
): ResourceClaimReplacementIgnore {
  return {
    ownerKind: 'administrative_block',
    ownerId: block.blockId,
    occurrenceId: administrativeAvailabilityBlockOccurrenceIdFromRevision(
      block.blockId,
      block.scheduleRevision
    ),
  };
}

export async function planAcquireAdministrativeAvailabilityBlockClaim(
  session: Parameters<typeof readAndPlanAcquireResourceClaim>[0],
  input: {
    readonly blockId: AdministrativeAvailabilityBlockId;
    readonly instructorId: InstructorId;
    readonly scheduleRevision: number;
    readonly interval: TimeInterval;
    readonly replacementIgnore?: ResourceClaimReplacementIgnore;
    readonly correlationId: Parameters<typeof readAndPlanAcquireResourceClaim>[1]['correlationId'];
    readonly commandId: Parameters<typeof readAndPlanAcquireResourceClaim>[1]['commandId'];
    readonly decidedAt: Date;
  }
) {
  const identities = administrativeAvailabilityBlockClaimIdentity({
    blockId: input.blockId,
    instructorId: input.instructorId,
    scheduleRevision: input.scheduleRevision,
  });
  return readAndPlanAcquireResourceClaim(session, {
    correlationId: input.correlationId,
    commandId: input.commandId,
    decidedAt: input.decidedAt,
    identity: identities.identity,
    interval: input.interval,
    replacementIgnore: input.replacementIgnore,
  });
}

export { commitResourceClaimPlan, readAndPlanMoveResourceClaim, readAndPlanReleaseResourceClaim };
