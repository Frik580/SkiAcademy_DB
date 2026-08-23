import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ActivityLogIdSchema,
  DomainOutboxIdSchema,
  MonetaryEventIdSchema,
  ResourceClaimIdSchema,
  type ActivityLogId,
  type CommandId,
  type DomainOutboxId,
  type MonetaryEventId,
  type ResourceClaimId,
} from './identifiers';

const DETERMINISTIC_ID_PART_SEPARATOR = '\u001f';

const PERSONAL_DATA_PATTERNS = [
  /@/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\+?\d[\d\s().-]{7,}\d\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
] as const;

export function canonicalDeterministicHash(parts: readonly string[]): string {
  const payload = parts.join(DETERMINISTIC_ID_PART_SEPARATOR);
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function assertNoPersonalDataInDeterministicIdentityInput(
  value: string,
  path: (string | number)[]
): void {
  for (const pattern of PERSONAL_DATA_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(
        `Deterministic identity input at ${path.join('.')} must not contain personal data`
      );
    }
  }
}

export function validateDeterministicIdentityInputs(
  inputs: Readonly<Record<string, string>>,
  context: z.RefinementCtx
): void {
  for (const [key, value] of Object.entries(inputs)) {
    for (const pattern of PERSONAL_DATA_PATTERNS) {
      if (pattern.test(value)) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Deterministic identity inputs must not contain personal data',
        });
      }
    }
  }
}

export function activityLogIdFromCommandId(commandId: CommandId): ActivityLogId {
  return ActivityLogIdSchema.parse(canonicalDeterministicHash(['audit:v1', commandId]));
}

export function domainOutboxIdFromCommand(
  commandId: CommandId,
  deliveryEffectOrdinal: number
): DomainOutboxId {
  return DomainOutboxIdSchema.parse(
    canonicalDeterministicHash(['outbox:v1', commandId, String(deliveryEffectOrdinal)])
  );
}

export function monetaryEventIdFromCommandEffect(
  commandId: CommandId,
  effectOrdinal: number
): MonetaryEventId {
  return MonetaryEventIdSchema.parse(
    canonicalDeterministicHash(['monetary:v1', commandId, String(effectOrdinal)])
  );
}

export const ResourceClaimIdentityInputSchema = z
  .object({
    strategyVersion: z.literal('claim:v1'),
    claimKind: z.string().min(1).max(64),
    resourceKind: z.string().min(1).max(64),
    resourceId: z.string().min(1).max(128),
    ownerKind: z.string().min(1).max(64),
    ownerId: z.string().min(1).max(128),
    occurrenceId: z.string().min(1).max(128),
  })
  .strict()
  .superRefine((input, context) => {
    validateDeterministicIdentityInputs(
      {
        claimKind: input.claimKind,
        resourceKind: input.resourceKind,
        resourceId: input.resourceId,
        ownerKind: input.ownerKind,
        ownerId: input.ownerId,
        occurrenceId: input.occurrenceId,
      },
      context
    );
  });

export type ResourceClaimIdentityInput = z.output<typeof ResourceClaimIdentityInputSchema>;

export function resourceClaimIdFromIdentity(input: ResourceClaimIdentityInput): ResourceClaimId {
  const parsed = ResourceClaimIdentityInputSchema.parse(input);
  return ResourceClaimIdSchema.parse(
    canonicalDeterministicHash([
      parsed.strategyVersion,
      parsed.claimKind,
      parsed.resourceKind,
      parsed.resourceId,
      parsed.ownerKind,
      parsed.ownerId,
      parsed.occurrenceId,
    ])
  );
}

export const ResourceClaimGuardBucketIdentityInputSchema = z
  .object({
    strategyVersion: z.literal('guard:v1'),
    resourceKind: z.string().min(1).max(64),
    resourceId: z.string().min(1).max(128),
    bucketStartSeconds: z.number().finite().int().nonnegative(),
  })
  .strict()
  .superRefine((input, context) => {
    validateDeterministicIdentityInputs(
      {
        resourceKind: input.resourceKind,
        resourceId: input.resourceId,
      },
      context
    );
  });

export type ResourceClaimGuardBucketIdentityInput = z.output<
  typeof ResourceClaimGuardBucketIdentityInputSchema
>;

export function resourceClaimGuardBucketKeyFromIdentity(
  input: ResourceClaimGuardBucketIdentityInput
): string {
  const parsed = ResourceClaimGuardBucketIdentityInputSchema.parse(input);
  return canonicalDeterministicHash([
    parsed.strategyVersion,
    parsed.resourceKind,
    parsed.resourceId,
    String(parsed.bucketStartSeconds),
  ]);
}
