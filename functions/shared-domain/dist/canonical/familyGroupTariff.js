"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FAMILY_GROUP_PARTY_PRICE_MULTIPLIERS_BP = void 0;
exports.familyGroupMultiplierBasisPoints = familyGroupMultiplierBasisPoints;
exports.calculateFamilyGroupBookingPriceKzt = calculateFamilyGroupBookingPriceKzt;
exports.resolveFamilyGroupBookingPriceKzt = resolveFamilyGroupBookingPriceKzt;
exports.resolveMarginalPartyAdditionPriceDeltaKzt = resolveMarginalPartyAdditionPriceDeltaKzt;
const bookingCreation_1 = require("./bookingCreation");
const bookingOccurrenceProposalChange_1 = require("./bookingOccurrenceProposalChange");
const primitives_1 = require("./primitives");
/**
 * Approved dedicated participant-count tariff expressed as basis-point multipliers of the
 * canonical individual lesson price for the same instructor and duration.
 */
exports.FAMILY_GROUP_PARTY_PRICE_MULTIPLIERS_BP = [
    10_000,
    15_000,
    20_000,
    24_000,
    27_000,
    29_000,
    31_000,
    32_000,
];
function familyGroupMultiplierBasisPoints(participantCount) {
    if (!Number.isInteger(participantCount) ||
        participantCount < bookingOccurrenceProposalChange_1.BOOKING_PARTY_MIN ||
        participantCount > bookingOccurrenceProposalChange_1.BOOKING_PARTY_MAX) {
        throw new Error('Invalid family/group party size');
    }
    return exports.FAMILY_GROUP_PARTY_PRICE_MULTIPLIERS_BP[participantCount - 1];
}
function calculateFamilyGroupBookingPriceKzt(individualLessonPriceKzt, participantCount) {
    if (individualLessonPriceKzt <= 0) {
        throw new Error('Individual lesson price must be positive');
    }
    const multiplierBp = familyGroupMultiplierBasisPoints(participantCount);
    return primitives_1.KztMinorUnitsSchema.parse(Math.round((individualLessonPriceKzt * multiplierBp) / 10_000));
}
function resolveFamilyGroupBookingPriceKzt(input) {
    const hourlyRate = (0, bookingCreation_1.resolveInstructorHourlyRateKzt)(input.tariff);
    const individualPrice = (0, bookingCreation_1.calculateIndividualBookingPriceKzt)(hourlyRate, input.schedule.durationMinutes);
    return calculateFamilyGroupBookingPriceKzt(individualPrice, input.participantCount);
}
function resolveMarginalPartyAdditionPriceDeltaKzt(input) {
    if (input.addedParticipantCount <= 0) {
        throw new Error('Added participant count must be positive');
    }
    const currentPrice = calculateFamilyGroupBookingPriceKzt(input.individualLessonPriceKzt, input.currentParticipantCount);
    const nextPrice = calculateFamilyGroupBookingPriceKzt(input.individualLessonPriceKzt, input.currentParticipantCount + input.addedParticipantCount);
    return primitives_1.KztMinorUnitsSchema.parse(nextPrice - currentPrice);
}
