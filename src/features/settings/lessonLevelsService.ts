import {
  AggregateRevisionSchema,
  IdempotencyKeySchema,
  LessonLevelsPayloadSchema,
} from '@ski-academy/shared-domain';
import { getDoc } from 'firebase/firestore';
import { auth, db, doc } from '../../infrastructure/firebase';
import { executeAuthenticatedCanonicalCommand } from '../../lib/canonical/canonicalCommandClient';
import { useLessonLevelsStore } from './lessonLevelsStore';

export async function saveLessonLevels(
  levels: unknown,
  revision: number,
  key: string
): Promise<void> {
  const accountId = auth.currentUser?.uid;
  if (!accountId) throw new Error('Authentication required');
  const payload = LessonLevelsPayloadSchema.parse({ levels });
  const result = await executeAuthenticatedCanonicalCommand(accountId, {
    kind: 'update_lesson_levels',
    intent: { ...payload, reasonExplanation: 'Manage lesson level catalog' },
    idempotencyKey: IdempotencyKeySchema.parse(key),
    expectedRevision: AggregateRevisionSchema.parse(revision),
    administratorContext: true,
  });
  const snapshot = await getDoc(doc(db, 'settings', 'lesson_levels'));
  useLessonLevelsStore.getState().receive(snapshot.exists() ? snapshot.data() : undefined);
  if (result.status === 'error') throw new Error(result.error.code);
}
