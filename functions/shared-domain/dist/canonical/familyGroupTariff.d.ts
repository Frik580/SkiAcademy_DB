import { type InstructorTariffInput, type ResolvedBookingSchedule } from './bookingCreation';
import { type KztMinorUnits } from './primitives';
/**
 * Approved dedicated participant-count tariff expressed as basis-point multipliers of the
 * canonical individual lesson price for the same instructor and duration.
 */
export declare const FAMILY_GROUP_PARTY_PRICE_MULTIPLIERS_BP: readonly [10000, 15000, 20000, 24000, 27000, 29000, 31000, 32000];
export declare function familyGroupMultiplierBasisPoints(participantCount: number): number;
export declare function calculateFamilyGroupBookingPriceKzt(individualLessonPriceKzt: KztMinorUnits, participantCount: number): KztMinorUnits;
export declare function resolveFamilyGroupBookingPriceKzt(input: {
    readonly tariff: InstructorTariffInput;
    readonly schedule: Pick<ResolvedBookingSchedule, 'durationMinutes'>;
    readonly participantCount: number;
}): KztMinorUnits;
export declare function resolveMarginalPartyAdditionPriceDeltaKzt(input: {
    readonly individualLessonPriceKzt: KztMinorUnits;
    readonly currentParticipantCount: number;
    readonly addedParticipantCount: number;
}): KztMinorUnits;
