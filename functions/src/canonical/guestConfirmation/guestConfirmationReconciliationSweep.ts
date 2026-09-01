import type { Firestore } from 'firebase-admin/firestore';
import {
  CorrelationIdSchema,
  canonicalDeterministicHash,
  isPaymentFullyFundedForService,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { reconcileGuestConfirmationLifecycleMismatchAfterCommand } from '../finance/financeCorrectionCommands';
import { parsePayment } from '../finance/financeStore';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions/firestoreTransactionExecutor';

const RECONCILIATION_CONCURRENCY = 20;

export async function sweepGuestConfirmationLifecycleMismatches(
  firestore: Firestore,
  now = new Date()
): Promise<{ readonly scannedPayments: number }> {
  const snapshot = await firestore
    .collection('payments')
    .where('outstandingAmount', '==', 0)
    .get();
  const payments = snapshot.docs
    .map((document) => parsePayment(document.data()))
    .filter(
      (payment): payment is NonNullable<typeof payment> =>
        payment !== undefined && isPaymentFullyFundedForService(payment)
    );
  const executor = createFirestoreCanonicalTransactionExecutor(firestore);
  const environment = { clock: createAuthoritativeCommandClock(now) };

  for (let offset = 0; offset < payments.length; offset += RECONCILIATION_CONCURRENCY) {
    await Promise.all(
      payments.slice(offset, offset + RECONCILIATION_CONCURRENCY).map((payment) =>
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
  }

  return { scannedPayments: payments.length };
}
