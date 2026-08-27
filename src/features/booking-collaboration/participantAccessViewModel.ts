import type { ParticipantInstructorAccessReadModel } from '@ski-academy/shared-domain';
import type { ParticipantAccessCabinetItem } from './bookingCollaborationContracts';
import { participantInstructorAccessKey } from './deriveCollaborationIdempotencyKeys';

export function mapParticipantInstructorAccessReadModelToCabinetItem(
  readModel: ParticipantInstructorAccessReadModel
): ParticipantAccessCabinetItem {
  return {
    participantId: readModel.participantId,
    instructorId: readModel.instructorId,
    participantDisplayName: readModel.participantDisplayName,
    instructorDisplayName: readModel.instructorDisplayName,
    relationshipStatus: readModel.relationship?.status,
    relationshipRevision: readModel.relationship?.revision,
    instructorRelationshipId: readModel.relationship?.instructorRelationshipId,
    managerBlockStatus: readModel.managerBlock?.status,
    managerBlockRevision: readModel.managerBlock?.revision,
    managerBlockId: readModel.managerBlock?.participantBlockId,
    instructorBlockStatus: readModel.instructorBlock?.status,
    instructorBlockRevision: readModel.instructorBlock?.revision,
    instructorBlockId: readModel.instructorBlock?.participantBlockId,
    authorizedActions: readModel.authorizedActions,
  };
}

export function storeParticipantAccessItem(
  existing: ReadonlyMap<string, ParticipantAccessCabinetItem>,
  readModel: ParticipantInstructorAccessReadModel | undefined,
  participantId: string,
  instructorId: string
): Map<string, ParticipantAccessCabinetItem> {
  const key = participantInstructorAccessKey(participantId, instructorId);
  const merged = new Map(existing);
  if (!readModel) {
    merged.delete(key);
    return merged;
  }
  merged.set(key, mapParticipantInstructorAccessReadModelToCabinetItem(readModel));
  return merged;
}
