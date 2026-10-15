import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import {
  InstructorIdSchema,
  InstructorLessonRevenueSummarySchema,
  INSTRUCTOR_LESSON_REVENUE_STATE_PATH,
  KztMinorUnitsSchema,
  canonicalScopeFields,
  documentMatchesReadScope,
  instructorLessonRevenuePath,
  normalizeFirestoreDocument,
  parsePersistedCanonicalScope,
} from '@ski-academy/shared-domain';
import { parseBooking } from '../bookings/bookingStore';
import { parsePayment } from '../finance/financeStore';

const CONTRIBUTIONS = 'instructor_lesson_revenue_contributions';
export const REVENUE_BACKFILL_PAGE_SIZE = 100;

interface Contribution {
  readonly summaryPath: string;
  readonly retainedAmount: number;
  readonly unavailableCount: number;
  readonly bookingRevision: number;
  readonly paymentRevision: number;
}

const emptySummary = () => ({ retainedAmount: 0, unavailableCount: 0, revision: 0 });

/** PaymentSchema validates cash retention, obligation allocation, status and safe integers. */
export function completedLessonRevenueContribution(
  bookingId: string,
  rawBooking: Record<string, unknown> | undefined,
  rawPayment: Record<string, unknown> | undefined
): Contribution | undefined {
  if (!rawBooking) return undefined;
  const scope = parsePersistedCanonicalScope(rawBooking);
  const instructorId = InstructorIdSchema.parse(
    (rawBooking.occurrence as Record<string, unknown> | undefined)?.instructorId
  );
  const booking = parseBooking(rawBooking);
  const payment = parsePayment(rawPayment);
  const validPayment =
    booking &&
    payment &&
    payment.paymentId === booking.paymentId &&
    payment.subjectType === 'booking' &&
    payment.subjectId === bookingId &&
    documentMatchesReadScope(scope, payment);
  // Malformed attributable Booking data must hide the total, never invent zero.
  const unavailable =
    !booking ||
    booking.bookingId !== bookingId ||
    (booking.lifecycle.status === 'completed' && !validPayment);
  return {
    summaryPath: instructorLessonRevenuePath(scope, instructorId),
    retainedAmount:
      !unavailable && booking?.lifecycle.status === 'completed' && validPayment
        ? payment.retainedAmount
        : 0,
    unavailableCount: unavailable ? 1 : 0,
    bookingRevision: booking?.revision ?? 0,
    paymentRevision: payment?.revision ?? 0,
  };
}

/**
 * Re-read both authorities inside the transaction, never apply event payload deltas.
 * This handles duplicate/out-of-order delivery, Payment-only edits, reassignment,
 * lifecycle corrections and deletion with one contribution per Booking.
 */
export async function syncInstructorLessonRevenue(firestore: Firestore, bookingId: string) {
  return firestore.runTransaction(async (tx) => {
    const bookingRef = firestore.doc(`bookings/${bookingId}`);
    const contributionRef = firestore.doc(`${CONTRIBUTIONS}/${bookingId}`);
    const [bookingSnapshot, contributionSnapshot] = await tx.getAll(bookingRef, contributionRef);
    const rawBooking = normalizeFirestoreDocument(bookingSnapshot.data());
    const paymentId = rawBooking?.paymentId;
    const completed =
      (rawBooking?.lifecycle as Record<string, unknown> | undefined)?.status === 'completed';
    const paymentSnapshot =
      completed && typeof paymentId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(paymentId)
        ? await tx.get(firestore.doc(`payments/${paymentId}`))
        : undefined;
    const previous = contributionSnapshot.data() as Contribution | undefined;
    let next: Contribution | undefined;
    let blocked = false;
    try {
      next = completedLessonRevenueContribution(bookingId, rawBooking, paymentSnapshot?.data());
    } catch {
      // Hide the previous owner's sum without affecting another scope. A new,
      // unattributable record requires source repair; never guess its owner.
      if (!previous) throw new Error(`Revenue attribution unavailable for Booking ${bookingId}.`);
      blocked = true;
      next = previous ? { ...previous, retainedAmount: 0, unavailableCount: 1 } : undefined;
    }
    const same =
      previous === undefined
        ? next === undefined
        : next !== undefined &&
          (Object.keys(next) as (keyof Contribution)[]).every((key) => previous[key] === next[key]);
    if (same && !blocked) return { blocked: false };
    const paths = [
      ...new Set(
        [previous?.summaryPath, next?.summaryPath].filter(
          (path): path is string => path !== undefined
        )
      ),
    ].filter(
      () =>
        !previous ||
        !next ||
        previous.summaryPath !== next.summaryPath ||
        previous.retainedAmount !== next.retainedAmount ||
        previous.unavailableCount !== next.unavailableCount
    );
    const summaries = paths.length
      ? await tx.getAll(...paths.map((path) => firestore.doc(path)))
      : [];
    for (const [index, path] of paths.entries()) {
      const current = InstructorLessonRevenueSummarySchema.parse(
        summaries[index]?.data() ?? emptySummary()
      );
      const before = previous?.summaryPath === path ? previous : undefined;
      const after = next?.summaryPath === path ? next : undefined;
      const retainedAmount = KztMinorUnitsSchema.parse(
        current.retainedAmount - (before?.retainedAmount ?? 0) + (after?.retainedAmount ?? 0)
      );
      const unavailableCount =
        current.unavailableCount - (before?.unavailableCount ?? 0) + (after?.unavailableCount ?? 0);
      const updated = InstructorLessonRevenueSummarySchema.parse({
        retainedAmount,
        unavailableCount,
        revision: current.revision + 1,
      });
      tx.set(firestore.doc(path), updated);
      const scopePath = path.split('/').slice(0, 2).join('/');
      const source = next?.summaryPath === path ? rawBooking : undefined;
      // Parent documents provide a bounded, namespace-specific repair inventory.
      if (source && !blocked && previous?.summaryPath.split('/')[1] !== path.split('/')[1])
        tx.set(
          firestore.doc(scopePath),
          canonicalScopeFields(parsePersistedCanonicalScope(source))
        );
    }
    if (next) tx.set(contributionRef, { ...next });
    else if (previous) tx.delete(contributionRef);
    return { blocked };
  });
}

