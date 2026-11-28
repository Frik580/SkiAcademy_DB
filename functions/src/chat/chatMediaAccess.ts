import type { Firestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Transaction } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  AccountIdSchema,
  normalizeFirestoreDocument,
  type Account,
} from '@ski-academy/shared-domain';
import { resolveCanonicalExecutionScope } from '../canonical/testSessions/canonicalExecutionScopeResolver';
import { requireActiveAccount } from '../security/activeAccount';
import { requireAdministratorAccountSessionPolicy } from '../security/administratorSession';

export type AuthorizedChatContext = {
  account: Account;
  profile: FirebaseFirestore.DocumentData;
  assignedInstructor: boolean;
  hasParticipantAccess: () => Promise<boolean>;
};

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
export async function authorizeChatMedia(
  db: Firestore,
  uid: string,
  rawPath: unknown,
  observeRead?: (path: string) => void,
  onAuthorized?: (tx: Transaction, context: AuthorizedChatContext) => Promise<void>,
  token?: DecodedIdToken,
  messageAccess = false
) {
  const path = parseChatMediaPath(rawPath);
  const authorize = async (tx: Transaction) => {
    const read = async (name: string) => {
      observeRead?.(name);
      return (await tx.get(db.doc(name))).data();
    };
    const account = await read(`users/${uid}`);
    const canonicalAccount = requireActiveAccount(uid, account);
    if (!account) throw new HttpsError('permission-denied', 'Inactive account');
    const admin = account.role === 'admin';
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
      if (actor && canonicalAccount.dataScope !== 'test')
        throw new HttpsError('permission-denied', 'Inconsistent TEST identity');
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
    if (admin && !path.sessionId) requireAdministratorAccountSessionPolicy(account, token);
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
    const canonicalBooking = booking?.party && booking.occurrence;
    // Existing historical chat only; canonical/mixed records never fall back.
    const legacyBooking = booking && !('party' in booking) && !('occurrence' in booking);
    const instructorIds = booking
      ? [canonicalBooking?.instructorId ?? (legacyBooking ? booking.instructorId : undefined)]
      : (course?.instructorRosterIds ?? course?.instructorIds ?? []);
    let assignedInstructor =
      typeof account.instructorId === 'string' &&
      Array.isArray(instructorIds) &&
      instructorIds.includes(account.instructorId);
    // The existing Rules allow this branch for legacy enrollment messages.
    if (
      messageAccess &&
      !assignedInstructor &&
      legacyBooking &&
      typeof account.instructorId === 'string' &&
      typeof booking.instructorId === 'string' &&
      booking.instructorId.startsWith('course_') &&
      booking.status !== 'cancelled' &&
      booking.isDeleted !== true &&
      typeof booking.courseId === 'string' &&
      /^[A-Za-z0-9_-]+$/.test(booking.courseId)
    ) {
      const linkedCourse = await read(`courses/${booking.courseId}`);
      const roster = linkedCourse?.instructorRosterIds ?? linkedCourse?.instructorIds;
      assignedInstructor =
        !!linkedCourse &&
        inScope(linkedCourse) &&
        Array.isArray(roster) &&
        roster.includes(account.instructorId);
    }
    let participantAccess: Promise<boolean> | undefined;
    const hasParticipantAccess = () =>
      (participantAccess ??= (async () => {
        if (!booking) return !!(await read(`course_chat_access/${uid}/courses/${path.threadId}`));
        if (legacyBooking) return booking.userId === uid;
        if (canonicalBooking) {
          const ids: unknown = booking.party.participantIds;
          if (Array.isArray(ids) && (messageAccess || ids.length <= 8)) {
            for (const id of ids.slice(0, 8)) {
              if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) continue;
              const guard = await read(`participant_management_active_owner/${id}`);
              if (guard?.accountId === uid) return true;
            }
          }
        }
        return false;
      })());
    // Keep the course-access dependency for existing read and media callers.
    if (
      admin ||
      (booking && assignedInstructor) ||
      (await hasParticipantAccess()) ||
      assignedInstructor
    ) {
      await onAuthorized?.(tx, {
        account: canonicalAccount,
        profile: account,
        assignedInstructor,
        hasParticipantAccess,
      });
      return path;
    }
    throw new HttpsError('permission-denied', 'Not a current chat participant');
  };
  return onAuthorized
    ? db.runTransaction(authorize)
    : db.runTransaction(authorize, { readOnly: true });
}

export function mediaSizeLimit(contentType: string) {
  if (/^image\//.test(contentType)) return 5 * 1024 * 1024;
  if (/^video\//.test(contentType)) return 50 * 1024 * 1024;
  throw new HttpsError('invalid-argument', 'Unsupported media format');
}
