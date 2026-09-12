import type { DocumentSnapshot, Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  CorrelationIdSchema,
  PaymentIdSchema,
  canonicalDeterministicHash,
  financialReconciliationMismatchIdentity,
  isPaymentFullyFundedForService,
  type Payment,
} from '@ski-academy/shared-domain';
import { plannedAdminIssuePath } from '../adminIssues/adminIssueOperations';
import { parseAdminIssue } from '../adminIssues/adminIssueStore';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import {
  reconcileGuestConfirmationLifecycleMismatchAfterCommand,
  type GuestConfirmationLifecycleMismatchReconciliationOutcome,
} from '../finance/financeCorrectionCommands';
import { parsePayment } from '../finance/financeStore';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const RECONCILIATION_CONCURRENCY = 20;
const LOOKUP_CHUNK_SIZE = 100;

export const GUEST_CONFIRMATION_RECONCILIATION_SWEEP_PAGE_SIZE = 25;
export const GUEST_CONFIRMATION_RECONCILIATION_SWEEP_MAX_CANDIDATES = 100;
/**
 * Discovery safety bound: maximum guest subject documents inspected per run.
 * Separate from maxCandidates, which limits actual reconciliation work.
 *
 * Default Cloud Functions scheduled timeout is 60s. Sequential pages of 25
 * with batched Payment + AdminIssue getAll stay comfortably inside that
 * budget at 2_000 subject docs (~80 pages). Already-open issues are skipped
 * cheaply, so this bound is a timeout valve, not the work cap.
 */
export const GUEST_CONFIRMATION_RECONCILIATION_SWEEP_MAX_SCANNED_SUBJECTS = 2_000;

export const GUEST_CONFIRMATION_RECONCILIATION_BOOKING_STATUSES = [
  'pending',
  'cancelled',
] as const;

export const GUEST_CONFIRMATION_RECONCILIATION_ENROLLMENT_STATUSES = [
  'pending',
  'cancelled',
  'withdrawn',
] as const;

export interface GuestConfirmationReconciliationSweepCursor {
  readonly updatedAtSeconds: number;
  readonly updatedAtNanoseconds: number;
  readonly id: string;
}

export interface GuestConfirmationReconciliationSweepOptions {
  readonly pageSize?: number;
  readonly maxCandidates?: number;
  readonly maxScannedSubjects?: number;
}

export interface GuestConfirmationReconciliationSweepResult {
  readonly scannedPayments: number;
  readonly scannedCandidates: number;
  readonly fullyFundedCandidates: number;
  readonly alreadyOpenSkipped: number;
  readonly workCandidatesSelected: number;
  readonly reconciled: number;
  readonly skipped: number;
  readonly pages: number;
  readonly truncated: boolean;
  readonly subjectDocsRead: number;
  readonly paymentLookupReads: number;
  readonly issueLookupReads: number;
  readonly outcomes: readonly GuestConfirmationLifecycleMismatchReconciliationOutcome[];
}

interface SubjectStream {
  readonly collectionName: 'bookings' | 'course_enrollments';
  readonly idField: 'bookingId' | 'enrollmentId';
  readonly statuses: readonly string[];
}

const SUBJECT_STREAMS: readonly SubjectStream[] = [
  {
    collectionName: 'bookings',
    idField: 'bookingId',
    statuses: GUEST_CONFIRMATION_RECONCILIATION_BOOKING_STATUSES,
  },
  {
    collectionName: 'course_enrollments',
    idField: 'enrollmentId',
    statuses: GUEST_CONFIRMATION_RECONCILIATION_ENROLLMENT_STATUSES,
  },
];

function readSubjectCursor(
  snapshot: QueryDocumentSnapshot,
  idField: SubjectStream['idField']
): GuestConfirmationReconciliationSweepCursor {
  const updatedAtSeconds = snapshot.get('updatedAt.seconds');
  const updatedAtNanoseconds = snapshot.get('updatedAt.nanoseconds');
  const storedId = snapshot.get(idField);
  return {
    updatedAtSeconds: typeof updatedAtSeconds === 'number' ? updatedAtSeconds : 0,
    updatedAtNanoseconds: typeof updatedAtNanoseconds === 'number' ? updatedAtNanoseconds : 0,
    id: typeof storedId === 'string' && storedId.length > 0 ? storedId : snapshot.id,
  };
}

