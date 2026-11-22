import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  AccountIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  TestActorSchema,
  TestActorAssignmentSchema,
  documentMatchesReadScope,
  normalizeFirestoreDocument,
} from '@ski-academy/shared-domain';
import { requireActiveAccount } from './activeAccount';
import { createFirestoreCanonicalExecutionScopeStore } from '../canonical/testSessions/canonicalExecutionScopeResolver';
import { resolveCanonicalReadScope } from '../canonical/testSessions/canonicalReadScopeResolver';
import {
  loadTargetedAccountManagerAuthorization,
  queryParticipantInstructorAccessReadModels,
} from '../canonical/readModels/participantInstructorAccessReadModels';
import { createReadModelRequestContext } from '../canonical/readModels/readModelRequestContext';
import { LIVE_CANONICAL_READ_SCOPE } from '@ski-academy/shared-domain';

function forbidden(): never {
  throw new HttpsError('permission-denied', 'Image access denied.');
}

export function protectedImagePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 1024 ||
    !/^(participant-avatars\/[A-Za-z0-9_-]+\/avatar.jpg|(?:courses|instructors)\/[A-Za-z0-9_.-]+|test-actors\/[A-Za-z0-9_-]+\/(avatar(?:\.jpg|\.png)?|[^/]+)|test-sessions\/[A-Za-z0-9_-]+\/(misc\/.+|course-assets\/[A-Za-z0-9_-]+\/[^/]+))$/.test(
      value
    ) ||
    value
      .split('/')
      .some((part) => part === '.' || part === '..' || !/^[A-Za-z0-9_.-]+$/.test(part))
  ) {
    throw new HttpsError('invalid-argument', 'Invalid protected image path.');
  }
  return value;
}

