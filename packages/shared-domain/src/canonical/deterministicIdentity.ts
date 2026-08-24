import { z } from 'zod';
import { sha256Hex } from './sha256Hex';
import {
  ActivityLogIdSchema,
  DomainOutboxIdSchema,
  InstructorRelationshipIdSchema,
  MonetaryEventIdSchema,
  ParticipantBlockIdSchema,
  type ActivityLogId,
  type CommandId,
  type DomainOutboxId,
  type InstructorId,
  type InstructorRelationshipId,
  type MonetaryEventId,
  type ParticipantBlockId,
  type ParticipantId,
} from './identifiers';

const DETERMINISTIC_ID_PART_SEPARATOR = '\u001f';

export function canonicalDeterministicHash(parts: readonly string[]): string {
  const payload = parts.join(DETERMINISTIC_ID_PART_SEPARATOR);
  return sha256Hex(payload);
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

export function participantBlockIdFromDirection(input: {
  readonly participantId: ParticipantId;
  readonly instructorId: InstructorId;
  readonly createdByKind: 'participant_manager' | 'instructor';
}): ParticipantBlockId {
  return ParticipantBlockIdSchema.parse(
    canonicalDeterministicHash([
      'participant_block:v1',
      input.createdByKind,
      input.participantId,
      input.instructorId,
    ])
  );
}

export function instructorRelationshipIdFromPair(input: {
  readonly participantId: ParticipantId;
  readonly instructorId: InstructorId;
}): InstructorRelationshipId {
  return InstructorRelationshipIdSchema.parse(
    canonicalDeterministicHash([
      'instructor_relationship:v1',
      input.participantId,
      input.instructorId,
    ])
  );
}

const PERSONAL_DATA_PATTERNS = [
  /@/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\+?\d[\d\s().-]{7,}\d\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
] as const;

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
