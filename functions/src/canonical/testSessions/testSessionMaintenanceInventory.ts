import { FieldPath, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  summarizeMaintenanceCounts,
  type TestSessionMaintenanceCandidate,
  type TestSessionMaintenanceCountKey,
} from '@ski-academy/shared-domain';

/** Session-owned collections scanned by equality on testSessionId. Page size is bounded. */
export const TEST_SESSION_MAINTENANCE_COLLECTIONS = [
  'bookings',
  'booking_proposals',
  'booking_change_requests',
  'attendance',
  'course_enrollments',
  'payments',
  'monetary_events',
  'admin_issues',
  'resource_claims',
  'resource_claim_guards',
  'active_course_enrollment_guards',
  'command_idempotency',
  'domain_outbox',
  'activity_logs',
  'notifications',
  'instructor_reviews',
  'participant_lesson_feedback',
  'administrative_availability_blocks',
  'courses',
  'course_catalog_content',
  'booking_attendance_outcome_work',
  'course_enrollment_outcome_work',
  'provider_event_receipts',
  'homework',
] as const;

const PAGE_SIZE = 100;

function candidateFromData(
  path: string,
  data: Record<string, unknown>
): TestSessionMaintenanceCandidate {
  return {
    path,
    revision: typeof data.revision === 'number' ? data.revision : null,
    dataScope: typeof data.dataScope === 'string' ? data.dataScope : null,
    testSessionId: typeof data.testSessionId === 'string' ? data.testSessionId : null,
  };
}

async function pageAll(
  firestore: Firestore,
  collectionPath: string
): Promise<QueryDocumentSnapshot[]> {
  const docs: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = firestore.collection(collectionPath).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    docs.push(...snap.docs);
    if (snap.size < PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return docs;
}

async function pageEquals(
  firestore: Firestore,
  collectionPath: string,
  testSessionId: string
): Promise<QueryDocumentSnapshot[]> {
  const docs: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    let query = firestore
      .collection(collectionPath)
      .where('testSessionId', '==', testSessionId)
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    docs.push(...snap.docs);
    if (snap.size < PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return docs;
}

export async function collectQueryableSessionCandidates(
  firestore: Firestore,
  testSessionId: string,
  actorAccountIds: readonly string[]
): Promise<TestSessionMaintenanceCandidate[]> {
  const candidates: TestSessionMaintenanceCandidate[] = [];
  for (const collection of TEST_SESSION_MAINTENANCE_COLLECTIONS) {
    const docs = await pageEquals(firestore, collection, testSessionId);
    for (const doc of docs) {
      const data = doc.data() as Record<string, unknown>;
      candidates.push(candidateFromData(`${collection}/${doc.id}`, data));
      if (collection !== 'courses') continue;
      const days = await pageAll(firestore, `courses/${doc.id}/days`);
      for (const day of days) {
        candidates.push(
          candidateFromData(`courses/${doc.id}/days/${day.id}`, day.data() as Record<string, unknown>)
        );
      }
    }
  }

  for (const accountId of actorAccountIds) {
    const chats = await pageEquals(
      firestore,
      `course_chat_access/${accountId}/courses`,
      testSessionId
    );
    for (const chat of chats) {
      candidates.push(
        candidateFromData(
          `course_chat_access/${accountId}/courses/${chat.id}`,
          chat.data() as Record<string, unknown>
        )
      );
    }
  }
  return candidates;
}

export async function collectFixedIdentityCandidates(
  firestore: Firestore,
  paths: readonly string[]
): Promise<TestSessionMaintenanceCandidate[]> {
  const candidates: TestSessionMaintenanceCandidate[] = [];
  for (const path of paths) {
    const snap = await firestore.doc(path).get();
    if (!snap.exists) continue;
    candidates.push(candidateFromData(path, (snap.data() ?? {}) as Record<string, unknown>));
  }
  return candidates;
}

export async function collectMembershipCandidates(
  firestore: Firestore,
  testSessionId: string
): Promise<TestSessionMaintenanceCandidate[]> {
  const docs = await pageEquals(firestore, `test_sessions/${testSessionId}/membership`, testSessionId);
  return docs.map((doc) =>
    candidateFromData(
      `test_sessions/${testSessionId}/membership/${doc.id}`,
      doc.data() as Record<string, unknown>
    )
  );
}

export function maintenanceCounts(
  candidates: readonly TestSessionMaintenanceCandidate[],
  storageObjects: number
): Partial<Record<TestSessionMaintenanceCountKey, number>> {
  return summarizeMaintenanceCounts(candidates, storageObjects);
}
