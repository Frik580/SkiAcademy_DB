import { randomUUID } from 'node:crypto';
import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { PaymentIdSchema, canonicalDeterministicHash } from '@ski-academy/shared-domain';
import { z } from 'zod';
import {
  GUEST_CONFIRMATION_WORK_COLLECTION,
  WORK_LEASE_MS,
  syncGuestConfirmationWork,
  workReadMetrics,
  type SubjectCollection,
  type WorkReadMetrics,
} from './guestConfirmationWork';

export const GUEST_CONFIRMATION_CONTROL_PATH =
  'migration_control/guest_confirmation_reconciliation_v1';
export const RECOVERY_INTERVAL_MS = 6 * 60 * 60_000;
export const RECOVERY_PAGE_SIZE = 25;
export const GUEST_CONFIRMATION_QUARANTINE_COLLECTION =
  'guest_confirmation_reconciliation_quarantine';
function quarantinePath(subjectPath: string) {
  return `${GUEST_CONFIRMATION_QUARANTINE_COLLECTION}/${canonicalDeterministicHash([subjectPath])}`;
}
const Collections: readonly SubjectCollection[] = ['bookings', 'course_enrollments'];
const CursorSchema = z.object({ after: z.string().nullable(), done: z.boolean() });
const CursorsSchema = z.object({ bookings: CursorSchema, course_enrollments: CursorSchema });
const ControlSchema = z.object({
  version: z.literal(1),
  mode: z.enum(['legacy', 'queue']),
  epoch: z.string(),
  deploymentEvidence: z.string().min(1),
  backfillPass: z.number().int().min(0).max(2),
  backfill: CursorsSchema,
  recovery: CursorsSchema,
  nextRecoveryAtMs: z.number(),
  leaseToken: z.string().nullable(),
  leaseUntilMs: z.number(),
  readyEvidence: z.string().nullable(),
});
export type GuestConfirmationControl = z.infer<typeof ControlSchema>;
function freshCursors() {
  return {
    bookings: { after: null, done: false },
    course_enrollments: { after: null, done: false },
  };
}
export function parseGuestConfirmationControl(data: unknown): GuestConfirmationControl | undefined {
  const parsed = ControlSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}
export async function readGuestConfirmationControl(firestore: Firestore) {
  const snapshot = await firestore.doc(GUEST_CONFIRMATION_CONTROL_PATH).get();
  const control = parseGuestConfirmationControl(snapshot.data());
  if (snapshot.exists && !control)
    throw new Error('Invalid guest reconciliation control; cutover refused');
  return control;
}

/** Explicit migration only. A scheduler/event never creates or marks this document ready. */
export async function beginGuestConfirmationBackfill(
  firestore: Firestore,
  deploymentEvidence: string,
  options: { restart?: boolean; now?: Date } = {}
) {
  if (!deploymentEvidence.trim()) throw new Error('Deployed trigger/index evidence is required');
  const ref = firestore.doc(GUEST_CONFIRMATION_CONTROL_PATH);
  await firestore.runTransaction(async (tx) => {
    const previous = await tx.get(ref);
    if (previous.exists) {
      const current = parseGuestConfirmationControl(previous.data());
      if (!options.restart) throw new Error('Backfill already exists; resume its durable cursor');
      if (
        !current ||
        current.mode !== 'legacy' ||
        current.leaseUntilMs > (options.now ?? new Date()).getTime()
      ) {
        throw new Error('Restart requires legacy mode and no active recovery lease');
      }
    }
    tx.set(
      ref,
      ControlSchema.parse({
        version: 1,
        mode: 'legacy',
        epoch: randomUUID(),
        deploymentEvidence,
        backfillPass: 0,
        backfill: freshCursors(),
        recovery: freshCursors(),
        nextRecoveryAtMs: 0,
        leaseToken: null,
        leaseUntilMs: 0,
        readyEvidence: null,
      })
    );
  });
}

export interface RecoveryResult extends WorkReadMetrics {
  recoveryDocsRead: number;
  controlDocsRead: number;
  pages: number;
  truncated: boolean;
  applied: boolean;
  quarantineDocsRead: number;
  quarantined: number;
  failed: boolean;
  nextCursors?: Record<SubjectCollection, { after: string | null; done: boolean }>;
}

