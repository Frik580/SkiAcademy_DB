import { randomUUID } from 'node:crypto';
import { type Firestore, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  CorrelationIdSchema,
  PaymentIdSchema,
  canonicalDeterministicHash,
  isPaymentFullyFundedForService,
  LIVE_CANONICAL_EXECUTION_SCOPE,
  assertSameCanonicalScope,
  type Booking,
  type CourseEnrollment,
} from '@ski-academy/shared-domain';
import { parseBooking } from '../bookings/bookingStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { parseCourse } from '../courses/courseStore';
import { parsePayment } from '../finance/financeStore';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { reconcileGuestConfirmationLifecycleMismatchAfterCommand } from '../finance/financeCorrectionCommands';
import {
  createFirestoreCanonicalTransactionExecutor,
  type CanonicalTransactionExecutor,
} from '../transactions/firestoreTransactionExecutor';

export const GUEST_CONFIRMATION_WORK_COLLECTION = 'guest_confirmation_reconciliation_work';
export const WORK_BATCH_LIMIT = 25;
export const WORK_LEASE_MS = 10 * 60_000;
export const WORK_BLOCKED_RETRY_MS = 24 * 60 * 60_000;

const WorkSchema = z.object({
  paymentId: PaymentIdSchema,
  subjectPath: z.string().regex(/^(bookings|course_enrollments)\/[^/]+$/),
  fingerprint: z.string(),
  generation: z.number().int().positive(),
  status: z.enum(['pending', 'complete', 'blocked']),
  nextAttemptAtMs: z.number().finite(),
  attempts: z.number().int().nonnegative(),
  leaseToken: z.string().nullable(),
  leaseUntilMs: z.number().finite(),
  updatedAtMs: z.number().finite(),
});
export type GuestConfirmationWork = z.infer<typeof WorkSchema>;
export type SubjectCollection = 'bookings' | 'course_enrollments';
export interface WorkReadMetrics {
  workDocsRead: number;
  subjectDocsRead: number;
  paymentLookupReads: number;
  courseLookupReads: number;
}
export function workReadMetrics(): WorkReadMetrics {
  return { workDocsRead: 0, subjectDocsRead: 0, paymentLookupReads: 0, courseLookupReads: 0 };
}
export function parseGuestConfirmationWork(data: unknown): GuestConfirmationWork | undefined {
  const parsed = WorkSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}
export function workRetryDelayMs(attempts: number): number {
  return attempts >= 8
    ? WORK_BLOCKED_RETRY_MS
    : Math.min(6 * 60 * 60_000, 30_000 * 2 ** (attempts - 1));
}

type Subject = Booking | CourseEnrollment;
function isLive(data: Record<string, unknown> | undefined): boolean {
  return data?.dataScope === undefined || data.dataScope === 'live';
}
function milliseconds(
  value: { seconds: number; nanoseconds: number } | undefined
): number | undefined {
  return value ? value.seconds * 1_000 + Math.ceil(value.nanoseconds / 1_000_000) : undefined;
}

