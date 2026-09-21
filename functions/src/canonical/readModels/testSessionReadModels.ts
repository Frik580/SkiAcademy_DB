import type { Firestore } from 'firebase-admin/firestore';
import {
  LIVE_CANONICAL_READ_SCOPE,
  QueryTestSessionReadModelsResultSchema,
  TEST_SESSION_INVENTORY_ID_PAGE_SIZE,
  TEST_SESSION_READ_MODEL_PAGE_SIZE_DEFAULT,
  documentMatchesReadScope,
  TestSessionIdSchema,
  type QueryTestSessionReadModelsInput,
  type QueryTestSessionReadModelsResult,
  type TestActorDirectoryItem,
  type TestSessionId,
  type TestSessionInventoryCounts,
} from '@ski-academy/shared-domain';
import { parseCourse } from '../courses/courseStore';
import { parseTestActor, parseTestSession } from '../testSessions/testSessionStore';

const INVENTORY_COLLECTIONS = [
  ['bookings', 'bookings'],
  ['courseClones', 'courses'],
  ['enrollments', 'course_enrollments'],
  ['payments', 'payments'],
  ['attendance', 'attendance'],
  ['issues', 'admin_issues'],
] as const;

async function countByTestSession(
  firestore: Firestore,
  collection: string,
  testSessionId: TestSessionId
): Promise<number> {
  const snapshot = await firestore
    .collection(collection)
    .where('testSessionId', '==', testSessionId)
    .count()
    .get();
  return snapshot.data().count;
}

async function listAssignedAccountIds(
  firestore: Firestore,
  testSessionId: TestSessionId
): Promise<readonly string[]> {
  const snapshot = await firestore
    .collection('test_actor_assignments')
    .where('activeTestSessionId', '==', testSessionId)
    .limit(TEST_SESSION_INVENTORY_ID_PAGE_SIZE)
    .get();
  return snapshot.docs.flatMap((document) => {
    const accountId = document.get('accountId');
    return typeof accountId === 'string' ? [accountId] : [];
  });
}

