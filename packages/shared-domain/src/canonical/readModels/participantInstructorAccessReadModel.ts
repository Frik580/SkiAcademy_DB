import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  InstructorIdSchema,
  InstructorRelationshipIdSchema,
  ParticipantBlockIdSchema,
  ParticipantIdSchema,
} from '../identifiers';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from '../primitives';
import { ParticipantInstructorAccessReadModelAuthorizedActionsSchema } from './readModelAuthorizedActions';

export const PARTICIPANT_INSTRUCTOR_ACCESS_READ_SCOPES = [
  'account_manager',
  'instructor',
] as const;
export type ParticipantInstructorAccessReadScope =
  (typeof PARTICIPANT_INSTRUCTOR_ACCESS_READ_SCOPES)[number];

export const ParticipantInstructorAccessReadScopeSchema = z.enum(
  PARTICIPANT_INSTRUCTOR_ACCESS_READ_SCOPES
);

export const ParticipantInstructorAccessRelationshipProjectionSchema = z
  .object({
    instructorRelationshipId: InstructorRelationshipIdSchema,
    revision: AggregateRevisionSchema,
    status: z.enum(['active', 'revoked', 'expired']),
    expiresAt: CanonicalTimestampSchema.optional(),
  })
  .strict();

export const ParticipantInstructorAccessBlockProjectionSchema = z
  .object({
    participantBlockId: ParticipantBlockIdSchema,
    revision: AggregateRevisionSchema,
    status: z.enum(['active', 'removed']),
    reason: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

export const ParticipantInstructorAccessReadModelSchema = z
  .object({
    participantId: ParticipantIdSchema,
    instructorId: InstructorIdSchema,
    participantDisplayName: z.string().trim().min(1).max(200),
    instructorDisplayName: z.string().trim().min(1).max(200),
    relationship: ParticipantInstructorAccessRelationshipProjectionSchema.optional(),
    managerBlock: ParticipantInstructorAccessBlockProjectionSchema.optional(),
    instructorBlock: ParticipantInstructorAccessBlockProjectionSchema.optional(),
    authorizedActions: ParticipantInstructorAccessReadModelAuthorizedActionsSchema,
  })
  .strict();

export type ParticipantInstructorAccessReadModel = z.output<
  typeof ParticipantInstructorAccessReadModelSchema
>;

export const QueryParticipantInstructorAccessReadModelsInputSchema = z
  .object({
    scope: ParticipantInstructorAccessReadScopeSchema,
    participantId: ParticipantIdSchema,
    instructorId: InstructorIdSchema,
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export type QueryParticipantInstructorAccessReadModelsInput = z.output<
  typeof QueryParticipantInstructorAccessReadModelsInputSchema
>;

export const QueryParticipantInstructorAccessReadModelsResultSchema = z
  .object({
    scope: ParticipantInstructorAccessReadScopeSchema,
    item: ParticipantInstructorAccessReadModelSchema.optional(),
  })
  .strict();

export type QueryParticipantInstructorAccessReadModelsResult = z.output<
  typeof QueryParticipantInstructorAccessReadModelsResultSchema
>;

export const FORBIDDEN_PARTICIPANT_INSTRUCTOR_ACCESS_READ_INPUT_KEYS = [
  'accountId',
  'actorId',
] as const;

export function rejectSpoofedParticipantInstructorAccessReadInput(
  input: Record<string, unknown>
): void {
  for (const key of FORBIDDEN_PARTICIPANT_INSTRUCTOR_ACCESS_READ_INPUT_KEYS) {
    if (key in input) {
      throw new Error(`Client-supplied ${key} is not allowed.`);
    }
  }
}
