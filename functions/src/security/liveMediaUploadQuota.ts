import { createHash, randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const MIB = 1024 * 1024;

const policies = {
  avatar: { uploads: 20, bytes: 64 * MIB },
  catalog: { uploads: 60, bytes: 256 * MIB },
  chat: { uploads: 60, bytes: 512 * MIB },
};

type Charge = (uploads: number, bytes: number) => Promise<void>;
type Window = { used: number; resetAt: number };
type Quota = {
  uploads?: Window;
  bytes?: Window;
  lease?: { id: string; expiresAt: number };
};

function spend(window: Window | undefined, amount: number, duration: number, now: number): Window {
  const current = window && window.resetAt > now ? window : { used: 0, resetAt: now + duration };
  return { used: current.used + amount, resetAt: current.resetAt };
}

export function mediaDigest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** One short-lived document per authenticated LIVE account and upload category. */
export async function withLiveMediaUpload<T>(
  db: Firestore,
  uid: string,
  category: keyof typeof policies,
  work: (charge: Charge) => Promise<T>
): Promise<T> {
  const policy = policies[category];
  const ref = db.doc(`security_request_limits/media_upload_${category}_${uid}`);
  const id = randomUUID();
  await db.runTransaction(async (tx) => {
    const quota = (await tx.get(ref)).data() as Quota | undefined;
    const now = Date.now();
    if (quota?.lease && quota.lease.expiresAt > now) {
      throw new HttpsError('resource-exhausted', 'An upload is in progress.', { reason: 'busy' });
    }
    // Longer than either HTTP handler's timeout. A crashed invocation cannot hold it indefinitely.
    tx.set(
      ref,
      { lease: { id, expiresAt: now + 3 * MINUTE }, deleteAt: new Date(now + 24 * HOUR) },
      { merge: true }
    );
  });

  const charge: Charge = async (uploads, bytes) => {
    await db.runTransaction(async (tx) => {
      const quota = (await tx.get(ref)).data() as Quota | undefined;
      const now = Date.now();
      if (quota?.lease?.id !== id || quota.lease.expiresAt <= now) {
        throw new HttpsError('resource-exhausted', 'Upload lease expired.', { reason: 'busy' });
      }
      const windows: Pick<Quota, 'uploads' | 'bytes'> = {};
      if (uploads) windows.uploads = spend(quota.uploads, uploads, 10 * MINUTE, now);
      if (bytes) windows.bytes = spend(quota.bytes, bytes, HOUR, now);
      for (const reason of ['uploads', 'bytes'] as const) {
        const window = windows[reason];
        if (window && window.used > policy[reason]) {
          throw new HttpsError('resource-exhausted', 'Upload quota reached.', {
            reason,
            retryAt: window.resetAt,
          });
        }
      }
      // Charge work before Storage writes or media processing. Failures release the
      // lease but keep the spend, since those attempts can incur real work.
      tx.set(ref, windows, { merge: true });
    });
  };

  try {
    return await work(charge);
  } finally {
    await db
      .runTransaction(async (tx) => {
        const quota = (await tx.get(ref)).data() as Quota | undefined;
        if (quota?.lease?.id === id) tx.update(ref, { lease: null });
      })
      .catch(() => console.error('LIVE media upload lease release failed'));
  }
}
