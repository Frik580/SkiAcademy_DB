import { createHmac, timingSafeEqual } from 'node:crypto';
import { FieldPath, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { requireActiveAccount } from './activeAccount';

const PAGE_SIZE = 200;
type Cursor = { seconds: number; nanoseconds: number; after: string };

// Administrative log access uses the same current Account authority as Rules.
async function requireAdministrator(
  firestore: Firestore,
  uid: string | undefined
): Promise<string> {
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
  const profile = (await firestore.collection('users').doc(uid).get()).data();
  requireActiveAccount(uid, profile);
  if (profile?.role !== 'admin' || (await firestore.doc(`test_actors/${uid}`).get()).exists) {
    throw new HttpsError('permission-denied', 'This action is not permitted.');
  }
  return uid;
}

function validId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    Buffer.byteLength(id) <= 1500 &&
    !id.includes('/') &&
    id !== '.' &&
    id !== '..'
  );
}

function encodeCursor(cursor: Cursor, uid: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify(cursor)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`error_logs:${uid}:${payload}`)
    .digest('hex');
  return `${payload}.${signature}`;
}

function decodeCursor(value: unknown, uid: string, secret: string): Cursor | undefined {
  if (value === undefined) return undefined;
  try {
    if (typeof value !== 'string' || value.length > 5000) throw new Error();
    const [payload, signature, extra] = value.split('.');
    const expected = encodeCursor(
      JSON.parse(Buffer.from(payload, 'base64url').toString()),
      uid,
      secret
    ).split('.')[1];
    if (
      extra ||
      !signature ||
      signature.length !== expected.length ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new Error();
    const cursor = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Cursor;
    if (
      !Number.isInteger(cursor.seconds) ||
      !Number.isInteger(cursor.nanoseconds) ||
      cursor.nanoseconds < 0 ||
      cursor.nanoseconds >= 1e9 ||
      (cursor.after !== '' && !validId(cursor.after))
    )
      throw new Error();
    return cursor;
  } catch {
    throw new HttpsError('invalid-argument', 'Invalid error log cleanup cursor.');
  }
}

export function createDeleteErrorLogHandler(firestore: Firestore) {
  return async (request: CallableRequest<{ id?: unknown }>) => {
    await requireAdministrator(firestore, request.auth?.uid);
    const id = request.data?.id;
    if (!validId(id)) throw new HttpsError('invalid-argument', 'Invalid error log ID.');
    return firestore.runTransaction(async (tx) => {
      const ref = firestore.collection('error_logs').doc(id);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new HttpsError('not-found', 'Error log no longer exists.');
      tx.delete(ref);
      return { deleted: true };
    });
  };
}

/** Each call commits one bounded page atomically. The signed cursor can be replayed
 * after a lost response; no persisted job or writes outside error_logs are needed.
 * Use Firestore createTime, not client/legacy timestamp fields, to retain new logs.
 */
export function createClearErrorLogsHandler(firestore: Firestore, secret: string) {
  return async (request: CallableRequest<{ cursor?: unknown }>) => {
    const accountId = await requireAdministrator(firestore, request.auth?.uid);
    if (!secret) throw new HttpsError('failed-precondition', 'Cleanup is unavailable.');
    const cursor = decodeCursor(request.data?.cursor, accountId, secret);
    if (!cursor) {
      // Starting never deletes: a lost initial response cannot silently advance
      // the cutoff on retry. No timestamp/deleteAt is required on old documents.
      const last = await firestore
        .collection('error_logs')
        .orderBy(FieldPath.documentId())
        .limit(1)
        .get();
      return {
        deleted: 0,
        done: last.empty,
        cursor: last.empty
          ? null
          : encodeCursor(
              {
                seconds: last.readTime.seconds,
                nanoseconds: last.readTime.nanoseconds,
                after: '',
              },
              accountId,
              secret
            ),
      };
    }
    return firestore.runTransaction(async (tx) => {
      let query = firestore
        .collection('error_logs')
        .orderBy(FieldPath.documentId())
        .limit(PAGE_SIZE);
      if (cursor.after) query = query.startAfter(cursor.after);
      const page = await tx.get(query);
      const cutoff = new Timestamp(cursor.seconds, cursor.nanoseconds);
      let deleted = 0;
      for (const document of page.docs) {
        if (
          document.createTime.seconds < cutoff.seconds ||
          (document.createTime.seconds === cutoff.seconds &&
            document.createTime.nanoseconds <= cutoff.nanoseconds)
        ) {
          tx.delete(document.ref);
          deleted++;
        }
      }
      const done = page.size < PAGE_SIZE;
      return {
        deleted,
        done,
        cursor: done
          ? null
          : encodeCursor(
              {
                seconds: cutoff.seconds,
                nanoseconds: cutoff.nanoseconds,
                after: page.docs[page.size - 1].id,
              },
              accountId,
              secret
            ),
      };
    });
  };
}
