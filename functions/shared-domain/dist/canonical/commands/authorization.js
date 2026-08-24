"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateActorCapabilityPairing = evaluateActorCapabilityPairing;
exports.evaluateCommandContextAuthorization = evaluateCommandContextAuthorization;
exports.administratorCapabilityExercisedByAccount = administratorCapabilityExercisedByAccount;
const capabilities_1 = require("./capabilities");
const commandContext_1 = require("./commandContext");
function evaluateActorCapabilityPairing(actor, capability) {
    if ((0, capabilities_1.systemActorCannotMasqueradeAsAdministrator)(actor.kind, capability)) {
        return 'forbidden';
    }
    if (!(0, capabilities_1.isCapabilityAllowedForActorKind)(actor.kind, capability)) {
        return 'forbidden';
    }
    return 'authorized';
}
function evaluateCommandContextAuthorization(context) {
    if (!(0, commandContext_1.isSourceCompatibleWithActorKind)(context.source, context.actor.kind)) {
        return 'forbidden';
    }
    return evaluateActorCapabilityPairing(context.actor, context.exercisedCapability);
}
function administratorCapabilityExercisedByAccount(context) {
    return (context.actor.kind === 'account' && context.exercisedCapability === 'administrator');
}
