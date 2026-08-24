import { z } from 'zod';
import { type AccountId, type GuestSubjectId, type ProviderId, type SystemActorId } from '../identifiers';
export declare const COMMAND_ACTOR_KINDS: readonly ["account", "guest", "system", "provider"];
export type CommandActorKind = (typeof COMMAND_ACTOR_KINDS)[number];
export declare const AccountCommandActorSchema: z.ZodObject<{
    kind: z.ZodLiteral<"account">;
    accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"account">, string>>;
}, z.core.$strict>;
export declare const GuestCommandActorSchema: z.ZodObject<{
    kind: z.ZodLiteral<"guest">;
    guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"guest_subject">, string>>;
}, z.core.$strict>;
export declare const SystemCommandActorSchema: z.ZodObject<{
    kind: z.ZodLiteral<"system">;
    systemActorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"system_actor">, string>>;
}, z.core.$strict>;
export declare const ProviderCommandActorSchema: z.ZodObject<{
    kind: z.ZodLiteral<"provider">;
    providerId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"provider">, string>>;
}, z.core.$strict>;
export declare const CommandActorSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"account">;
    accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"account">, string>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"guest">;
    guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"guest_subject">, string>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"system">;
    systemActorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"system_actor">, string>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"provider">;
    providerId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"provider">, string>>;
}, z.core.$strict>], "kind">;
export type CommandActor = z.output<typeof CommandActorSchema>;
export type AccountCommandActor = z.output<typeof AccountCommandActorSchema>;
export type GuestCommandActor = z.output<typeof GuestCommandActorSchema>;
export type SystemCommandActor = z.output<typeof SystemCommandActorSchema>;
export type ProviderCommandActor = z.output<typeof ProviderCommandActorSchema>;
export declare function accountCommandActor(accountId: AccountId): AccountCommandActor;
export declare function guestCommandActor(guestSubjectId: GuestSubjectId): GuestCommandActor;
export declare function systemCommandActor(systemActorId: SystemActorId): SystemCommandActor;
export declare function providerCommandActor(providerId: ProviderId): ProviderCommandActor;