/** Reads CURRENT source documents in the caller's transaction, never an event's stale payload. */
async function readSource(
  firestore: Firestore,
  tx: Transaction,
  paymentId: string,
  subjectHint: string | undefined,
  metrics: WorkReadMetrics
) {
  const paymentSnapshot = await tx.get(firestore.doc(`payments/${paymentId}`));
  metrics.paymentLookupReads++;
  const paymentData = paymentSnapshot.data();
  const payment = parsePayment(paymentData);
  const subjectPath = payment
    ? `${payment.subjectType === 'booking' ? 'bookings' : 'course_enrollments'}/${payment.subjectId}`
    : subjectHint;
  if (!subjectPath) return undefined;
  const snapshot = await tx.get(firestore.doc(subjectPath));
  metrics.subjectDocsRead++;
  const subjectData = snapshot.data();
  if (!isLive(paymentData) || !isLive(subjectData)) return undefined;
  const subject: Subject | undefined = subjectPath.startsWith('bookings/')
    ? parseBooking(subjectData)
    : parseCourseEnrollment(subjectData);
  // Revisions are canonical change tokens; funding and time fields also cover recovery of malformed writes.
  let course: ReturnType<typeof parseCourse>;
  if (subject && 'enrollmentId' in subject && subject.lifecycle.status === 'pending') {
    const courseSnapshot = await tx.get(firestore.doc(`courses/${subject.courseId}`));
    metrics.courseLookupReads++;
    course = parseCourse(courseSnapshot.data());
  }
  const fingerprint = canonicalDeterministicHash([
    JSON.stringify({
      payment: payment
        ? [
            payment.paymentId,
            payment.subjectType,
            payment.subjectId,
            payment.revision,
            payment.eventRevision,
            payment.price,
            payment.paidAmount,
            payment.refundedAmount,
            payment.retainedAmount,
            payment.settledAmount,
            payment.writtenOffAmount,
            payment.outstandingAmount,
            payment.paymentStatus,
          ]
        : ['invalid', paymentSnapshot.updateTime?.toMillis()],
      subject: subject
        ? [
            subject.paymentId,
            subject.revision,
            subject.lifecycle,
            subject.attribution.bookingOrigin,
            'bookingId' in subject ? subject.occurrence.interval : subject.courseId,
          ]
        : ['invalid', snapshot.updateTime?.toMillis()],
      course: course ? [course.revision, course.lifecycle, course.startAt] : null,
    }),
  ]);
  const valid = Boolean(
    payment &&
    payment.paymentId === paymentId &&
    subject &&
    subject.paymentId === paymentId &&
    subjectPath.endsWith(`/${'bookingId' in subject ? subject.bookingId : subject.enrollmentId}`)
  );
  if (valid) {
    assertSameCanonicalScope(LIVE_CANONICAL_EXECUTION_SCOPE, payment!);
    assertSameCanonicalScope(LIVE_CANONICAL_EXECUTION_SCOPE, subject!);
    if (course) assertSameCanonicalScope(LIVE_CANONICAL_EXECUTION_SCOPE, course);
  }
  const eligible = Boolean(
    valid &&
    subject!.attribution.bookingOrigin === 'guest' &&
    ['pending', 'cancelled', 'withdrawn'].includes(subject!.lifecycle.status) &&
    isPaymentFullyFundedForService(payment!)
  );
  let futureCheckAtMs: number | undefined;
  if (eligible && subject?.lifecycle.status === 'pending') {
    const deadlines = [
      milliseconds(subject.lifecycle.reservationExpiresAt),
      milliseconds('bookingId' in subject ? subject.occurrence.interval.startsAt : course?.startAt),
    ].filter((value): value is number => value !== undefined);
    if (deadlines.length) futureCheckAtMs = Math.min(...deadlines);
  }
  return { fingerprint, subjectPath, valid, eligible, futureCheckAtMs };
}

/** Retains completed fingerprints, so duplicate/out-of-order events cannot resurrect finished work. */
export async function syncGuestConfirmationWork(
  firestore: Firestore,
  input: { paymentId: string; subjectPath?: string; recovery?: boolean; now?: Date },
  metrics: WorkReadMetrics = workReadMetrics()
): Promise<'changed' | 'unchanged' | 'ignored'> {
  const paymentId = PaymentIdSchema.parse(input.paymentId);
  const now = (input.now ?? new Date()).getTime();
  const ref = firestore.doc(`${GUEST_CONFIRMATION_WORK_COLLECTION}/${paymentId}`);
  return firestore.runTransaction(async (tx) => {
    const workSnapshot = await tx.get(ref);
    metrics.workDocsRead++;
    const previous = parseGuestConfirmationWork(workSnapshot.data());
    if (workSnapshot.exists && !previous) throw new Error('Invalid reconciliation work');
    const source = await readSource(
      firestore,
      tx,
      paymentId,
      input.subjectPath ?? previous?.subjectPath,
      metrics
    );
    if (!source) return 'ignored';
    if (
      previous?.fingerprint === source.fingerprint &&
      !(input.recovery && previous.status === 'complete' && source.eligible)
    )
      return 'unchanged';
    if (!previous && source.valid && !source.eligible) return 'ignored';
    const work: GuestConfirmationWork = {
      paymentId,
      subjectPath: source.subjectPath,
      fingerprint: source.fingerprint,
      generation: (previous?.generation ?? 0) + 1,
      status: !source.valid ? 'blocked' : source.eligible ? 'pending' : 'complete',
      nextAttemptAtMs: Math.max(now, previous?.leaseUntilMs ?? 0),
      attempts: 0,
      leaseToken: previous?.leaseToken ?? null,
      leaseUntilMs: previous?.leaseUntilMs ?? 0,
      updatedAtMs: now,
    };
    tx.set(ref, work);
    return 'changed';
  });
}