/** One bounded page per collection. ID ordering is stable under updatedAt/lifecycle changes. */
export async function runGuestConfirmationRecoveryPage(
  firestore: Firestore,
  now = new Date(),
  options: {
    backfill?: boolean;
    dryRun?: boolean;
    pageSize?: number;
    startAfter?: Partial<Record<SubjectCollection, string>>;
  } = {}
): Promise<RecoveryResult> {
  const result: RecoveryResult = {
    ...workReadMetrics(),
    recoveryDocsRead: 0,
    controlDocsRead: 0,
    pages: 0,
    truncated: false,
    applied: false,
    quarantineDocsRead: 0,
    quarantined: 0,
    failed: false,
  };
  const pageSize = Math.min(
    RECOVERY_PAGE_SIZE,
    Math.max(1, Math.floor(options.pageSize ?? RECOVERY_PAGE_SIZE))
  );
  const ref = firestore.doc(GUEST_CONFIRMATION_CONTROL_PATH);
  const token = randomUUID();
  const control = await firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    result.controlDocsRead++;
    const current = parseGuestConfirmationControl(snapshot.data());
    if (!current) {
      if (snapshot.exists) throw new Error('Invalid guest reconciliation control');
      if (options.dryRun) return undefined;
      throw new Error('Explicit begin-backfill is required');
    }
    if (
      current.leaseUntilMs > now.getTime() ||
      (options.backfill
        ? current.backfillPass === 2
        : current.mode !== 'queue' || current.nextRecoveryAtMs > now.getTime())
    )
      return undefined;
    if (!options.dryRun)
      tx.update(ref, { leaseToken: token, leaseUntilMs: now.getTime() + WORK_LEASE_MS });
    return current;
  });
  if (!control && !options.dryRun) return result;
  const cursors = structuredClone(
    options.backfill ? (control?.backfill ?? freshCursors()) : (control?.recovery ?? freshCursors())
  );
  if (options.dryRun)
    for (const collection of Collections) {
      if (options.startAfter?.[collection])
        cursors[collection] = { after: options.startAfter[collection]!, done: false };
    }
  try {
    for (const collection of Collections) {
      if (cursors[collection].done) continue;
      let query = firestore
        .collection(collection)
        .where('attribution.bookingOrigin', '==', 'guest')
        .orderBy(FieldPath.documentId())
        .limit(pageSize);
      const after = cursors[collection].after;
      if (after) query = query.startAfter(after);
      const page = await query.get();
      result.pages++;
      result.recoveryDocsRead += page.size;
      const quarantines =
        page.empty || options.dryRun
          ? undefined
          : await firestore
              .collection(GUEST_CONFIRMATION_QUARANTINE_COLLECTION)
              .where(
                FieldPath.documentId(),
                'in',
                page.docs.map((document) => quarantinePath(document.ref.path).split('/')[1])
              )
              .limit(pageSize)
              .get();
      result.quarantineDocsRead += quarantines?.size ?? 0;
      const quarantineIds = new Set(quarantines?.docs.map((document) => document.id));
      for (const document of page.docs) {
        const paymentId = PaymentIdSchema.safeParse(document.get('paymentId'));
        // Preserve a durable blocker, but let other ranges and the second stream progress.
        if (!paymentId.success) {
          result.quarantined++;
          if (!options.dryRun)
            await firestore.doc(quarantinePath(document.ref.path)).set({
              subjectPath: document.ref.path,
              reason: 'invalid_payment_id',
              observedAtMs: now.getTime(),
            });
          continue;
        }
        if (!options.dryRun)
          await syncGuestConfirmationWork(
            firestore,
            {
              paymentId: paymentId.data,
              subjectPath: document.ref.path,
              recovery: true,
              now,
            },
            result
          );
        if (quarantineIds.has(quarantinePath(document.ref.path).split('/')[1])) {
          await firestore.runTransaction(async (tx) => {
            const current = await tx.get(document.ref);
            result.subjectDocsRead++;
            if (current.get('paymentId') === paymentId.data)
              tx.delete(firestore.doc(quarantinePath(document.ref.path)));
          });
        }
      }
      cursors[collection] = { after: page.docs.at(-1)?.id ?? after, done: page.size < pageSize };
      result.truncated ||= page.size === pageSize;
    }
    result.nextCursors = cursors;
    if (options.dryRun) return result;
    const applied = await firestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      result.controlDocsRead++;
      const current = parseGuestConfirmationControl(snapshot.data());
      if (!current || current.epoch !== control!.epoch || current.leaseToken !== token)
        return false;
      const completed = Collections.every((collection) => cursors[collection].done);
      const patch = options.backfill
        ? {
            backfill: completed ? freshCursors() : cursors,
            backfillPass: completed ? current.backfillPass + 1 : current.backfillPass,
          }
        : {
            recovery: completed ? freshCursors() : cursors,
            nextRecoveryAtMs: now.getTime() + RECOVERY_INTERVAL_MS,
          };
      tx.update(ref, { ...patch, leaseToken: null, leaseUntilMs: 0 });
      return true;
    });
    result.applied = applied;
    return result;
  } catch (error) {
    // A failed page retains the previous cursor/lease. Runtime recovery must not stop due work.
    if (options.backfill || options.dryRun) throw error;
    result.failed = true;
    return result;
  }
}

