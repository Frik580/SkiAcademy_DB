import { z } from 'zod';
import { type ActivityLogId, type CommandId, type DomainOutboxId, type MonetaryEventId, type ResourceClaimId } from './identifiers';
export declare function canonicalDeterministicHash(parts: readonly string[]): string;
export declare function assertNoPersonalDataInDeterministicIdentityInput(value: string, path: (string | number)[]): void;
export declare function validateDeterministicIdentityInputs(inputs: Readonly<Record<string, string>>, context: z.RefinementCtx): void;
export declare function activityLogIdFromCommandId(commandId: CommandId): ActivityLogId;
export declare function domainOutboxIdFromCommand(commandId: CommandId, deliveryEffectOrdinal: number): DomainOutboxId;
export declare function monetaryEventIdFromCommandEffect(commandId: CommandId, effectOrdinal: number): MonetaryEventId;
export declare const ResourceClaimIdentityInputSchema: z.ZodObject<{
    strategyVersion: z.ZodLiteral<"claim:v1">;
    claimKind: z.ZodString;
    resourceKind: z.ZodString;
    resourceId: z.ZodString;
    ownerKind: z.ZodString;
    ownerId: z.ZodString;
    occurrenceId: z.ZodString;
}, z.core.$strict>;
export type ResourceClaimIdentityInput = z.output<typeof ResourceClaimIdentityInputSchema>;
export declare function resourceClaimIdFromIdentity(input: ResourceClaimIdentityInput): ResourceClaimId;
export declare const ResourceClaimGuardBucketIdentityInputSchema: z.ZodObject<{
    strategyVersion: z.ZodLiteral<"guard:v1">;
    resourceKind: z.ZodString;
    resourceId: z.ZodString;
    bucketStartSeconds: z.ZodNumber;
}, z.core.$strict>;
export type ResourceClaimGuardBucketIdentityInput = z.output<typeof ResourceClaimGuardBucketIdentityInputSchema>;
export declare function resourceClaimGuardBucketKeyFromIdentity(input: ResourceClaimGuardBucketIdentityInput): string;
