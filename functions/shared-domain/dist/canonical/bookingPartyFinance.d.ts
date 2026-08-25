import type { CommandId } from './identifiers';
import { IncrementalRequirementIdSchema, type ParticipantId } from './identifiers';
import type { IncrementalRequirement } from './paymentWallet';
import { type PaymentAccountingProjection } from './paymentWalletOperations';
import type { PaymentAccountingFields } from './paymentWallet';
import { type CanonicalTimestamp, type KztMinorUnits } from './primitives';
export declare function incrementalRequirementIdFromPartyAddition(input: {
    readonly commandId: CommandId;
    readonly participantId: ParticipantId;
}): ReturnType<typeof IncrementalRequirementIdSchema.parse>;
export declare function createIncrementalRequirement(input: {
    readonly incrementalRequirementId: ReturnType<typeof IncrementalRequirementIdSchema.parse>;
    readonly participantId: ParticipantId;
    readonly createdAt: CanonicalTimestamp;
    readonly createdByCommandId: CommandId;
    readonly requiredPriceDelta: KztMinorUnits;
}): IncrementalRequirement;
export declare function allocateIncrementalRequirementFunding(requirement: IncrementalRequirement, fundingAmount: KztMinorUnits): IncrementalRequirement;
export declare function markIncrementalRequirementRolledBack(requirement: IncrementalRequirement): IncrementalRequirement;
export declare function applyPartyPriceIncrease(payment: PaymentAccountingFields, delta: KztMinorUnits, fundingAmount: KztMinorUnits): PaymentAccountingProjection;
export declare function applyPartyPriceDecrease(payment: PaymentAccountingFields, newPrice: KztMinorUnits): {
    readonly payment: PaymentAccountingProjection;
    readonly refundDelta: KztMinorUnits;
};
export declare function distributeFundingAcrossIncrementalRequirements(requirements: readonly IncrementalRequirement[], fundingAmount: KztMinorUnits): {
    readonly requirements: IncrementalRequirement[];
    readonly appliedAmount: KztMinorUnits;
};