function paymentIdFromSubjectSnapshot(snapshot: QueryDocumentSnapshot): Payment['paymentId'] | undefined {
  const parsed = PaymentIdSchema.safeParse(snapshot.get('paymentId'));
  return parsed.success ? parsed.data : undefined;
}

export interface FullyFundedSweepPayment {
  readonly paymentId: Payment['paymentId'];
  readonly revision: Payment['revision'];
  readonly subjectType: Payment['subjectType'];
  readonly subjectId: Payment['subjectId'];
}

interface DiscoveryState {
  readonly selected: Map<Payment['paymentId'], FullyFundedSweepPayment>;
  readonly alreadyOpenPaymentIds: Set<Payment['paymentId']>;
  readonly seenFundedPaymentIds: Set<Payment['paymentId']>;
  alreadyOpenSkipped: number;
  pages: number;
  subjectDocsRead: number;
  paymentLookupReads: number;
  issueLookupReads: number;
}

function guestConfirmationLifecycleIssuePath(payment: FullyFundedSweepPayment): string {
  return plannedAdminIssuePath(
    financialReconciliationMismatchIdentity({
      subjectKind: payment.subjectType,
      subjectId: payment.subjectId,
      reconciliationScope: 'guest_confirmation_lifecycle',
    })
  );
}

function isCurrentlyOpenGuestConfirmationIssue(snapshot: DocumentSnapshot): boolean {
  if (!snapshot.exists) return false;
  const parsed = parseAdminIssue(snapshot.data() as Record<string, unknown> | undefined);
  return parsed?.lifecycle.status === 'open';
}

async function lookupFullyFundedPayments(
  firestore: Firestore,
  paymentIds: readonly Payment['paymentId'][]
): Promise<{
  readonly payments: readonly FullyFundedSweepPayment[];
  readonly paymentLookupReads: number;
}> {
  if (paymentIds.length === 0) {
    return { payments: [], paymentLookupReads: 0 };
  }

  const payments: FullyFundedSweepPayment[] = [];
  let paymentLookupReads = 0;
  for (let offset = 0; offset < paymentIds.length; offset += LOOKUP_CHUNK_SIZE) {
    const chunk = paymentIds.slice(offset, offset + LOOKUP_CHUNK_SIZE);
    const snapshots = await firestore.getAll(
      ...chunk.map((paymentId) => firestore.collection('payments').doc(paymentId))
    );
    paymentLookupReads += snapshots.length;
    for (const snapshot of snapshots) {
      const payment = parsePayment(snapshot.exists ? snapshot.data() : undefined);
      if (payment && isPaymentFullyFundedForService(payment)) {
        payments.push({
          paymentId: payment.paymentId,
          revision: payment.revision,
          subjectType: payment.subjectType,
          subjectId: payment.subjectId,
        });
      }
    }
  }
  return { payments, paymentLookupReads };
}

async function classifyOpenGuestConfirmationIssues(
  firestore: Firestore,
  payments: readonly FullyFundedSweepPayment[]
): Promise<{
  readonly work: readonly FullyFundedSweepPayment[];
  readonly alreadyOpen: readonly FullyFundedSweepPayment[];
  readonly issueLookupReads: number;
}> {
  if (payments.length === 0) {
    return { work: [], alreadyOpen: [], issueLookupReads: 0 };
  }

  const work: FullyFundedSweepPayment[] = [];
  const alreadyOpen: FullyFundedSweepPayment[] = [];
  let issueLookupReads = 0;
  for (let offset = 0; offset < payments.length; offset += LOOKUP_CHUNK_SIZE) {
    const chunk = payments.slice(offset, offset + LOOKUP_CHUNK_SIZE);
    const snapshots = await firestore.getAll(
      ...chunk.map((payment) => firestore.doc(guestConfirmationLifecycleIssuePath(payment)))
    );
    issueLookupReads += snapshots.length;
    for (const [index, payment] of chunk.entries()) {
      if (isCurrentlyOpenGuestConfirmationIssue(snapshots[index]!)) {
        alreadyOpen.push(payment);
      } else {
        work.push(payment);
      }
    }
  }
  return { work, alreadyOpen, issueLookupReads };
}

