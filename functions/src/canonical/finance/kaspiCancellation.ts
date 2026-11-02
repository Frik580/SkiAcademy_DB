import {
  CanonicalCommandError,
  KaspiPaymentRequestSchema,
  KztMinorUnitsSchema,
  nextAggregateRevision,
  type CanonicalTimestamp,
  type CommandId,
  type CorrelationId,
  type KztMinorUnits,
  type Payment,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import { kaspiRequestPath, parseKaspiRequest } from './kaspiPaymentStore';
import { toFirestoreWritePayload } from './financeStore';

export interface PlannedKaspiCancellation {
  readonly effectiveRefundAmount: KztMinorUnits;
  commit(session: CanonicalAtomicTransactionSession): void;
}

/** Retained bank money must be refunded before a price change reduces its funding. */
export async function assertNoImplicitKaspiRefund(
  session: CanonicalAtomicTransactionSession,
  payment: Payment,
  amount: KztMinorUnits,
  correlationId: CorrelationId
): Promise<void> {
  if (payment.manualPaymentRequestId && amount > 0) {
    const path = kaspiRequestPath(payment.manualPaymentRequestId);
    const read = await session.tx.get({ path });
    session.plan.planRead({ path, category: 'payment_wallet' });
    const request = parseKaspiRequest(read.data);
    if (
      !request ||
      request.paymentId !== payment.paymentId ||
      (request.serviceFunded && request.receipt && request.receipt.amount > request.refundedAmount)
    ) {
      throw new CanonicalCommandError('invalid_transition', {
        correlationId,
        details: { field: 'manualPaymentRequestId', reason: 'unsupported' },
      });
    }
  }
}
/** Cancellation releases the service; a bank refund is a separate factual command. */
export async function planKaspiCancellation(
  session: CanonicalAtomicTransactionSession,
  input: {
    payment: Payment;
    refundAmount: KztMinorUnits;
    commandId: CommandId;
    correlationId: CorrelationId;
    decidedAt: CanonicalTimestamp;
  }
): Promise<PlannedKaspiCancellation | undefined> {
  if (!input.payment.manualPaymentRequestId) return undefined;
  const path = kaspiRequestPath(input.payment.manualPaymentRequestId);
  const read = await session.tx.get({ path });
  session.plan.planRead({ path, category: 'payment_wallet' });
  const request = parseKaspiRequest(read.data);
  if (!request || request.paymentId !== input.payment.paymentId) {
    throw new CanonicalCommandError('validation', { correlationId: input.correlationId });
  }
  const bankRemaining =
    request.serviceFunded && request.receipt ? request.receipt.amount - request.refundedAmount : 0;
  const bankRefund = KztMinorUnitsSchema.parse(Math.min(input.refundAmount, bankRemaining));
  const walletRefund = KztMinorUnitsSchema.parse(input.refundAmount - bankRefund);
  if (request.receipt && bankRefund === 0)
    return { effectiveRefundAmount: walletRefund, commit() {} };
  if (request.receipt && input.refundAmount === 0) return undefined;
  const updated = KaspiPaymentRequestSchema.parse({
    ...request,
    ...(request.receipt
      ? {
          status: 'refund_required',
          refundAmount:
            request.status === 'refund_required'
              ? KztMinorUnitsSchema.parse(Math.max(request.refundAmount ?? 0, bankRefund))
              : bankRefund,
          refundReason: 'Service cancellation; bank refund pending',
        }
      : { status: 'cancelled' }),
    revision: nextAggregateRevision(request.revision),
    updatedAt: input.decidedAt,
  });
  session.plan.planMutation({
    path,
    kind: 'update',
    category: 'payment_wallet',
    estimatedPayloadBytes: 2048,
  });
  const actionPath = `${path}/actions/${input.commandId}`;
  session.plan.planMutation({
    path: actionPath,
    kind: 'create',
    category: 'payment_wallet',
    estimatedPayloadBytes: 256,
  });
  return {
    effectiveRefundAmount: walletRefund,
    commit(target) {
      target.tx.update({ path }, toFirestoreWritePayload(updated as Record<string, unknown>));
      target.tx.create(
        { path: actionPath },
        {
          kind: 'service_cancelled',
          status: updated.status,
          at: input.decidedAt,
          commandId: input.commandId,
        }
      );
    },
  };
}
