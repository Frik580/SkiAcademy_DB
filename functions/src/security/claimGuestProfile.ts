import { getAuth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

/** Claim compatibility profile access only; canonical identity, money and bookings
 * remain owned by their commands. Never copy roles or arbitrary source fields. */
export function createClaimGuestProfileHandler(firestore: Firestore, auth = getAuth()) {
  return async (request: CallableRequest<unknown>): Promise<{ claimed: boolean }> => {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const input = request.data as { displayName?: unknown } | null | undefined;
    if (
      input?.displayName !== undefined &&
      (typeof input.displayName !== 'string' ||
        !input.displayName.trim() ||
        input.displayName.length > 200)
    ) {
      throw new HttpsError('invalid-argument', 'Invalid initial display name.');
    }
    const initialName =
      typeof input?.displayName === 'string' ? input.displayName.trim() : undefined;
    const principal = await auth.getUser(request.auth.uid);
    const email = principal.email?.trim().toLowerCase();
    if (
      principal.disabled ||
      !principal.emailVerified ||
      !email ||
      request.auth.token.email_verified !== true ||
      request.auth.token.email?.toLowerCase() !== email ||
      request.auth.token.auth_time * 1000 < new Date(principal.tokensValidAfterTime ?? 0).getTime()
    ) {
      throw new HttpsError('permission-denied', 'A current verified email is required.');
    }
    const destination = firestore.doc(`users/${principal.uid}`);
    return firestore.runTransaction(async (tx) => {
      const own = await tx.get(destination);
      const ownData = own.data();
      if (
        own.exists &&
        (ownData?.email?.toLowerCase() !== email ||
          (ownData?.lifecycle && ownData.lifecycle.status !== 'active') ||
          ownData?.dataScope === 'test' ||
          ownData?.testSessionId)
      ) {
        throw new HttpsError('failed-precondition', 'Account reconciliation is required.');
      }
      // Email equality query is server-only and bounded; ambiguous matches fail closed.
      const matches = await tx.get(
        firestore.collection('users').where('email', '==', email).limit(3)
      );
      const candidates = matches.docs.filter((doc) => doc.id.startsWith('client_'));
      if (
        matches.size === 3 ||
        candidates.length > 1 ||
        matches.docs.some((doc) => !doc.id.startsWith('client_') && doc.id !== principal.uid)
      ) {
        throw new HttpsError('failed-precondition', 'Account reconciliation is required.');
      }
      const source = candidates[0];
      if (!source) return { claimed: false };
      const data = source.data();
      if (
        data.role !== 'user' ||
        data.systemRole ||
        data.instructorId ||
        data.isInstructor ||
        data.dataScope === 'test' ||
        data.testSessionId ||
        (data.lifecycle && data.lifecycle.status !== 'active') ||
        (data.claimedByAccountId && data.claimedByAccountId !== principal.uid)
      ) {
        throw new HttpsError('failed-precondition', 'Account reconciliation is required.');
      }
      if (!own.exists) {
        tx.create(destination, {
          uid: principal.uid,
          email,
          role: 'user',
          dataScope: 'live',
          isClientActive: true,
          displayName:
            initialName ??
            (typeof data.displayName === 'string'
              ? data.displayName.slice(0, 200)
              : 'Alpine Glider'),
          avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl.slice(0, 2048) : '',
          ...(typeof data.phoneNumber === 'string' && /^\+?[0-9\s()-]{5,40}$/.test(data.phoneNumber)
            ? { phoneNumber: data.phoneNumber }
            : {}),
          ...(typeof data.hideProgressTracking === 'boolean'
            ? { hideProgressTracking: data.hideProgressTracking }
            : {}),
          ...(typeof data.hasCompletedOnboarding === 'boolean'
            ? { hasCompletedOnboarding: data.hasCompletedOnboarding }
            : {}),
        });
      }
      if (!data.claimedByAccountId) {
        tx.update(source.ref, { claimedByAccountId: principal.uid });
      }
      return { claimed: true };
    });
  };
}
