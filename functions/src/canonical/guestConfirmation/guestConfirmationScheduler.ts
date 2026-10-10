import type { Firestore } from 'firebase-admin/firestore';
import { sweepGuestConfirmationLifecycleMismatches } from './guestConfirmationReconciliationSweep';
import { processGuestConfirmationWork, workReadMetrics } from './guestConfirmationWork';
import {
  readGuestConfirmationControl,
  runGuestConfirmationRecoveryPage,
} from './guestConfirmationRecovery';

export async function runScheduledGuestConfirmationReconciliation(
  firestore: Firestore,
  now = new Date()
) {
  const started = Date.now();
  const control = await readGuestConfirmationControl(firestore);
  // Missing/unproven readiness preserves the original financial safety net.
  if (control?.mode !== 'queue' || control.backfillPass !== 2 || !control.readyEvidence) {
    const legacy = await sweepGuestConfirmationLifecycleMismatches(firestore, now);
    return {
      scannedCandidates: legacy.scannedCandidates,
      fullyFundedCandidates: legacy.fullyFundedCandidates,
      alreadyOpenSkipped: legacy.alreadyOpenSkipped,
      workCandidatesSelected: legacy.workCandidatesSelected,
      reconciled: legacy.reconciled,
      skipped: legacy.skipped,
      pages: legacy.pages,
      truncated: legacy.truncated,
      subjectDocsRead: legacy.subjectDocsRead,
      paymentLookupReads: legacy.paymentLookupReads,
      issueLookupReads: legacy.issueLookupReads,
      candidateSource: 'legacy_sweep',
      workDocsRead: 0,
      recoveryDocsRead: 0,
      controlDocsRead: 1,
      retried: 0,
      failed: 0,
      durationMs: Date.now() - started,
      readMetricsScope: 'discovery_only',
    };
  }
  const recovery =
    control.nextRecoveryAtMs <= now.getTime()
      ? await runGuestConfirmationRecoveryPage(firestore, now)
      : {
          ...workReadMetrics(),
          recoveryDocsRead: 0,
          controlDocsRead: 0,
          pages: 0,
          truncated: false,
          quarantineDocsRead: 0,
          quarantined: 0,
          failed: false,
        };
  const work = await processGuestConfirmationWork(firestore, now);
  return {
    candidateSource: recovery.pages ? 'queue_and_recovery' : 'queue',
    workDocsRead: work.workDocsRead + recovery.workDocsRead,
    recoveryDocsRead: recovery.recoveryDocsRead,
    subjectDocsRead: work.subjectDocsRead + recovery.subjectDocsRead,
    paymentLookupReads: work.paymentLookupReads + recovery.paymentLookupReads,
    courseLookupReads: work.courseLookupReads + recovery.courseLookupReads,
    canonicalDocsRead: work.canonicalDocsRead,
    quarantineDocsRead: recovery.quarantineDocsRead,
    quarantined: recovery.quarantined,
    recoveryFailed: recovery.failed,
    controlDocsRead: 1 + recovery.controlDocsRead,
    workCandidatesSelected: work.workCandidatesSelected,
    reconciled: work.reconciled,
    skipped: work.skipped,
    retried: work.retried,
    failed: work.failed + (recovery.failed ? 1 : 0),
    pages: work.pages + recovery.pages,
    truncated: work.truncated || recovery.truncated,
    durationMs: Date.now() - started,
    readMetricsScope:
      'requested_document_reads_and_returned_query_documents_excludes_empty_query_billing',
  };
}
