import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { AccountIdSchema, normalizeFirestoreDocument } from '@ski-academy/shared-domain';
import { resolveCanonicalExecutionScope } from '../canonical/testSessions/canonicalExecutionScopeResolver';

export function parseChatMediaPath(path: unknown) {
  if (typeof path !== 'string' || path.length > 1024)
    throw new HttpsError('invalid-argument', 'Invalid media path');
  const live = /^chat\/([^/]+)\/(.+)$/.exec(path);
  const test = /^test-sessions\/([^/]+)\/booking-chat\/([^/]+)\/(.+)$/.exec(path);
  const parts = live
    ? { threadId: live[1], fileName: live[2], sessionId: undefined }
    : test
      ? { threadId: test[2], fileName: test[3], sessionId: test[1] }
      : undefined;
  if (
    !parts ||
    [parts.threadId, ...parts.fileName.split('/'), parts.sessionId].some(
      (value) =>
        value !== undefined && (!/^[a-zA-Z0-9_.-]+$/.test(value) || value === '.' || value === '..')
    )
  )
    throw new HttpsError('invalid-argument', 'Invalid media path');
  return { ...parts, path };
}

/** Fresh authoritative reads on every media operation. No cached ACL or payer authority. */
export async function authorizeChatMedia(db: Firestore, uid: string, rawPath: unknown) {
  const path = parseChatMediaPath(rawPath);
  return db.runTransaction(async (tx) => {
    const read = async (name: string) => (await tx.get(db.doc(name))).data();
    const account = await read(`users/${uid}`);
    if (
      !account ||
      ('lifecycle' in account &&
        (!account.lifecycle ||
          typeof account.lifecycle !== 'object' ||
          account.lifecycle.status !== 'active'))
    )
      throw new HttpsError('permission-denied', 'Inactive account');
    const admin = account.role === 'admin' || account.systemRole === 'owner';
    const actor = await read(`test_actors/${uid}`);
    if (path.sessionId || actor) {
      const scope = await resolveCanonicalExecutionScope(
        {
          readTestActor: async () => normalizeFirestoreDocument(actor),
          readTestActorAssignment: async () =>
            normalizeFirestoreDocument(await read(`test_actor_assignments/${uid}`)),
          readTestSession: async (id) =>
            normalizeFirestoreDocument(await read(`test_sessions/${id}`)),
        },
        {
          accountId: AccountIdSchema.parse(uid),
          accountLifecycleStatus: account.lifecycle?.status,
          isAdministrator: admin,
          requestedTestSessionId: actor ? undefined : path.sessionId,
        }
      ).catch(() => {
        throw new HttpsError('permission-denied', 'Invalid canonical TEST scope');
      });
      if (scope.dataScope !== 'test' || scope.testSessionId !== path.sessionId)
        throw new HttpsError('permission-denied', 'Mismatched active TEST assignment');
    }
    if (path.sessionId) {
      const membership = await read(`test_sessions/${path.sessionId}/membership/${uid}`);
      if (!membership || (!admin && actor?.allowed !== true))
        throw new HttpsError('permission-denied', 'Invalid TEST context');
      if (!admin && account.testSessionId && account.testSessionId !== path.sessionId)
        throw new HttpsError('permission-denied', 'Mismatched TEST account');
    } else if (
      actor ||
      (account.dataScope !== undefined && account.dataScope !== 'live') ||
      account.testSessionId
    ) {
      throw new HttpsError('permission-denied', 'TEST principal on LIVE path');
    }
    const booking = await read(`bookings/${path.threadId}`);
    const course = await read(`courses/${path.threadId}`);
    const inScope = (record: FirebaseFirestore.DocumentData) =>
      path.sessionId
        ? record.dataScope === 'test' && record.testSessionId === path.sessionId
        : (record.dataScope === undefined || record.dataScope === 'live') && !record.testSessionId;
    // A collision cannot use the course branch to bypass Booking authorization.
    const subject = booking ?? course;
    if (!subject || !inScope(subject) || (booking && course && !inScope(course)))
      throw new HttpsError('permission-denied', 'Invalid media scope');
    if (admin) return path;
    if (booking) {
      if (!booking.party || !booking.occurrence) {
        // Existing historical chat only; canonical/mixed records never fall back.
        if (
          !('party' in booking) &&
          !('occurrence' in booking) &&
          (booking.userId === uid ||
            (typeof account.instructorId === 'string' &&
              booking.instructorId === account.instructorId))
        )
          return path;
      } else {
        if (
          typeof account.instructorId === 'string' &&
          account.instructorId === booking.occurrence.instructorId
        )
          return path;
        const ids: unknown = booking.party.participantIds;
        if (Array.isArray(ids) && ids.length <= 8) {
          for (const id of ids) {
            if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) continue;
            const guard = await read(`participant_management_active_owner/${id}`);
            if (guard?.accountId === uid) return path;
          }
        }
      }
    } else if (course) {
      const access = await read(`course_chat_access/${uid}/courses/${path.threadId}`);
      const instructors = course.instructorRosterIds ?? course.instructorIds ?? [];
      if (
        access ||
        (typeof account.instructorId === 'string' && instructors.includes(account.instructorId))
      )
        return path;
    }
    throw new HttpsError('permission-denied', 'Not a current chat participant');
  });
}

export function mediaSizeLimit(contentType: string) {
  if (/^image\//.test(contentType)) return 5 * 1024 * 1024;
  if (/^video\//.test(contentType)) return 50 * 1024 * 1024;
  throw new HttpsError('invalid-argument', 'Unsupported media format');
}
