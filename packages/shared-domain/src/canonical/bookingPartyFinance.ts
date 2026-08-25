import type { CommandId } from './identifiers';
import { IncrementalRequirementIdSchema, type ParticipantId } from './identifiers';
import type { IncrementalRequirement } from './paymentWallet';
import {
  applyPriceDecrease,
  applyPriceIncrease,
  applyPriceIncreaseWithFunding,
  type PaymentAccountingProjection,
} from './paymentWalletOperations';
import type { PaymentAccountingFields } from './paymentWallet';
import { canonicalDeterministicHash } from './deterministicIdentity';
import { KztMinorUnitsSchema, type CanonicalTimestamp, type KztMinorUnits } from './primitives';

export function incrementalRequirementIdFromPartyAddition(input: {
  readonly commandId: CommandId;
  readonly participantId: ParticipantId;
}): ReturnType<typeof IncrementalRequirementIdSchema.parse> {
  return IncrementalRequirementIdSchema.parse(
    canonicalDeterministicHash([
      'incremental_requirement:v1',
      input.commandId,
      input.participantId,
    ])
  );
}

export function createIncrementalRequirement(input: {
  readonly incrementalRequirementId: ReturnType<typeof IncrementalRequirementIdSchema.parse>;
  readonly participantId: ParticipantId;
  readonly createdAt: CanonicalTimestamp;
  readonly createdByCommandId: CommandId;
  readonly requiredPriceDelta: KztMinorUnits;
}): IncrementalRequirement {
  return {
    incrementalRequirementId: input.incrementalRequirementId,
    participantId: input.participantId,
    createdAt: input.createdAt,
    createdByCommandId: input.createdByCommandId,
    requiredPriceDelta: input.requiredPriceDelta,
    allocatedSettledAmount: KztMinorUnitsSchema.parse(0),
    allocatedRetainedAmount: KztMinorUnitsSchema.parse(0),
    state: 'active',
  };
}

export function allocateIncrementalRequirementFunding(
  requirement: IncrementalRequirement,
  fundingAmount: KztMinorUnits
): IncrementalRequirement {
  if (fundingAmount <= 0) {
    return requirement;
  }
  const remaining = KztMinorUnitsSchema.parse(
    requirement.requiredPriceDelta - requirement.allocatedSettledAmount
  );
  const applied = KztMinorUnitsSchema.parse(Math.min(fundingAmount, remaining));
  const nextSettled = KztMinorUnitsSchema.parse(requirement.allocatedSettledAmount + applied);
  const nextRetained = KztMinorUnitsSchema.parse(requirement.allocatedRetainedAmount + applied);
  const fullyFunded =
    nextSettled === requirement.requiredPriceDelta &&
    nextRetained === requirement.requiredPriceDelta;
  return {
    ...requirement,
    allocatedSettledAmount: nextSettled,
    allocatedRetainedAmount: nextRetained,
    state: fullyFunded ? 'fully_funded' : 'active',
  };
}

export function markIncrementalRequirementRolledBack(
  requirement: IncrementalRequirement
): IncrementalRequirement {
  return {
    ...requirement,
    state: 'rolled_back',
  };
}

export function applyPartyPriceIncrease(
  payment: PaymentAccountingFields,
  delta: KztMinorUnits,
  fundingAmount: KztMinorUnits
): PaymentAccountingProjection {
  if (delta <= 0) {
    throw new Error('Party price increase delta must be positive');
  }
  if (fundingAmount === 0) {
    return applyPriceIncrease(payment, delta).payment;
  }
  return applyPriceIncreaseWithFunding(payment, delta, fundingAmount);
}

export function applyPartyPriceDecrease(
  payment: PaymentAccountingFields,
  newPrice: KztMinorUnits
): {
  readonly payment: PaymentAccountingProjection;
  readonly refundDelta: KztMinorUnits;
} {
  return applyPriceDecrease(payment, newPrice);
}

export function distributeFundingAcrossIncrementalRequirements(
  requirements: readonly IncrementalRequirement[],
  fundingAmount: KztMinorUnits
): {
  readonly requirements: IncrementalRequirement[];
  readonly appliedAmount: KztMinorUnits;
} {
  let remaining = fundingAmount;
  const updated = requirements.map((requirement) => {
    if (remaining <= 0 || requirement.state !== 'active') {
      return requirement;
    }
    const needed = KztMinorUnitsSchema.parse(
      requirement.requiredPriceDelta - requirement.allocatedSettledAmount
    );
    const applied = KztMinorUnitsSchema.parse(Math.min(remaining, needed));
    remaining = KztMinorUnitsSchema.parse(remaining - applied);
    return allocateIncrementalRequirementFunding(requirement, applied);
  });
  return {
    requirements: updated,
    appliedAmount: KztMinorUnitsSchema.parse(fundingAmount - remaining),
  };
}
