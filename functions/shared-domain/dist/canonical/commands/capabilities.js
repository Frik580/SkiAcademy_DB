"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXERCISED_CAPABILITIES = void 0;
exports.capabilitiesForActorKind = capabilitiesForActorKind;
exports.isCapabilityAllowedForActorKind = isCapabilityAllowedForActorKind;
exports.isAdministratorCapabilityExercisedByAccount = isAdministratorCapabilityExercisedByAccount;
exports.systemActorCannotMasqueradeAsAdministrator = systemActorCannotMasqueradeAsAdministrator;
var auditOutbox_1 = require("../auditOutbox");
Object.defineProperty(exports, "EXERCISED_CAPABILITIES", { enumerable: true, get: function () { return auditOutbox_1.EXERCISED_CAPABILITIES; } });
const ACCOUNT_CAPABILITIES = [
    'account_owner',
    'parent_guardian',
    'administrator',
    'instructor',
];
const ACTOR_CAPABILITY_MATRIX = {
    account: ACCOUNT_CAPABILITIES,
    guest: ['guest'],
    system: ['system'],
    provider: ['provider_callback'],
};
function capabilitiesForActorKind(actorKind) {
    return ACTOR_CAPABILITY_MATRIX[actorKind];
}
function isCapabilityAllowedForActorKind(actorKind, capability) {
    return ACTOR_CAPABILITY_MATRIX[actorKind].includes(capability);
}
function isAdministratorCapabilityExercisedByAccount(actorKind, capability) {
    return actorKind === 'account' && capability === 'administrator';
}
function systemActorCannotMasqueradeAsAdministrator(actorKind, capability) {
    return actorKind === 'system' && capability === 'administrator';
}