export async function syncInstructorLessonRevenuePayment(
  firestore: Firestore,
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
) {
  const ids = new Set(
    [before, after].flatMap((payment) =>
      payment?.subjectType === 'booking' &&
      typeof payment.subjectId === 'string' &&
      /^[A-Za-z0-9_-]{1,128}$/.test(payment.subjectId)
        ? [payment.subjectId]
        : []
    )
  );
  for (const id of ids) await syncInstructorLessonRevenue(firestore, id);
}

async function eachDocument(
  firestore: Firestore,
  path: string,
  visit: (id: string) => Promise<void>
) {
  let cursor: string | undefined;
  for (;;) {
    let query = firestore
      .collection(path)
      .orderBy(FieldPath.documentId())
      .limit(REVENUE_BACKFILL_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const document of page.docs) await visit(document.id);
    if (page.size < REVENUE_BACKFILL_PAGE_SIZE) return;
    cursor = page.docs.at(-1)!.id;
  }
}

/** Repair aggregate drift without overwriting concurrent trigger updates. */
async function repairSummary(firestore: Firestore, path: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = await firestore.doc(path).get();
    let retainedAmount = 0;
    let unavailableCount = 0;
    let cursor: string | undefined;
    for (;;) {
      let query = firestore
        .collection(CONTRIBUTIONS)
        .where('summaryPath', '==', path)
        .orderBy(FieldPath.documentId())
        .limit(REVENUE_BACKFILL_PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      for (const document of page.docs) {
        const row = document.data() as Contribution;
        retainedAmount = KztMinorUnitsSchema.parse(retainedAmount + row.retainedAmount);
        unavailableCount += row.unavailableCount;
      }
      if (page.size < REVENUE_BACKFILL_PAGE_SIZE) break;
      cursor = page.docs.at(-1)!.id;
    }
    const repaired = await firestore.runTransaction(async (tx) => {
      const current = await tx.get(firestore.doc(path));
      if (
        current.exists !== before.exists ||
        (before.exists && !current.updateTime?.isEqual(before.updateTime!))
      )
        return false;
      tx.set(
        firestore.doc(path),
        InstructorLessonRevenueSummarySchema.parse({
          retainedAmount,
          unavailableCount,
          revision: (Number(current.data()?.revision) || 0) + 1,
        })
      );
      return true;
    });
    if (repaired) return;
  }
  throw new Error(`Revenue repair busy: ${path}. Retry the reconciliation.`);
}

/**
 * Operator-only full drain. Never called on product requests or a scheduler.
 * Deploy triggers first. Safe to rerun after interruption; no canonical writes.
 */
export async function reconcileInstructorLessonRevenue(firestore: Firestore) {
  const state = firestore.doc(INSTRUCTOR_LESSON_REVENUE_STATE_PATH);
  // A Firestore create lock prevents two operators from publishing readiness early.
  const lock = firestore.doc('instructor_lesson_revenue/reconciliation_lock');
  await lock.create({ startedAt: new Date().toISOString() });
  try {
    await state.set({ ready: false }, { merge: true });
    const repairAll = async () => {
      // Discover even a deleted summary from its contributions, one distinct path
      // at a time. No instructor-sized or history-sized in-memory accumulation.
      let lastPath: string | undefined;
      for (;;) {
        let query = firestore.collection(CONTRIBUTIONS).orderBy('summaryPath').limit(1);
        if (lastPath) query = query.startAfter(lastPath);
        const page = await query.get();
        if (page.empty) break;
        lastPath = page.docs[0]!.data().summaryPath as string;
        await repairSummary(firestore, lastPath);
      }
      await eachDocument(firestore, 'instructor_lesson_revenue', async (scopeKey) => {
        if (scopeKey === 'state' || scopeKey === 'reconciliation_lock') return;
        await eachDocument(
          firestore,
          `instructor_lesson_revenue/${scopeKey}/instructors`,
          async (id) =>
            repairSummary(firestore, `instructor_lesson_revenue/${scopeKey}/instructors/${id}`)
        );
      });
    };
    await repairAll();
    const sync = async (id: string) => {
      if ((await syncInstructorLessonRevenue(firestore, id)).blocked) {
        throw new Error(
          `Revenue attribution unavailable for Booking ${id}. Correct the source and rerun.`
        );
      }
    };
    await eachDocument(firestore, 'bookings', sync);
    // Includes deleted authorities and missed deletion triggers.
    await eachDocument(firestore, CONTRIBUTIONS, sync);
    await repairAll();
    await state.set({ ready: true });
  } finally {
    await lock.delete();
  }
}