async function drainGuestSubjectStream(
  firestore: Firestore,
  stream: SubjectStream,
  options: {
    readonly pageSize: number;
    readonly maxCandidates: number;
    readonly maxScannedSubjects: number;
    readonly state: DiscoveryState;
  }
): Promise<{ readonly truncated: boolean }> {
  const { state } = options;
  let truncated = false;

  for (const status of stream.statuses) {
    let cursor: GuestConfirmationReconciliationSweepCursor | undefined;
    while (
      state.selected.size < options.maxCandidates &&
      state.subjectDocsRead < options.maxScannedSubjects
    ) {
      let query: Query = firestore
        .collection(stream.collectionName)
        .where('attribution.bookingOrigin', '==', 'guest')
        .where('lifecycle.status', '==', status)
        .orderBy('updatedAt.seconds', 'desc')
        .orderBy('updatedAt.nanoseconds', 'desc')
        .orderBy(stream.idField, 'asc')
        .limit(options.pageSize);
      if (cursor) {
        query = query.startAfter(cursor.updatedAtSeconds, cursor.updatedAtNanoseconds, cursor.id);
      }

      const snapshot = await query.get();
      state.pages += 1;
      state.subjectDocsRead += snapshot.size;
      if (snapshot.empty) {
        break;
      }

      const unseenPaymentIds: Payment['paymentId'][] = [];
      const seenThisPage = new Set<Payment['paymentId']>();
      for (const document of snapshot.docs) {
        cursor = readSubjectCursor(document, stream.idField);
        const paymentId = paymentIdFromSubjectSnapshot(document);
        if (
          !paymentId ||
          state.selected.has(paymentId) ||
          state.alreadyOpenPaymentIds.has(paymentId) ||
          seenThisPage.has(paymentId)
        ) {
          continue;
        }
        seenThisPage.add(paymentId);
        unseenPaymentIds.push(paymentId);
      }

      const lookup = await lookupFullyFundedPayments(firestore, unseenPaymentIds);
      state.paymentLookupReads += lookup.paymentLookupReads;
      const unclassifiedFunded: FullyFundedSweepPayment[] = [];
      for (const payment of lookup.payments) {
        if (state.seenFundedPaymentIds.has(payment.paymentId)) continue;
        state.seenFundedPaymentIds.add(payment.paymentId);
        unclassifiedFunded.push(payment);
      }

      const classified = await classifyOpenGuestConfirmationIssues(firestore, unclassifiedFunded);
      state.issueLookupReads += classified.issueLookupReads;
      for (const payment of classified.alreadyOpen) {
        state.alreadyOpenPaymentIds.add(payment.paymentId);
        state.alreadyOpenSkipped += 1;
      }
      for (const payment of classified.work) {
        if (state.selected.size >= options.maxCandidates) {
          truncated = true;
          break;
        }
        state.selected.set(payment.paymentId, payment);
      }

      if (snapshot.size < options.pageSize) {
        break;
      }
      if (state.selected.size >= options.maxCandidates) {
        truncated = true;
        break;
      }
      if (state.subjectDocsRead >= options.maxScannedSubjects) {
        truncated = true;
        break;
      }
    }
    if (truncated) {
      break;
    }
  }

  return { truncated };
}

