"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandActorSchema = exports.ProviderCommandActorSchema = exports.SystemCommandActorSchema = exports.GuestCommandActorSchema = exports.AccountCommandActorSchema = exports.COMMAND_ACTOR_KINDS = void 0;
exports.accountCommandActor = accountCommandActor;
exports.guestCommandActor = guestCommandActor;
exports.systemCommandActor = systemCommandActor;
exports.providerCommandActor = providerCommandActor;
const zod_1 = require("zod");
const identifiers_1 = require("../identifiers");
exports.COMMAND_ACTOR_KINDS = ['account', 'guest', 'system', 'provider'];
exports.AccountCommandActorSchema = zod_1.z
    .object({
    kind: zod_1.z.literal('account'),
    accountId: identifiers_1.AccountIdSchema,
})
    .strict();
exports.GuestCommandActorSchema = zod_1.z
    .object({
    kind: zod_1.z.literal('guest'),
    guestSubjectId: identifiers_1.GuestSubjectIdSchema,
})
    .strict();
exports.SystemCommandActorSchema = zod_1.z
    .object({
    kind: zod_1.z.literal('system'),
    systemActorId: identifiers_1.SystemActorIdSchema,
})
    .strict();
exports.ProviderCommandActorSchema = zod_1.z
    .object({
    kind: zod_1.z.literal('provider'),
    providerId: identifiers_1.ProviderIdSchema,
})
    .strict();
exports.CommandActorSchema = zod_1.z.discriminatedUnion('kind', [
    exports.AccountCommandActorSchema,
    exports.GuestCommandActorSchema,
    exports.SystemCommandActorSchema,
    exports.ProviderCommandActorSchema,
]);
function accountCommandActor(accountId) {
    return { kind: 'account', accountId };
}
function guestCommandActor(guestSubjectId) {
    return { kind: 'guest', guestSubjectId };
}
function systemCommandActor(systemActorId) {
    return { kind: 'system', systemActorId };
}
function providerCommandActor(providerId) {
    return { kind: 'provider', providerId };
}
