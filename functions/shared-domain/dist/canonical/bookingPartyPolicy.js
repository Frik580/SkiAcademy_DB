"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BOOKING_PARTY_CHANGE_WINDOW_MS = void 0;
exports.evaluateClientPartyChangeTiming = evaluateClientPartyChangeTiming;
exports.isPartyChangeEligibleBooking = isPartyChangeEligibleBooking;
exports.duplicateParticipantIndexes = duplicateParticipantIndexes;
exports.validatePartyParticipantIds = validatePartyParticipantIds;
exports.computePartyAfterMutation = computePartyAfterMutation;
exports.derivePartyKindFromCount = derivePartyKindFromCount;
exports.resolveAuthoritativePartyPrices = resolveAuthoritativePartyPrices;
exports.calculateSelfServiceRemoveRefundBasisKzt = calculateSelfServiceRemoveRefundBasisKzt;
exports.calculateAdminLateRemoveRefundAmountKzt = calculateAdminLateRemoveRefundAmountKzt;
exports.isIncrementalRequirementFullyFunded = isIncrementalRequirementFullyFunded;
exports.listUnpaidActiveIncrementalRequirements = listUnpaidActiveIncrementalRequirements;
exports.maxPartyRemoveRefundKzt = maxPartyRemoveRefundKzt;
exports.partitionAddedParticipantsByMarginalDelta = partitionAddedParticipantsByMarginalDelta;
exports.retainedAmountAfterRefund = retainedAmountAfterRefund;
const bookingOccurrenceProposalChange_1 = require("./bookingOccurrenceProposalChange");
const bookingCancellationPolicy_1 = require("./bookingCancellationPolicy");
const paymentWallet_1 = require("./paymentWallet");
const primitives_1 = require("./primitives");
const familyGroupTariff_1 = require("./familyGroupTariff");
exports.BOOKING_PARTY_CHANGE_WINDOW_MS = bookingCancellationPolicy_1.INDIVIDUAL_BOOKING_CLIENT_CANCELLATION_WINDOW_MS;
function evaluateClientPartyChangeTiming(input) {
    if ((0, primitives_1.compareCanonicalTimestamps)(input.requestAt, input.startAt) >= 0) {
        return 'after_start_rejected';
    }
    const timeUntilStartMs = (0, bookingCancellationPolicy_1.canonicalTimestampToEpochMs)(input.startAt) - (0, bookingCancellationPolicy_1.canonicalTimestampToEpochMs)(input.requestAt);
    return timeUntilStartMs >= exports.BOOKING_PARTY_CHANGE_WINDOW_MS
        ? 'allowed'
        : 'inside_window_rejected';
}
function isPartyChangeEligibleBooking(booking) {
    if ((0, bookingCancellationPolicy_1.isTerminalBookingLifecycle)(booking)) {
        return false;
    }
    if (booking.lifecycle.status === 'pending') {
        return false;
    }
    if (booking.lifecycle.status === 'pending_cancellation') {
        return false;
    }
    return booking.lifecycle.status === 'confirmed';
}
function duplicateParticipantIndexes(participantIds) {
    const seen = new Map();
    const duplicates = [];
    participantIds.forEach((participantId, index) => {
        if (seen.has(participantId)) {
            duplicates.push(index);
        }
        else {
            seen.set(participantId, index);
        }
    });
    return duplicates;
}
function validatePartyParticipantIds(participantIds) {
    if (participantIds.length < bookingOccurrenceProposalChange_1.BOOKING_PARTY_MIN) {
        throw new Error('Booking party must contain at least one Participant');
    }
    if (participantIds.length > bookingOccurrenceProposalChange_1.BOOKING_PARTY_MAX) {
        throw new Error('Booking party must contain at most eight Participants');
    }
    if (duplicateParticipantIndexes(participantIds).length > 0) {
        throw new Error('Booking party participant IDs must be unique');
    }
}
function computePartyAfterMutation(input) {
    const toRemove = new Set(input.participantIdsToRemove ?? []);
    const next = input.currentParticipantIds.filter((participantId) => !toRemove.has(participantId));
    for (const participantId of input.participantIdsToAdd ?? []) {
        if (!next.includes(participantId)) {
            next.push(participantId);
        }
    }
    return next;
}
function derivePartyKindFromCount(participantCount) {
    return participantCount === 1 ? 'individual' : 'family_group';
}
function resolveAuthoritativePartyPrices(input) {
    const currentPrice = (0, familyGroupTariff_1.calculateFamilyGroupBookingPriceKzt)(input.individualLessonPriceKzt, input.currentParticipantIds.length);
    const nextPrice = (0, familyGroupTariff_1.calculateFamilyGroupBookingPriceKzt)(input.individualLessonPriceKzt, input.nextParticipantIds.length);
    return {
        currentPrice,
        nextPrice,
        signedPriceDelta: nextPrice - currentPrice,
    };
}
function calculateSelfServiceRemoveRefundBasisKzt(input) {
    const prices = resolveAuthoritativePartyPrices(input);
    if (prices.signedPriceDelta >= 0) {
        throw new Error('Self-service remove requires a lower authoritative party price');
    }
    return primitives_1.KztMinorUnitsSchema.parse(-prices.signedPriceDelta);
}
function calculateAdminLateRemoveRefundAmountKzt(input) {
    if (input.tariffDifferenceKzt <= 0) {
        return primitives_1.KztMinorUnitsSchema.parse(0);
    }
    if (!Number.isInteger(input.refundPercentBasisPoints) ||
        input.refundPercentBasisPoints < 0 ||
        input.refundPercentBasisPoints > 10_000) {
        throw new Error('Refund percent must be between 0 and 10000 basis points');
    }
    const rawRefund = Math.floor((input.tariffDifferenceKzt * input.refundPercentBasisPoints + 5_000) / 10_000);
    const capped = Math.min(rawRefund, input.tariffDifferenceKzt, input.maxRefundableKzt);
    return primitives_1.KztMinorUnitsSchema.parse(Math.max(0, capped));
}
function isIncrementalRequirementFullyFunded(requirement) {
    if (requirement.state === 'rolled_back') {
        return false;
    }
    return (requirement.allocatedSettledAmount === requirement.requiredPriceDelta &&
        requirement.allocatedRetainedAmount === requirement.requiredPriceDelta);
}
function listUnpaidActiveIncrementalRequirements(requirements) {
    return requirements.filter((requirement) => requirement.state === 'active' && !isIncrementalRequirementFullyFunded(requirement));
}
function maxPartyRemoveRefundKzt(payment, tariffDifferenceKzt) {
    return primitives_1.KztMinorUnitsSchema.parse(Math.min(payment.paidAmount - payment.refundedAmount, tariffDifferenceKzt));
}
function partitionAddedParticipantsByMarginalDelta(input) {
    const additions = [];
    let runningCount = input.currentParticipantIds.length;
    for (const participantId of input.participantIdsToAdd) {
        const requiredPriceDelta = (0, familyGroupTariff_1.calculateFamilyGroupBookingPriceKzt)(input.individualLessonPriceKzt, runningCount + 1);
        const previousPrice = (0, familyGroupTariff_1.calculateFamilyGroupBookingPriceKzt)(input.individualLessonPriceKzt, runningCount);
        additions.push({
            participantId,
            requiredPriceDelta: primitives_1.KztMinorUnitsSchema.parse(requiredPriceDelta - previousPrice),
        });
        runningCount += 1;
    }
    return additions;
}
function retainedAmountAfterRefund(payment, refundDelta) {
    return (0, paymentWallet_1.deriveRetainedAmount)(payment.paidAmount, primitives_1.KztMinorUnitsSchema.parse(payment.refundedAmount + refundDelta));
}