export async function discoverFullyFundedGuestConfirmationSweepPaymentIds(
  firestore: Firestore,
  options: GuestConfirmationReconciliationSweepOptions = {}
): Promise<{
  readonly payments: readonly FullyFundedSweepPayment[];
  readonly fullyFundedCandidates: number;
  readonly alreadyOpenSkipped: number;
  readonly workCandidatesSelected: number;
  readonly pages: number;
  readonly subjectDocsRead: number;
  readonly paymentLookupReads: number;
  readonly issueLookupReads: number;
  readonly truncated: boolean;
}> {
  const pageSize = Math.max(
    1,
    options.pageSize ?? GUEST_CONFIRMATION_RECONCILIATION_SWEEP_PAGE_SIZE
  );
  const maxCandidates = Math.max(
    1,
    options.maxCandidates ?? GUEST_CONFIRMATION_RECONCILIATION_SWEEP_MAX_CANDIDATES
  );
  const maxScannedSubjects = Math.max(
    1,
    options.maxScannedSubjects ?? GUEST_CONFIRMATION_RECONCILIATION_SWEEP_MAX_SCANNED_SUBJECTS
  );
  const state: DiscoveryState = {
    selected: new Map<Payment['paymentId'], FullyFundedSweepPayment>(),
    alreadyOpenPaymentIds: new Set<Payment['paymentId']>(),
    seenFundedPaymentIds: new Set<Payment['paymentId']>(),
    alreadyOpenSkipped: 0,
    pages: 0,
    subjectDocsRead: 0,
    paymentLookupReads: 0,
    issueLookupReads: 0,
  };
  let truncated = false;

  for (const stream of SUBJECT_STREAMS) {
    if (state.selected.size >= maxCandidates || state.subjectDocsRead >= maxScannedSubjects) {
      truncated = true;
      break;
    }
    const drained = await drainGuestSubjectStream(firestore, stream, {
      pageSize,
      maxCandidates,
      maxScannedSubjects,
      state,
    });
    if (drained.truncated) {
      truncated = true;
      break;
    }
  }

  return {
    payments: [...state.selected.values()],
    fullyFundedCandidates: state.seenFundedPaymentIds.size,
    alreadyOpenSkipped: state.alreadyOpenSkipped,
    workCandidatesSelected: state.selected.size,
    pages: state.pages,
    subjectDocsRead: state.subjectDocsRead,
    paymentLookupReads: state.paymentLookupReads,
    issueLookupReads: state.issueLookupReads,
    truncated,
  };
}

export async function sweepGuestConfirmationLifecycleMismatches(
  firestore: Firestore,
  now = new Date(),
  options: GuestConfirmationReconciliationSweepOptions = {}
): Promise<GuestConfirmationReconciliationSweepResult> {
  const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(firestore, options);
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  const environment = { clock: createAuthoritativeCommandClock(now) };
  const outcomes: GuestConfirmationLifecycleMismatchReconciliationOutcome[] = [];

  for (let offset = 0; offset < discovered.payments.length; offset += RECONCILIATION_CONCURRENCY) {
    const batch = discovered.payments.slice(offset, offset + RECONCILIATION_CONCURRENCY);
    const batchOutcomes = await Promise.all(
      batch.map((payment) =>
        reconcileGuestConfirmationLifecycleMismatchAfterCommand({
          correlationId: CorrelationIdSchema.parse(
            canonicalDeterministicHash([
              'guest-confirmation-sweep:v1',
              payment.paymentId,
              String(payment.revision),
            ])
          ),
          paymentId: payment.paymentId,
          environment,
          executor,
        })
      )
    );
    outcomes.push(...batchOutcomes);
  }

  const reconciled = outcomes.filter((outcome) => outcome === 'reconciled').length;
  const skipped = outcomes.length - reconciled;

  return {
    scannedPayments: discovered.workCandidatesSelected,
    scannedCandidates: discovered.subjectDocsRead,
    fullyFundedCandidates: discovered.fullyFundedCandidates,
    alreadyOpenSkipped: discovered.alreadyOpenSkipped,
    workCandidatesSelected: discovered.workCandidatesSelected,
    reconciled,
    skipped,
    pages: discovered.pages,
    truncated: discovered.truncated,
    subjectDocsRead: discovered.subjectDocsRead,
    paymentLookupReads: discovered.paymentLookupReads,
    issueLookupReads: discovered.issueLookupReads,
    outcomes,
  };
}
