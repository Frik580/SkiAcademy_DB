import type { Firestore } from 'firebase-admin/firestore';
import {
  participantBlockIdFromDirection,
  type InstructorId,
  type ParticipantBlock,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { participantBlockPath, parseParticipantBlock } from '../participantAccess/participantAccessStore';

export async function loadActiveParticipantBlocksForPair(
  firestore: Firestore,
  participantId: ParticipantId,
  instructorId: InstructorId
): Promise<readonly ParticipantBlock[]> {
  const managerBlockId = participantBlockIdFromDirection({
    participantId,
    instructorId,
    createdByKind: 'participant_manager',
  });
  const instructorBlockId = participantBlockIdFromDirection({
    participantId,
    instructorId,
    createdByKind: 'instructor',
  });

  const blocks: ParticipantBlock[] = [];
  for (const blockId of [managerBlockId, instructorBlockId]) {
    const snap = await firestore.doc(participantBlockPath(blockId)).get();
    const block = parseParticipantBlock(snap.data() as Record<string, unknown> | undefined);
    if (block && block.status === 'active') {
      blocks.push(block);
    }
  }
  return blocks;
}
