import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import { AccountIdSchema, ParticipantIdSchema } from '../identifiers';

export const ManagedParticipantPickerAgeProjectionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('birth_date'),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .strict(),
  z
    .object({
      kind: z.literal('age_years'),
      years: z.number().finite().int().min(0).max(125),
    })
    .strict(),
]);

export type ManagedParticipantPickerAgeProjection = z.output<
  typeof ManagedParticipantPickerAgeProjectionSchema
>;

export const ManagedParticipantPickerItemSchema = z
  .object({
    participantId: ParticipantIdSchema,
    displayName: z.string().trim().min(1).max(200),
    discipline: z.enum(['ski', 'snowboard']),
    skillLevel: z.string().trim().min(1).max(64),
    age: ManagedParticipantPickerAgeProjectionSchema,
    authority: z.enum(['self', 'parent_guardian']),
  })
  .strict();

export type ManagedParticipantPickerItem = z.output<typeof ManagedParticipantPickerItemSchema>;

export const QueryManagedParticipantPickerReadModelsInputSchema = z
  .object({
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export type QueryManagedParticipantPickerReadModelsInput = z.output<
  typeof QueryManagedParticipantPickerReadModelsInputSchema
>;

export const QueryManagedParticipantPickerReadModelsResultSchema = z
  .object({
    items: z.array(ManagedParticipantPickerItemSchema),
  })
  .strict();

export type QueryManagedParticipantPickerReadModelsResult = z.output<
  typeof QueryManagedParticipantPickerReadModelsResultSchema
>;

/** Reject client-supplied account identifiers on the picker read-model seam. */
export const FORBIDDEN_MANAGED_PARTICIPANT_PICKER_INPUT_KEYS = [
  'accountId',
  'payerAccountId',
  'userId',
  'bookedBy',
] as const;

export function rejectSpoofedManagedParticipantPickerInput(
  input: Record<string, unknown>
): void {
  for (const key of FORBIDDEN_MANAGED_PARTICIPANT_PICKER_INPUT_KEYS) {
    if (key in input) {
      throw new Error(`Client-supplied ${key} is not allowed.`);
    }
  }
}

export function parseManagedParticipantPickerAccountId(
  authUid: string | undefined
): z.ZodSafeParseResult<z.output<typeof AccountIdSchema>> {
  if (!authUid) {
    return AccountIdSchema.safeParse(undefined);
  }
  return AccountIdSchema.safeParse(authUid);
}