/** Event payloads are routing hints only. Canonical IDs cannot be taken from arbitrary paths. */
export async function syncGuestConfirmationWrite(
  firestore: Firestore,
  collection: SubjectCollection | 'payments',
  documentId: string,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  now = new Date()
): Promise<void> {
  if (
    collection !== 'payments' &&
    (before?.attribution as { bookingOrigin?: string } | undefined)?.bookingOrigin !== 'guest' &&
    (after?.attribution as { bookingOrigin?: string } | undefined)?.bookingOrigin !== 'guest'
  )
    return;
  const ids = collection === 'payments' ? [documentId] : [before?.paymentId, after?.paymentId];
  for (const id of new Set(ids)) {
    const parsed = PaymentIdSchema.safeParse(id);
    if (!parsed.success) continue;
    const hint = collection !== 'payments' ? `${collection}/${documentId}` : undefined;
    await syncGuestConfirmationWork(firestore, { paymentId: parsed.data, subjectPath: hint, now });
  }
}

export interface WorkBatchResult extends WorkReadMetrics {
  canonicalDocsRead: number;
  workCandidatesSelected: number;
  reconciled: number;
  skipped: number;
  retried: number;
  failed: number;
  pages: number;
  truncated: boolean;
}
export async function processGuestConfirmationWork(
  firestore: Firestore,
  now = new Date(),
  options: {
    limit?: number;
    reconcile?: typeof reconcileGuestConfirmationLifecycleMismatchAfterCommand;
  } = {}
): Promise<WorkBatchResult> {
  const limit = Math.min(
    WORK_BATCH_LIMIT,
    Math.max(1, Math.floor(options.limit ?? WORK_BATCH_LIMIT))
  );
  const result: WorkBatchResult = {
    ...workReadMetrics(),
    canonicalDocsRead: 0,
    workCandidatesSelected: 0,
    reconciled: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    pages: 1,
    truncated: false,
  };
  const snapshot = await firestore
    .collection(GUEST_CONFIRMATION_WORK_COLLECTION)
    .where('status', 'in', ['pending', 'blocked'])
    .where('nextAttemptAtMs', '<=', now.getTime())
    .orderBy('nextAttemptAtMs', 'asc')
    .limit(limit)
    .get();
  result.workDocsRead += snapshot.size;
  result.truncated = snapshot.size === limit;
  const baseExecutor = createFirestoreCanonicalTransactionExecutor(firestore);
  const executor: CanonicalTransactionExecutor = {
    runAtomic: (input) =>
      baseExecutor.runAtomic({
        ...input,
        run: (session) => {
          const tx = new Proxy(session.tx, {
            get(target, property) {
              if (property === 'get')
                return async (...args: Parameters<typeof target.get>) => {
                  result.canonicalDocsRead++;
                  return target.get(...args);
                };
              if (property === 'query')
                return async (...args: Parameters<typeof target.query>) => {
                  const documents = await target.query(...args);
                  result.canonicalDocsRead += documents.length;
                  return documents;
                };
              const value = Reflect.get(target, property);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
          return input.run(
            new Proxy(session, {
              get(target, property) {
                if (property === 'tx') return tx;
                const value = Reflect.get(target, property);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            })
          );
        },
      }),
  };
  for (const document of snapshot.docs) {
    const token = randomUUID();
    let work: GuestConfirmationWork | 'blocked' | undefined;
    try {
      work = await firestore.runTransaction(async (tx) => {
        const current = await tx.get(document.ref);
        result.workDocsRead++;
        const parsed = parseGuestConfirmationWork(current.data());
        if (!parsed) throw new Error('Invalid reconciliation work');
        if (
          parsed.status === 'complete' ||
          parsed.nextAttemptAtMs > now.getTime() ||
          parsed.leaseUntilMs > now.getTime()
        )
          return undefined;
        const source = await readSource(
          firestore,
          tx,
          parsed.paymentId,
          parsed.subjectPath,
          result
        );
        if (!source || (source.valid && !source.eligible)) {
          tx.update(document.ref, { status: 'complete', leaseToken: null, leaseUntilMs: 0 });
          return undefined;
        }
        if (!source.valid) {
          tx.update(document.ref, {
            status: 'blocked',
            attempts: parsed.attempts + 1,
            leaseToken: null,
            leaseUntilMs: 0,
            nextAttemptAtMs: now.getTime() + WORK_BLOCKED_RETRY_MS,
          });
          return 'blocked' as const;
        }
        const claimed =
          source.fingerprint === parsed.fingerprint
            ? parsed
            : {
                ...parsed,
                fingerprint: source.fingerprint,
                generation: parsed.generation + 1,
                attempts: 0,
              };
        tx.update(document.ref, {
          leaseToken: token,
          leaseUntilMs: now.getTime() + WORK_LEASE_MS,
          fingerprint: claimed.fingerprint,
          generation: claimed.generation,
          attempts: claimed.attempts,
          nextAttemptAtMs: now.getTime() + WORK_LEASE_MS,
        });
        return claimed;
      });
    } catch {
      // Isolate malformed work/scope or source failures, so one item cannot starve the batch.
      await firestore.runTransaction(async (tx) => {
        const current = await tx.get(document.ref);
        result.workDocsRead++;
        if (
          !current.exists ||
          current.get('status') === 'complete' ||
          Number(current.get('leaseUntilMs') ?? 0) > now.getTime()
        )
          return;
        tx.update(document.ref, {
          status: 'blocked',
          leaseToken: null,
          leaseUntilMs: 0,
          nextAttemptAtMs: now.getTime() + WORK_BLOCKED_RETRY_MS,
        });
      });
      result.failed++;
      result.retried++;
      continue;
    }
    if (!work || work === 'blocked') {
      if (work === 'blocked') {
        result.failed++;
        result.retried++;
      }
      result.skipped++;
      continue;
    }
    result.workCandidatesSelected++;
    let outcome:
      | Awaited<ReturnType<typeof reconcileGuestConfirmationLifecycleMismatchAfterCommand>>
      | undefined;
    try {
      outcome = await (
        options.reconcile ?? reconcileGuestConfirmationLifecycleMismatchAfterCommand
      )({
        correlationId: CorrelationIdSchema.parse(
          canonicalDeterministicHash([
            'guest-confirmation-work:v1',
            work.paymentId,
            work.fingerprint,
          ])
        ),
        paymentId: work.paymentId,
        environment: {
          clock: createAuthoritativeCommandClock(now),
          scope: LIVE_CANONICAL_EXECUTION_SCOPE,
        },
        executor,
      });
      if (outcome === 'reconciled') result.reconciled++;
      else result.skipped++;
    } catch {
      // Never log the exception: domain/provider details may contain personal or payment data.
      result.failed++;
    }
    const retried = await firestore.runTransaction(async (tx) => {
      const currentSnapshot = await tx.get(document.ref);
      result.workDocsRead++;
      const current = parseGuestConfirmationWork(currentSnapshot.data());
      if (!current || current.leaseToken !== token) return false;
      const source = await readSource(firestore, tx, work.paymentId, current.subjectPath, result);
      if (
        source &&
        (current.generation !== work.generation || source.fingerprint !== work.fingerprint)
      ) {
        tx.set(document.ref, {
          ...current,
          fingerprint: source.fingerprint,
          subjectPath: source.subjectPath,
          generation: current.generation + 1,
          status: 'pending',
          attempts: 0,
          leaseToken: null,
          leaseUntilMs: 0,
          nextAttemptAtMs: now.getTime(),
          updatedAtMs: now.getTime(),
        });
        return true;
      }
      const attempts = current.attempts + 1;
      const failed = outcome === undefined;
      const future =
        outcome === 'aligned' &&
        source?.eligible &&
        source.futureCheckAtMs !== undefined &&
        source.futureCheckAtMs > now.getTime()
          ? source.futureCheckAtMs
          : undefined;
      tx.set(document.ref, {
        ...current,
        status: failed
          ? attempts >= 8
            ? 'blocked'
            : 'pending'
          : future !== undefined
            ? 'pending'
            : 'complete',
        attempts: failed ? attempts : 0,
        leaseToken: null,
        leaseUntilMs: 0,
        nextAttemptAtMs: failed
          ? now.getTime() + workRetryDelayMs(attempts)
          : (future ?? now.getTime()),
        updatedAtMs: now.getTime(),
      });
      return failed;
    });
    if (retried) result.retried++;
  }
  return result;
}
