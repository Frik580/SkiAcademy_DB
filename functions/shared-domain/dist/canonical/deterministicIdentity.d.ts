import { z } from 'zod';
import { type ActivityLogId, type CommandId, type DomainOutboxId, type InstructorId, type InstructorRelationshipId, type MonetaryEventId, type ParticipantBlockId, type ParticipantId } from './identifiers';
export declare function canonicalDeterministicHash(parts: readonly string[]): string;
export declare function activityLogIdFromCommandId(commandId: CommandId): ActivityLogId;
export declare function domainOutboxIdFromCommand(commandId: CommandId, deliveryEffectOrdinal: number): DomainOutboxId;
export declare function monetaryEventIdFromCommandEffect(commandId: CommandId, effectOrdinal: number): MonetaryEventId;
export declare function participantBlockIdFromDirection(input: {
    readonly participantId: ParticipantId;
    readonly instructorId: InstructorId;
    readonly createdByKind: 'participant_manager' | 'instructor';
}): ParticipantBlockId;
export declare function instructorRelationshipIdFromPair(input: {
    readonly participantId: ParticipantId;
    readonly instructorId: InstructorId;
}): InstructorRelationshipId;
export declare function validateDeterministicIdentityInputs(inputs: Readonly<Record<string, string>>, context: z.RefinementCtx): void;
