import { createHmac } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { deriveGuestReservationActorKey } from '../canonical/commands/guestReservationAdmission';

/** One bounded document per principal/operation. No history queries or scheduler. */
export async function admitRequest(
  firestore: Firestore,
  key: string,
  limit: number,
  now = Date.now()
): Promise<void> {
  const ref = firestore.doc(`security_request_limits/${key}`);
  const allowed = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const sameWindow = typeof data?.resetAt === 'number' && data.resetAt > now;
    const count = sameWindow ? Number(data?.count) : 0;
    if (!Number.isFinite(count) || count >= limit) return false;
    const resetAt = sameWindow ? (data!.resetAt as number) : now + 60_000;
    tx.set(ref, { count: count + 1, resetAt, deleteAt: new Date(resetAt + 86_400_000) });
    return true;
  });
  if (!allowed)
    throw new HttpsError('resource-exhausted', 'Too many requests. Retry later.', {
      retryAfterSeconds: 60,
    });
}

export function requestPrincipalKey(request: CallableRequest<unknown>, secret: string): string {
  if (!secret) throw new HttpsError('failed-precondition', 'Request admission is unavailable.');
  if (request.auth?.uid) {
    return createHmac('sha256', secret).update(`account:${request.auth.uid}`).digest('hex');
  }
  const forwardedFor =
    request.rawRequest.headers['x-forwarded-for'] ??
    (process.env.FUNCTIONS_EMULATOR === 'true'
      // Windows emulator workers use named pipes, which have no remoteAddress.
      // Keep missing-address local traffic in one loopback quota; never use this
      // fallback for deployed ingress.
      ? (request.rawRequest.socket?.remoteAddress ?? '127.0.0.1')
      : undefined);
  const key = deriveGuestReservationActorKey(forwardedFor, secret);
  if (!key) throw new HttpsError('failed-precondition', 'Request admission is unavailable.');
  return key;
}
