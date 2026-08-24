import { z } from 'zod';
import { type CommandSource } from '../auditOutbox';
export { COMMAND_SOURCES, type CommandSource } from '../auditOutbox';
export declare const IdempotencyKeySchema: z.ZodString;
export type IdempotencyKey = z.output<typeof IdempotencyKeySchema>;
export declare const CommandTransportMetadataSchema: z.ZodRecord<z.ZodString, z.ZodString>;
export type CommandTransportMetadata = z.output<typeof CommandTransportMetadataSchema>;
export declare const CommandCalendarInputSchema: z.ZodObject<{
    localDate: z.ZodString;
    localTime: z.ZodString;
    durationMinutes: z.ZodNumber;
}, z.core.$strict>;
export type CommandCalendarInput = z.output<typeof CommandCalendarInputSchema>;
export declare const CommandContextSchema: z.ZodObject<{
    actor: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    exercisedCapability: z.ZodEnum<{
        instructor: "instructor";
        guest: "guest";
        system: "system";
        account_owner: "account_owner";
        parent_guardian: "parent_guardian";
        administrator: "administrator";
        provider_callback: "provider_callback";
    }>;
    idempotencyKey: z.ZodString;
    correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"correlation">, string>>;
    causationId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("../identifiers").CanonicalId<"causation">, string>>>;
    expectedRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("../primitives").AggregateRevision, number>>>;
    source: z.ZodEnum<{
        provider_callback: "provider_callback";
        client_callable: "client_callable";
        admin_callable: "admin_callable";
        guest_callable: "guest_callable";
        scheduler: "scheduler";
        system_reconciliation: "system_reconciliation";
    }>;
    transportMetadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    calendarInput: z.ZodOptional<z.ZodObject<{
        localDate: z.ZodString;
        localTime: z.ZodString;
        durationMinutes: z.ZodNumber;
    }, z.core.$strict>>;
    timezone: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type CommandContext = z.output<typeof CommandContextSchema>;
export interface AuthoritativeCommandClock {
    now(): Date;
    decidedAt(): Date;
    committedAt(): Date;
}
export interface CommandExecutionEnvironment {
    readonly clock: AuthoritativeCommandClock;
}
export declare const SOURCE_ACTOR_KIND_CONSTRAINTS: Record<CommandSource, readonly ('account' | 'guest' | 'system' | 'provider')[]>;
export declare function isSourceCompatibleWithActorKind(source: CommandSource, actorKind: CommandContext['actor']['kind']): boolean;
