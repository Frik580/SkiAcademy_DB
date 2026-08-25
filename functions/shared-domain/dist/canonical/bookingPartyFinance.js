"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementalRequirementIdFromPartyAddition = incrementalRequirementIdFromPartyAddition;
exports.createIncrementalRequirement = createIncrementalRequirement;
exports.allocateIncrementalRequirementFunding = allocateIncrementalRequirementFunding;
exports.markIncrementalRequirementRolledBack = markIncrementalRequirementRolledBack;
exports.applyPartyPriceIncrease = applyPartyPriceIncrease;
exports.applyPartyPriceDecrease = applyPartyPriceDecrease;
exports.distributeFundingAcrossIncrementalRequirements = distributeFundingAcrossIncrementalRequirements;
const identifiers_1 = require("./identifiers");
const paymentWalletOperations_1 = require("./paymentWalletOperations");
const deterministicIdentity_1 = require("./deterministicIdentity");
const primitives_1 = require("./primitives");
function incrementalRequirementIdFromPartyAddition(input) {
    return identifiers_1.IncrementalRequirementIdSchema.parse((0, deterministicIdentity_1.canonicalDeterministicHash)([
        'incremental_requirement:v1',
        input.commandId,
        input.participantId,
    ]));
}
function createIncrementalRequirement(input) {
    return {
        incrementalRequirementId: input.incrementalRequirementId,
        participantId: input.participantId,
        createdAt: input.createdAt,
        createdByCommandId: input.createdByCommandId,
        requiredPriceDelta: input.requiredPriceDelta,
        allocatedSettledAmount: primitives_1.KztMinorUnitsSchema.parse(0),
        allocatedRetainedAmount: primitives_1.KztMinorUnitsSchema.parse(0),
        state: 'active',
    };
}
function allocateIncrementalRequirementFunding(requirement, fundingAmount) {
    if (fundingAmount <= 0) {
        return requirement;
    }
    const remaining = primitives_1.KztMinorUnitsSchema.parse(requirement.requiredPriceDelta - requirement.allocatedSettledAmount);
    const applied = primitives_1.KztMinorUnitsSchema.parse(Math.min(fundingAmount, remaining));
    const nextSettled = primitives_1.KztMinorUnitsSchema.parse(requirement.allocatedSettledAmount + applied);
    const nextRetained = primitives_1.KztMinorUnitsSchema.parse(requirement.allocatedRetainedAmount + applied);
    const fullyFunded = nextSettled === requirement.requiredPriceDelta &&
        nextRetained === requirement.requiredPriceDelta;
    return {
        ...requirement,
        allocatedSettledAmount: nextSettled,
        allocatedRetainedAmount: nextRetained,
        state: fullyFunded ? 'fully_funded' : 'active',
    };
}
function markIncrementalRequirementRolledBack(requirement) {
    return {
        ...requirement,
        allocatedSettledAmount: primitives_1.KztMinorUnitsSchema.parse(0),
        allocatedRetainedAmount: primitives_1.KztMinorUnitsSchema.parse(0),
        state: 'rolled_back',
    };
}
function applyPartyPriceIncrease(payment, delta, fundingAmount) {
    if (delta <= 0) {
        throw new Error('Party price increase delta must be positive');
    }
    if (fundingAmount === 0) {
        return (0, paymentWalletOperations_1.applyPriceIncrease)(payment, delta).payment;
    }
    return (0, paymentWalletOperations_1.applyPriceIncreaseWithFunding)(payment, delta, fundingAmount);
}
function applyPartyPriceDecrease(payment, newPrice) {
    return (0, paymentWalletOperations_1.applyPriceDecrease)(payment, newPrice);
}
function distributeFundingAcrossIncrementalRequirements(requirements, fundingAmount) {
    let remaining = fundingAmount;
    const updated = requirements.map((requirement) => {
        if (remaining <= 0 || requirement.state !== 'active') {
            return requirement;
        }
        const needed = primitives_1.KztMinorUnitsSchema.parse(requirement.requiredPriceDelta - requirement.allocatedSettledAmount);
        const applied = primitives_1.KztMinorUnitsSchema.parse(Math.min(remaining, needed));
        remaining = primitives_1.KztMinorUnitsSchema.parse(remaining - applied);
        return allocateIncrementalRequirementFunding(requirement, applied);
    });
    return {
        requirements: updated,
        appliedAmount: primitives_1.KztMinorUnitsSchema.parse(fundingAmount - remaining),
    };
}