async function querySessionList(
  firestore: Firestore,
  pageSize: number
): Promise<QueryTestSessionReadModelsResult> {
  const snapshot = await firestore.collection('test_sessions').limit(pageSize).get();
  const items = snapshot.docs
    .flatMap((document) => {
      const session = parseTestSession(document.data() as Record<string, unknown>);
      return session ? [session] : [];
    })
    .sort((left, right) => right.updatedAt.seconds - left.updatedAt.seconds)
    .map((session) => ({
      testSessionId: session.testSessionId,
      status: session.status,
      label: session.label,
      createdByAccountId: session.createdByAccountId,
      inventoryRevision: session.inventoryRevision,
      revision: session.revision,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));
  return QueryTestSessionReadModelsResultSchema.parse({ scope: 'test_session_list', items });
}

async function queryInventory(
  firestore: Firestore,
  testSessionId: TestSessionId
): Promise<QueryTestSessionReadModelsResult> {
  const sessionSnap = await firestore.collection('test_sessions').doc(testSessionId).get();
  const session = parseTestSession(sessionSnap.data() as Record<string, unknown> | undefined);
  if (!session || session.testSessionId !== testSessionId) {
    return QueryTestSessionReadModelsResultSchema.parse({ scope: 'test_session_inventory' });
  }

  const assignedAccountIds = await listAssignedAccountIds(firestore, testSessionId);
  const countsEntries = await Promise.all(
    INVENTORY_COLLECTIONS.map(async ([key, collection]) => [
      key,
      await countByTestSession(firestore, collection, testSessionId),
    ] as const)
  );
  const counts = {
    ...Object.fromEntries(countsEntries),
    assignedActors: assignedAccountIds.length,
  } as TestSessionInventoryCounts;

  return QueryTestSessionReadModelsResultSchema.parse({
    scope: 'test_session_inventory',
    item: {
      testSessionId: session.testSessionId,
      status: session.status,
      label: session.label,
      createdByAccountId: session.createdByAccountId,
      clonedCourseIds: session.config.clonedCourseIds,
      assignedAccountIds,
      counts,
      inventoryRevision: session.inventoryRevision,
      revision: session.revision,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
  });
}

async function queryActorDirectory(
  firestore: Firestore,
  pageSize: number
): Promise<QueryTestSessionReadModelsResult> {
  const snapshot = await firestore.collection('test_actors').limit(pageSize).get();
  const actors = snapshot.docs.flatMap((document) => {
    const actor = parseTestActor(document.data() as Record<string, unknown>);
    return actor ? [actor] : [];
  });
  if (actors.length === 0) {
    return QueryTestSessionReadModelsResultSchema.parse({
      scope: 'test_actor_directory',
      items: [],
    });
  }

  const refs = actors.flatMap((actor) => [
    firestore.collection('users').doc(actor.accountId),
    firestore.collection('test_actor_assignments').doc(actor.accountId),
  ]);
  const snapshots = await firestore.getAll(...refs);
  const items: TestActorDirectoryItem[] = actors.map((actor, index) => {
    const accountSnap = snapshots[index * 2];
    const assignmentSnap = snapshots[index * 2 + 1];
    const rawAccount = accountSnap?.data() as Record<string, unknown> | undefined;
    const rawDisplayName =
      typeof rawAccount?.displayName === 'string' ? rawAccount.displayName.trim() : '';
    const activeTestSessionId = assignmentSnap?.exists
      ? (assignmentSnap.get('activeTestSessionId') as string | null | undefined) ?? null
      : null;
    const parsedSessionId = TestSessionIdSchema.safeParse(activeTestSessionId);
    return {
      accountId: actor.accountId,
      kind: actor.kind,
      allowed: actor.allowed,
      participantIds: actor.participantIds,
      ...(actor.instructorId ? { instructorId: actor.instructorId } : {}),
      activeTestSessionId: parsedSessionId.success ? parsedSessionId.data : null,
      displayName: rawDisplayName || actor.accountId,
    };
  });

  return QueryTestSessionReadModelsResultSchema.parse({
    scope: 'test_actor_directory',
    items: items.map((item) => ({
      ...item,
      displayName: item.displayName.trim() || item.accountId,
    })),
  });
}

async function queryLiveCourseTemplates(
  firestore: Firestore,
  pageSize: number
): Promise<QueryTestSessionReadModelsResult> {
  const snapshot = await firestore.collection('courses').limit(pageSize).get();
  const items = snapshot.docs.flatMap((document) => {
    if (!documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, document.data() ?? {})) {
      return [];
    }
    const course = parseCourse(document.data() as Record<string, unknown>);
    if (!course) return [];
    return [
      {
        courseId: course.courseId,
        title: course.title,
        lifecycle: course.lifecycle,
        revision: course.revision,
      },
    ];
  });
  items.sort((left, right) => left.title.localeCompare(right.title));
  return QueryTestSessionReadModelsResultSchema.parse({
    scope: 'live_course_templates',
    items,
  });
}

export async function queryTestSessionReadModels(
  firestore: Firestore,
  input: QueryTestSessionReadModelsInput
): Promise<QueryTestSessionReadModelsResult> {
  const pageSize = input.scope === 'test_session_inventory'
    ? TEST_SESSION_READ_MODEL_PAGE_SIZE_DEFAULT
    : input.pageSize ?? TEST_SESSION_READ_MODEL_PAGE_SIZE_DEFAULT;
  if (input.scope === 'test_session_list') return querySessionList(firestore, pageSize);
  if (input.scope === 'test_session_inventory') {
    return queryInventory(firestore, input.testSessionId);
  }
  if (input.scope === 'test_actor_directory') return queryActorDirectory(firestore, pageSize);
  return queryLiveCourseTemplates(firestore, pageSize);
}
