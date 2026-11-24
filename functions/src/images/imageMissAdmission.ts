import type { Firestore } from 'firebase-admin/firestore';

const QUOTA = 120;
const WINDOW_MS = 60_000;
const LEASE_MS = 65_000;
const COUNTER_PATH = 'security_request_limits/image_global_misses';
let quotaFullUntil = 0;

export type ImageMissAdmission = { status: 'admitted' | 'in-flight' | 'quota-full'; until: number };

/** A lease and the existing global charge use the same document and transaction. */
export async function admitImageCacheMiss(
  db: Firestore,
  cacheKey: string
): Promise<ImageMissAdmission> {
  if (quotaFullUntil > Date.now()) return { status: 'quota-full', until: quotaFullUntil };

  const ref = db.doc(COUNTER_PATH);
  const admission = await db.runTransaction<ImageMissAdmission>(async (tx) => {
    const data = (await tx.get(ref)).data();
    const now = Date.now();
    const sameWindow = typeof data?.resetAt === 'number' && data.resetAt > now;
    const count = sameWindow ? Number(data?.count) : 0;
    const resetAt = sameWindow ? (data!.resetAt as number) : now + WINDOW_MS;
    if (!Number.isFinite(count) || count >= QUOTA) {
      return { status: 'quota-full', until: resetAt };
    }

    const leases = Object.fromEntries(
      Object.entries(data?.leases ?? {}).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > now
      )
    );
    if (leases[cacheKey] > now) return { status: 'in-flight', until: leases[cacheKey] };

    const until = now + LEASE_MS;
    leases[cacheKey] = until;
    tx.set(ref, { count: count + 1, resetAt, leases, deleteAt: new Date(until + 86_400_000) });
    return { status: 'admitted', until };
  });
  if (admission.status === 'quota-full') quotaFullUntil = Math.max(quotaFullUntil, admission.until);
  return admission;
}
