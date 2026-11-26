import { createHash, randomUUID } from 'node:crypto';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { documentMatchesReadScope, LIVE_CANONICAL_READ_SCOPE } from '@ski-academy/shared-domain';
import { info } from 'firebase-functions/logger';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { requireActiveAccount } from './activeAccount';

const RECENT_AUTH_SECONDS = 10 * 60;

export async function requireLiveAdministrator(
  firestore: Firestore,
  uid: string,
  token: DecodedIdToken | undefined,
  transaction?: Transaction
): Promise<void> {
  const account = firestore.collection('users').doc(uid);
  const profile = (await (transaction ? transaction.get(account) : account.get())).data();
  requireActiveAccount(uid, profile);
  if (
    profile?.role !== 'admin' ||
    !documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, profile) ||
    (!transaction && (await firestore.doc(`test_actors/${uid}`).get()).exists)
  ) {
    throw new HttpsError('permission-denied', 'This action is not permitted.');
  }
  requireAdministratorAccountSessionPolicy(profile, token);
}

/** Server-owned Account fields shared with the Firestore and Storage Rules. */
export function requireAdministratorAccountSessionPolicy(
  profile: Record<string, unknown> | undefined,
  token: DecodedIdToken | undefined
): void {
  const revokedThrough = profile?.adminSessionsRevokedThrough;
  if (
    revokedThrough !== undefined &&
    (!Number.isSafeInteger(revokedThrough) ||
      !token ||
      !Number.isSafeInteger(token.auth_time) ||
      token.auth_time <= (revokedThrough as number))
  ) {
    throw new HttpsError('unauthenticated', 'Sign in again.', { code: 'ADMIN_SESSION_INVALID' });
  }
  if (
    profile?.adminTotpRequired !== undefined &&
    profile.adminTotpRequired !== false &&
    (profile.adminTotpRequired !== true || token?.firebase?.sign_in_second_factor !== 'totp')
  ) {
    throw new HttpsError(
      'permission-denied',
      'Войдите с кодом аутентификатора. Sign in with your authenticator code.',
      { code: 'ADMIN_TOTP_REQUIRED' }
    );
  }
}

/** The callable framework has already verified the token signature and expiry. */
export async function requireCurrentAdministratorSession(
  token: DecodedIdToken,
  auth: Pick<ReturnType<typeof getAuth>, 'getUser'> = getAuth()
): Promise<void> {
  let principal;
  try {
    principal = await auth.getUser(token.uid);
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== 'auth/user-not-found') {
      throw new HttpsError('unavailable', 'Session verification is temporarily unavailable.');
    }
  }
  const validAfter = principal?.tokensValidAfterTime
    ? Date.parse(principal.tokensValidAfterTime)
    : 0;
  if (
    !principal ||
    principal.disabled ||
    !Number.isSafeInteger(token.auth_time) ||
    !Number.isFinite(validAfter) ||
    token.auth_time * 1000 < validAfter
  ) {
    throw new HttpsError('unauthenticated', 'Sign in again.', { code: 'ADMIN_SESSION_INVALID' });
  }
}

export function requireRecentAdministratorAuthentication(token: DecodedIdToken): void {
  const age = Math.floor(Date.now() / 1000) - token.auth_time;
  if (!Number.isSafeInteger(token.auth_time) || age < 0 || age > RECENT_AUTH_SECONDS) {
    throw new HttpsError(
      'failed-precondition',
      'Войдите снова, чтобы подтвердить действие. Sign in again to confirm this action.',
      { code: 'ADMIN_RECENT_AUTH_REQUIRED' }
    );
  }
}

export function createRevokeOwnAdministratorSessionsHandler(
  firestore: Firestore,
  auth: Pick<ReturnType<typeof getAuth>, 'getUser' | 'revokeRefreshTokens'> = getAuth()
) {
  return async (request: CallableRequest<{ expectedUid?: unknown }>): Promise<{ revoked: true }> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication is required.');
    const { uid, token } = request.auth;
    if (request.data?.expectedUid !== uid) {
      throw new HttpsError('failed-precondition', 'The authenticated account has changed.');
    }
    await requireLiveAdministrator(firestore, uid, token);
    await requireCurrentAdministratorSession(token, auth);
    requireRecentAdministratorAuthentication(token);

    const audit = {
      correlationId: randomUUID(),
      accountReference: createHash('sha256').update(uid).digest('hex'),
    };
    info('Administrator session revocation', { ...audit, result: 'requested' });
    try {
      // Block the current session in Rules before revoking refresh tokens. If
      // Auth fails, the marker still blocks old authentication times.
      const account = firestore.collection('users').doc(uid);
      const cutoff = await firestore.runTransaction(async (tx) => {
        const profile = (await tx.get(account)).data();
        requireActiveAccount(uid, profile);
        if (profile?.role !== 'admin' || !documentMatchesReadScope(LIVE_CANONICAL_READ_SCOPE, profile)) {
          throw new HttpsError('permission-denied', 'This action is not permitted.');
        }
        requireAdministratorAccountSessionPolicy(profile, token);
        const seconds = Math.floor(Date.now() / 1000);
        tx.update(account, { adminSessionsRevokedThrough: seconds });
        return seconds;
      });
      await auth.revokeRefreshTokens(uid);
      const completedAt = Math.floor(Date.now() / 1000);
      if (completedAt > cutoff) {
        // Auth may cross a second boundary after the first write. Keep the
        // cutoff monotonic if another authorized revocation ran in parallel.
        await firestore.runTransaction(async (tx) => {
          const snapshot = await tx.get(account);
          const previous = snapshot.data()?.adminSessionsRevokedThrough;
          if (typeof previous === 'number' && previous < completedAt) {
            tx.update(account, { adminSessionsRevokedThrough: completedAt });
          }
        });
      }
    } catch {
      info('Administrator session revocation', { ...audit, result: 'unconfirmed' });
      throw new HttpsError('unavailable', 'Session revocation could not be confirmed.');
    }
    info('Administrator session revocation', { ...audit, result: 'revoked' });
    return { revoked: true };
  };
}