/** No signed/download-token URL is issued. Every request rechecks current authority. */
export async function authorizeProtectedImage(
  db: Firestore,
  uid: string,
  rawPath: unknown,
  write: boolean,
  requestedSession?: unknown
) {
  let path = protectedImagePath(rawPath);
  const read = async (name: string) => (await db.doc(name).get()).data();
  const profile = await read(`users/${uid}`);
  const account = requireActiveAccount(uid, profile);
  const actor = await read(`test_actors/${uid}`);
  if (write && actor && path.startsWith('participant-avatars/')) {
    path = path.replace(/^participant-avatars\//, 'test-actors/');
  }
  const parts = path.split('/');
  const subjectId = parts[1];
  const participant =
    parts[0] === 'test-actors' ? await read(`participants/${subjectId}`) : undefined;
  const persistentParticipant =
    participant?.dataScope === 'test' && participant.testSessionId === undefined;
  const directActorRecord =
    !participant && parts[0] === 'test-actors' ? await read(`test_actors/${subjectId}`) : undefined;
  const directActor = TestActorSchema.safeParse(normalizeFirestoreDocument(directActorRecord));
  if (directActorRecord && (!directActor.success || directActor.data.accountId !== subjectId)) {
    forbidden();
  }
  let imageActor = directActor.data;
  if (parts[0] === 'test-actors' && !imageActor && (!participant || persistentParticipant)) {
    const matches = await db
      .collection('test_actors')
      .where(
        persistentParticipant ? 'participantIds' : 'instructorId',
        persistentParticipant ? 'array-contains' : '==',
        subjectId
      )
      .limit(2)
      .get();
    if (matches.size !== 1) forbidden();
    const [document] = matches.docs;
    const parsed = TestActorSchema.safeParse(normalizeFirestoreDocument(document.data()));
    if (!parsed.success || parsed.data.accountId !== document.id) forbidden();
    imageActor = parsed.data;
  }
  const target = imageActor?.allowed ? imageActor : undefined;
  const targetAssignment = target
    ? TestActorAssignmentSchema.safeParse(
        normalizeFirestoreDocument(await read(`test_actor_assignments/${target.accountId}`))
      )
    : undefined;
  const targetSession =
    targetAssignment?.success && targetAssignment.data.accountId === target?.accountId
      ? targetAssignment.data.activeTestSessionId
      : undefined;
  if (['participant-avatars', 'courses', 'instructors'].includes(parts[0])) {
    if (!write || actor || !documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, profile))
      forbidden();
    if (parts[0] === 'participant-avatars') {
      const ownership = await loadTargetedAccountManagerAuthorization(
        db,
        account.accountId,
        ParticipantIdSchema.parse(parts[1]),
        createReadModelRequestContext(db)
      );
      if (!ownership.allowed) forbidden();
    } else {
      if (profile?.role !== 'admin') forbidden();
      const id = parts[1].replace(/\.(jpg|jpeg|png|webp)$/i, '');
      const subject = await read(`${parts[0]}/${id}`);
      if (subject && !documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, subject)) forbidden();
    }
    return { path, administrator: profile?.role === 'admin', sessionId: undefined, uid };
  }
  const explicitSession =
    parts[0] === 'test-sessions'
      ? parts[1]
      : (requestedSession ?? participant?.testSessionId ?? targetSession);
  const scope = await resolveCanonicalReadScope(createFirestoreCanonicalExecutionScopeStore(db), {
    accountId: AccountIdSchema.parse(uid),
    accountLifecycleStatus: account.lifecycle.status,
    isAdministrator: profile?.role === 'admin',
    requestedTestSessionId: actor ? undefined : explicitSession,
  }).catch(() => forbidden());
  if (
    scope.dataScope !== 'test' ||
    (parts[0] === 'test-sessions' && scope.testSessionId !== parts[1])
  )
    forbidden();
  const membership = await read(`test_sessions/${scope.testSessionId}/membership/${uid}`);
  if (membership?.accountId !== uid) forbidden();
  const administrator = !actor && profile?.role === 'admin';
  if (parts[0] === 'test-sessions') {
    if (parts[2] === 'course-assets') {
      const course = await read(`courses/${parts[3]}`);
      if (!documentMatchesReadScope(scope, course) || (write && !administrator)) forbidden();
    }
    return { path, administrator, sessionId: scope.testSessionId, uid };
  }
  if (target && targetSession === scope.testSessionId) {
    const targetAccount = requireActiveAccount(
      target.accountId,
      await read(`users/${target.accountId}`)
    );
    if (
      targetAccount.dataScope !== 'test' ||
      (targetAccount.testSessionId && targetAccount.testSessionId !== scope.testSessionId)
    )
      forbidden();
    const targetMembership = await read(
      `test_sessions/${scope.testSessionId}/membership/${target.accountId}`
    );
    if (targetMembership?.accountId !== target.accountId) forbidden();
  }
  if (participant) {
    if (
      persistentParticipant
        ? !target || targetSession !== scope.testSessionId
        : !documentMatchesReadScope(scope, participant)
    )
      forbidden();
    if (administrator) return { path, administrator, sessionId: scope.testSessionId, uid };
    const instructorId = InstructorIdSchema.safeParse(profile?.instructorId);
    const manager = await loadTargetedAccountManagerAuthorization(
      db,
      account.accountId,
      ParticipantIdSchema.parse(subjectId),
      createReadModelRequestContext(db, { readScope: scope })
    );
    if (manager.allowed) return { path, administrator, sessionId: scope.testSessionId, uid };
    if (!write && instructorId.success) {
      const access = await queryParticipantInstructorAccessReadModels(
        db,
        {
          scope: 'instructor',
          participantId: ParticipantIdSchema.parse(subjectId),
          instructorId: instructorId.data,
        },
        {
          accountId: account.accountId,
          instructorId: instructorId.data,
          readScope: scope,
          requireUnblocked: true,
        }
      );
      if (access.item) return { path, administrator, sessionId: scope.testSessionId, uid };
    }
    forbidden();
  }
  // Persistent Account and Instructor images are visible only in their current
  // server assignment, never because another actor shares an allowed flag.
  if (
    !target ||
    targetSession !== scope.testSessionId ||
    (write && !administrator && target.accountId !== uid)
  ) {
    forbidden();
  }
  return { path, administrator, sessionId: scope.testSessionId, uid };
}
