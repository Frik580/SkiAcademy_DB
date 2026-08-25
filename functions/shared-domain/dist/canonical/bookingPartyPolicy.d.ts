import { type Booking, type BookingPartyKind } from './bookingOccurrenceProposalChange';
import type { IncrementalRequirement, PaymentAccountingFields } from './paymentWallet';
import { type CanonicalTimestamp, type KztMinorUnits } from './primitives';
import type { ParticipantId } from './identifiers';
export declare const BOOKING_PARTY_CHANGE_WINDOW_MS: number;
export type ClientPartyChangeTimingDecision = 'allowed' | 'inside_window_rejected' | 'after_start_rejected';
export declare function evaluateClientPartyChangeTiming(input: {
    readonly requestAt: CanonicalTimestamp;
    readonly startAt: CanonicalTimestamp;
}): ClientPartyChangeTimingDecision;
export declare function isPartyChangeEligibleBooking(booking: Booking): boolean;
export declare function duplicateParticipantIndexes(participantIds: readonly ParticipantId[]): number[];
export declare function validatePartyParticipantIds(participantIds: readonly ParticipantId[]): void;
export declare function computePartyAfterMutation(input: {
    readonly currentParticipantIds: readonly ParticipantId[];
    readonly participantIdsToAdd?: readonly ParticipantId[];
    readonly participantIdsToRemove?: readonly ParticipantId[];
}): ParticipantId[];
export declare function derivePartyKindFromCount(participantCount: number): BookingPartyKind;
export declare function resolveAuthoritativePartyPrices(input: {
    readonly individualLessonPriceKzt: KztMinorUnits;
    readonly currentParticipantIds: readonly ParticipantId[];
    readonly nextParticipantIds: readonly ParticipantId[];
}): {
    readonly currentPrice: KztMinorUnits;
    readonly nextPrice: KztMinorUnits;
    readonly signedPriceDelta: number;
};
export declare function calculateSelfServiceRemoveRefundBasisKzt(input: {
    readonly individualLessonPriceKzt: KztMinorUnits;
    readonly currentParticipantIds: readonly ParticipantId[];
    readonly nextParticipantIds: readonly ParticipantId[];
}): KztMinorUnits;
export declare function calculateAdminLateRemoveRefundAmountKzt(input: {
    readonly tariffDifferenceKzt: KztMinorUnits;
    readonly refundPercentBasisPoints: number;
    readonly maxRefundableKzt: KztMinorUnits;
}): KztMinorUnits;
export declare function isIncrementalRequirementFullyFunded(requirement: Pick<IncrementalRequirement, 'requiredPriceDelta' | 'allocatedSettledAmount' | 'allocatedRetainedAmount' | 'state'>): boolean;
export declare function listUnpaidActiveIncrementalRequirements(requirements: readonly IncrementalRequirement[]): IncrementalRequirement[];
export declare function maxPartyRemoveRefundKzt(payment: PaymentAccountingFields, tariffDifferenceKzt: KztMinorUnits): KztMinorUnits;
export declare function partitionAddedParticipantsByMarginalDelta(input: {
    readonly individualLessonPriceKzt: KztMinorUnits;
    readonly currentParticipantIds: readonly ParticipantId[];
    readonly participantIdsToAdd: readonly ParticipantId[];
}): ReadonlyArray<{
    readonly participantId: ParticipantId;
    readonly requiredPriceDelta: KztMinorUnits;
}>;
export declare function retainedAmountAfterRefund(payment: PaymentAccountingFields, refundDelta: KztMinorUnits): KztMinorUnits;