/** Explicit bounded repair of metadata after the owner has fixed or removed the corrupt subject. */
export async function repairGuestConfirmationQuarantinePage(
  firestore: Firestore,
  now = new Date(),
  startAfter?: string
) {
  let query = firestore
    .collection(GUEST_CONFIRMATION_QUARANTINE_COLLECTION)
    .orderBy(FieldPath.documentId())
    .limit(RECOVERY_PAGE_SIZE);
  if (startAfter) query = query.startAfter(startAfter);
  const page = await query.get();
  let cleared = 0;
  for (const marker of page.docs) {
    const path = marker.get('subjectPath');
    if (typeof path !== 'string' || !/^(bookings|course_enrollments)\/[^/]+$/.test(path)) continue;
    const subject = await firestore.doc(path).get();
    const paymentId = PaymentIdSchema.safeParse(subject.get('paymentId'));
    if (
      subject.exists &&
      subject.get('attribution.bookingOrigin') === 'guest' &&
      !paymentId.success
    )
      continue;
    if (paymentId.success)
      await syncGuestConfirmationWork(firestore, {
        paymentId: paymentId.data,
        subjectPath: path,
        now,
      });
    const deleted = await firestore.runTransaction(async (tx) => {
      const current = await tx.get(subject.ref);
      if (
        !current.exists ||
        current.get('attribution.bookingOrigin') !== 'guest' ||
        (paymentId.success && current.get('paymentId') === paymentId.data)
      ) {
        tx.delete(marker.ref);
        return true;
      }
      return false;
    });
    if (deleted) cleared++;
  }
  return {
    scanned: page.size,
    cleared,
    truncated: page.size === RECOVERY_PAGE_SIZE,
    nextCursor: page.docs.at(-1)?.id ?? startAfter ?? null,
  };
}

/** Completion of two transfers is machine checked; deployment evidence needs operator verification. */
export async function cutoverGuestConfirmationQueue(
  firestore: Firestore,
  epoch: string,
  readyEvidence: string
) {
  if (!readyEvidence.trim())
    throw new Error('Independent deployment/index/trigger validation evidence required');
  const ref = firestore.doc(GUEST_CONFIRMATION_CONTROL_PATH);
  await firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const control = parseGuestConfirmationControl(snapshot.data());
    const blocked = await tx.get(
      firestore
        .collection(GUEST_CONFIRMATION_WORK_COLLECTION)
        .where('status', '==', 'blocked')
        .limit(1)
    );
    const quarantine = await tx.get(
      firestore.collection(GUEST_CONFIRMATION_QUARANTINE_COLLECTION).limit(1)
    );
    if (
      !control ||
      control.epoch !== epoch ||
      control.backfillPass !== 2 ||
      control.leaseToken ||
      !blocked.empty ||
      !quarantine.empty
    ) {
      throw new Error('Queue is not ready: transfer/lease/blocked work gate failed');
    }
    tx.update(ref, { mode: 'queue', readyEvidence });
  });
}
export async function rollbackGuestConfirmationQueue(firestore: Firestore) {
  // Retain work, cursors, epoch and evidence. No financial documents are modified.
  await firestore.doc(GUEST_CONFIRMATION_CONTROL_PATH).update({ mode: 'legacy' });
}
