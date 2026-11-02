import { describe, expect, it } from 'vitest';
import {
  KASPI_CONFIGURATION_PATH,
  IdempotencyKeySchema,
  KaspiPaymentRequestSchema,
  readEnabledKaspiConfiguration,
  type CommandEnvelope,
  KztMinorUnitsSchema,
} from '@ski-academy/shared-domain';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import {
  kaspiFixtures,
  kaspiGuest,
  kaspiReview,
  kaspiTopup,
  kaspiRequestA,
  kaspiRequestB,
  kaspiAccount,
  kaspiSecret,
} from '../../../testSupport/kaspiPaymentFixtures';
import { kaspiRequestPath, kaspiReceiptGuardPath } from './kaspiPaymentStore';
import { planKaspiCancellation } from './kaspiCancellation';
import {
  planCancellationFinance,
  commitPlannedCancellationFinanceEffects,
} from '../bookings/bookingCancellationFinance';
import { WalletSchema, PaymentSchema, timestampFromDate } from '@ski-academy/shared-domain';

function harness(extra: Record<string, Record<string, unknown>> = {}) {
  const executor = createInMemoryCanonicalTransactionExecutor({
    ...kaspiFixtures().docs,
    ...extra,
  });
  const run = <K extends CommandEnvelope['kind']>(
    envelope: CommandEnvelope<K>,
    at = '2026-01-01T10:00:00Z'
  ) =>
    createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date(at)) },
      executor,
      { guestActionTokenSecret: kaspiSecret }
    ).execute(envelope);
  const get = (path: string) => executor.snapshot().docs.get(path)?.data;
  const events = () =>
    [...executor.snapshot().docs].filter(([path]) => path.startsWith('monetary_events/'));
  return { executor, run, get, events };
}
describe('Kaspi request financial boundary', () => {
  it('defaults off and rejects incomplete or unverified configuration', async () => {
    for (const config of [
      undefined,
      {},
      { enabled: true },
      { ...kaspiFixtures().docs[KASPI_CONFIGURATION_PATH], enabled: false },
    ])
      expect(readEnabledKaspiConfiguration(config)).toBeUndefined();
    const h = harness({ [KASPI_CONFIGURATION_PATH]: { enabled: false } });
    expect((await h.run(kaspiTopup())).status).toBe('error');
    for (const type of ['guest_booking_payment', 'guest_course_payment'] as const)
      expect((await h.run(kaspiGuest(type))).status).toBe('error');
    expect(h.get(kaspiRequestPath(kaspiRequestA))).toBeUndefined();
    expect(h.events()).toHaveLength(0);
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid amount %s before persistence',
    async (amount) => {
      const h = harness();
      const envelope = kaspiTopup();
      expect(
        (
          await h.run({
            ...envelope,
            intent: { ...envelope.intent, amount },
          } as CommandEnvelope<'create_kaspi_payment_request'>)
        ).status
      ).toBe('error');
      expect(h.events()).toHaveLength(0);
    }
  );
  it('creates and replays a wallet request without crediting it', async () => {
    const h = harness();
    const result = await h.run(kaspiTopup());
    expect(result.status, JSON.stringify(result)).toBe('success');
    expect((await h.run(kaspiTopup())).status).toBe('success');
    expect(h.get(`users/${kaspiAccount}/wallet/state`)).toBeUndefined();
    expect(h.events()).toHaveLength(0);
    expect(h.get(kaspiRequestPath(kaspiRequestA))?.revision).toBe(1);
  });
  it('supports distinct requests without crediting either', async () => {
    const h = harness();
    await h.run(kaspiTopup());
    expect((await h.run(kaspiTopup(kaspiRequestB))).status).toBe('success');
    expect(h.events()).toHaveLength(0);
  });
  it('payment claimed is only a statement, with no balance or financial event', async () => {
    const h = harness();
    const create = kaspiTopup();
    await h.run(create);
    const claim: CommandEnvelope<'claim_kaspi_payment'> = {
      kind: 'claim_kaspi_payment',
      intent: { requestId: kaspiRequestA },
      context: {
        ...create.context,
        idempotencyKey: IdempotencyKeySchema.parse('kaspi_claim_unit'),
      },
    };
    expect((await h.run(claim)).status).toBe('success');
    expect((await h.run(claim)).status).toBe('success');
    expect(h.get(kaspiRequestPath(kaspiRequestA))?.status).toBe('payment_claimed');
    expect(h.events()).toHaveLength(0);
  });
  it('credits wallet and MonetaryEvent exactly once across command replay and stale retry', async () => {
    const h = harness();
    await h.run(kaspiTopup());
    const confirm = kaspiReview();
    expect((await h.run(confirm)).status).toBe('success');
    expect((await h.run(confirm)).status).toBe('success');
    expect(
      (
        await h.run({
          ...confirm,
          context: {
            ...confirm.context,
            idempotencyKey: IdempotencyKeySchema.parse('distinct_stale_review'),
          },
        })
      ).status
    ).toBe('error');
    expect(h.get(`users/${kaspiAccount}/wallet/state`)?.balance).toBe(10000);
    expect(h.events()).toHaveLength(1);
    expect(h.get(kaspiReceiptGuardPath('demo-merchant', 'bank-demo-001'))?.requestId).toBe(
      kaspiRequestA
    );
  });
  it('does not reuse a bank receipt between wallet and guest requests', async () => {
    const h = harness();
    await h.run(kaspiTopup());
    await h.run(kaspiGuest('guest_booking_payment', kaspiRequestB));
    await h.run(kaspiReview());
    expect((await h.run(kaspiReview(kaspiRequestB))).status).toBe('error');
    expect(h.events()).toHaveLength(1);
  });
  it('requires a unique bank reference and does not invent one', async () => {
    const h = harness();
    await h.run(kaspiTopup());
    const confirm = kaspiReview();
    expect(
      (
        await h.run({
          ...confirm,
          intent: { ...confirm.intent, receipt: { ...confirm.intent.receipt!, bankReference: '' } },
        })
      ).status
    ).toBe('error');
    expect(h.events()).toHaveLength(0);
  });
  it('rejects customer confirmation and cross-account claims', async () => {
    const h = harness();
    await h.run(kaspiTopup());
    const confirm = kaspiReview();
    const owner = kaspiTopup().context;
    expect((await h.run({ ...confirm, context: owner })).status).toBe('error');
    const claim: CommandEnvelope<'claim_kaspi_payment'> = {
      kind: 'claim_kaspi_payment',
      intent: { requestId: kaspiRequestA },
      context: {
        ...owner,
        actor: { kind: 'account', accountId: 'another_account' as never },
        idempotencyKey: IdempotencyKeySchema.parse('cross_account_claim'),
      },
    };
    expect((await h.run(claim)).status).toBe('error');
    expect(h.events()).toHaveLength(0);
  });
  it('retains mismatched received money as an unallocated canonical event and refund obligation', async () => {
    const h = harness();
    await h.run(kaspiTopup());
    const confirm = kaspiReview();
    expect(
      (
        await h.run({
          ...confirm,
          intent: {
            ...confirm.intent,
            receipt: { ...confirm.intent.receipt!, amount: 5000 as never },
          },
        })
      ).status
    ).toBe('success');
    expect(h.get(kaspiRequestPath(kaspiRequestA))?.status).toBe('refund_required');
    expect(h.get(`users/${kaspiAccount}/wallet/state`)).toBeUndefined();
    expect(h.events()[0]?.[1].data.externalAmount).toBe(5000);
  });
  it.each(['guest_booking_payment', 'guest_course_payment'] as const)(
    'funds one existing %s without guest Wallet',
    async (type) => {
      const h = harness();
      expect((await h.run(kaspiGuest(type))).status).toBe('success');
      const result = await h.run(kaspiReview());
      expect(result.status, JSON.stringify(result)).toBe('success');
      const { booking, enrollment } = kaspiFixtures();
      const subject = type === 'guest_booking_payment' ? booking : enrollment;
      expect(
        h.get(
          type === 'guest_booking_payment'
            ? `bookings/${booking.bookingId}`
            : `course_enrollments/${enrollment.enrollmentId}`
        )?.lifecycle
      ).toEqual({ status: 'confirmed' });
      expect(h.get(`payments/${subject.paymentId}`)?.paidAmount).toBe(10000);
      expect(h.events()).toHaveLength(1);
      expect(
        [...h.executor.snapshot().docs.keys()].filter((path) => path.endsWith('/wallet/state'))
      ).toHaveLength(0);
    }
  );
  it.each(['guest_booking_payment', 'guest_course_payment'] as const)(
    'preserves received money after %s expires without funding or resurrection',
    async (type) => {
      const h = harness();
      await h.run(kaspiGuest(type));
      expect((await h.run(kaspiReview(), '2026-01-03T10:00:00Z')).status).toBe('success');
      expect(h.get(kaspiRequestPath(kaspiRequestA))?.status).toBe('refund_required');
      expect(h.get(kaspiRequestPath(kaspiRequestA))?.serviceFunded).toBe(false);
      expect(h.events()[0]?.[1].data.paymentEffect).toBeUndefined();
    }
  );
  it('rejects forged guest credentials and wrong guest identity', async () => {
    const h = harness();
    const create = kaspiGuest('guest_booking_payment');
    expect(
      (
        await h.run({
          ...create,
          context: {
            ...create.context,
            transportMetadata: {
              ...create.context.transportMetadata,
              guest_action_sig: '0'.repeat(64),
            },
          },
        })
      ).status
    ).toBe('error');
    expect(h.get(kaspiRequestPath(kaspiRequestA))).toBeUndefined();
  });
  it('records a real bank refund exactly once and corrects funded Wallet once', async () => {
    const h = harness();
    await h.run(kaspiTopup());
    await h.run(kaspiReview());
    expect((await h.run(kaspiReview(kaspiRequestA, 2, 'require_refund'))).status).toBe('success');
    expect(h.get(`users/${kaspiAccount}/wallet/state`)?.balance).toBe(0);
    const refund = kaspiReview(kaspiRequestA, 3, 'record_refund', {
      refundBankReference: 'BANK-REFUND-001',
      refundedAt: { seconds: 1767261600, nanoseconds: 0 },
    });
    expect((await h.run(refund)).status).toBe('success');
    expect((await h.run(refund)).status).toBe('success');
    expect(h.get(`users/${kaspiAccount}/wallet/state`)?.balance).toBe(0);
    expect(h.events()).toHaveLength(3);
    expect(h.get(kaspiRequestPath(kaspiRequestA))?.status).toBe('refunded');
  });
  it('cannot claim a bank refund without its factual date and reference', async () => {
    const h = harness();
    await h.run(kaspiTopup());
    await h.run(kaspiReview());
    await h.run(kaspiReview(kaspiRequestA, 2, 'require_refund'));
    expect((await h.run(kaspiReview(kaspiRequestA, 3, 'record_refund'))).status).toBe('error');
    expect(h.events()).toHaveLength(2);
  });
  it('defers cancellation bank refund and preserves bank routing after linking', async () => {
    const h = harness();
    await h.run(kaspiGuest('guest_booking_payment'));
    await h.run(kaspiReview());
    const { booking } = kaspiFixtures();
    const payment = h.get(`payments/${booking.paymentId}`)!;
    await h.executor.runAtomic({
      correlationId: kaspiReview().context.correlationId,
      run: async (session) => {
        const plan = await planKaspiCancellation(session, {
          payment: { ...payment, payerAccountId: kaspiAccount } as never,
          refundAmount: KztMinorUnitsSchema.parse(10000),
          commandId: 'command_deferred_refund' as never,
          correlationId: session.correlationId,
          decidedAt: kaspiReview().intent.receipt!.receivedAt,
        });
        expect(plan?.effectiveRefundAmount).toBe(0);
        await session.transitionToWrites();
        plan?.commit(session);
      },
    });
    expect(h.get(kaspiRequestPath(kaspiRequestA))?.status).toBe('refund_required');
    expect(h.get(`payments/${booking.paymentId}`)?.refundedAmount).toBe(0);
    expect(h.events()).toHaveLength(1);
    expect(
      KaspiPaymentRequestSchema.safeParse(h.get(kaspiRequestPath(kaspiRequestA))).success
    ).toBe(true);
  });
  it.each([5000, 10000])(
    'cancels a paid guest lesson with approved %s refund and records only actual bank return',
    async (refundAmount) => {
      const h = harness();
      await h.run(kaspiGuest('guest_booking_payment'));
      await h.run(kaspiReview());
      const { booking } = kaspiFixtures();
      const context = kaspiReview().context;
      const cancellation = {
        kind: 'resolve_booking_cancellation' as const,
        context: {
          ...context,
          expectedRevision: h.get(`bookings/${booking.bookingId}`)!.revision as never,
          idempotencyKey: IdempotencyKeySchema.parse('cancel_paid_guest_lesson'),
        },
        intent: {
          bookingId: booking.bookingId,
          decision: 'direct_cancel' as const,
          refundAmount: KztMinorUnitsSchema.parse(refundAmount),
          expectedPaymentRevision: h.get(`payments/${booking.paymentId}`)!.revision as never,
          reasonExplanation: 'Approved emulator cancellation',
        },
      };
      const cancelled = await h.run(cancellation);
      expect(cancelled.status, JSON.stringify(cancelled)).toBe('success');
      expect(h.get(`bookings/${booking.bookingId}`)?.lifecycle.status).toBe('cancelled');
      expect(h.get(`payments/${booking.paymentId}`)?.refundedAmount).toBe(0);
      expect(h.get(kaspiRequestPath(kaspiRequestA))).toMatchObject({
        status: 'refund_required',
        refundAmount,
      });
      expect(h.events()).toHaveLength(1);
      const bankReturn = kaspiReview(
        kaspiRequestA,
        h.get(kaspiRequestPath(kaspiRequestA))!.revision as number,
        'record_refund',
        {
          refundBankReference: 'EMULATOR-CANCEL-REFUND',
          refundedAt: kaspiReview().intent.receipt!.receivedAt,
        }
      );
      expect((await h.run(bankReturn)).status).toBe('success');
      expect((await h.run(bankReturn)).status).toBe('success');
      expect(h.get(`payments/${booking.paymentId}`)?.refundedAmount).toBe(refundAmount);
      expect(h.events()).toHaveLength(2);
      expect(
        [...h.executor.snapshot().docs].filter(([path]) => path.endsWith('/wallet/state'))
      ).toHaveLength(0);
      expect(
        [...h.executor.snapshot().docs]
          .filter(
            ([path, doc]) =>
              path.startsWith('resource_claims/') && doc.data.ownerId === booking.bookingId
          )
          .every(([, doc]) => doc.data.lifecycle.status === 'released')
      ).toBe(true);
    }
  );
  it.each([5000, 10000, 12000, 15000])(
    'splits mixed cancellation %s bank-first and refunds only the Wallet remainder immediately',
    async (refundAmount) => {
      const h = harness();
      await h.run(kaspiGuest('guest_booking_payment'));
      await h.run(kaspiReview());
      const { booking } = kaspiFixtures();
      const paid = PaymentSchema.parse({
        ...h.get(`payments/${booking.paymentId}`),
        payerAccountId: kaspiAccount,
        price: 15000,
        paidAmount: 15000,
        settledAmount: 15000,
        retainedAmount: 15000,
      });
      const at = timestampFromDate(new Date('2026-01-01T10:00:00Z'));
      await h.executor.runAtomic({
        correlationId: kaspiReview().context.correlationId,
        run: async (session) => {
          await session.transitionToWrites();
          session.tx.update({ path: `payments/${booking.paymentId}` }, paid);
          session.tx.create(
            { path: `users/${kaspiAccount}/wallet/state` },
            WalletSchema.parse({
              accountId: kaspiAccount,
              currency: 'KZT',
              balance: 0,
              revision: 1,
              eventRevision: 1,
              createdAt: at,
              updatedAt: at,
            })
          );
        },
      });
      await h.executor.runAtomic({
        correlationId: kaspiReview().context.correlationId,
        run: async (session) => {
          const plan = await planCancellationFinance(session, {
            envelope: kaspiReview(),
            booking: { ...booking, payerAccountId: kaspiAccount as never },
            payment: paid,
            refundAmount: KztMinorUnitsSchema.parse(refundAmount),
            commandId: 'command_mixed_cancel' as never,
            correlationId: session.correlationId,
            decidedAt: at,
          });
          await session.transitionToWrites();
          commitPlannedCancellationFinanceEffects(session, plan);
        },
      });
      const bank = Math.min(10000, refundAmount);
      const wallet = refundAmount - bank;
      expect(h.get(kaspiRequestPath(kaspiRequestA))?.refundAmount).toBe(bank);
      expect(h.get(`payments/${booking.paymentId}`)?.refundedAmount).toBe(wallet);
      expect(h.get(`users/${kaspiAccount}/wallet/state`)?.balance).toBe(wallet);
      expect(
        (
          await h.run(
            kaspiReview(kaspiRequestA, 3, 'record_refund', {
              refundBankReference: 'BANK-MIXED-REFUND',
              refundedAt: at,
            })
          )
        ).status
      ).toBe('success');
      expect(h.get(`payments/${booking.paymentId}`)?.refundedAmount).toBe(refundAmount);
      expect(h.get(`users/${kaspiAccount}/wallet/state`)?.balance).toBe(wallet);
    }
  );
  it('accounts for previous mixed refunds, rejects reused bank references and prevents over-refund', async () => {
    const h = harness();
    expect((await h.run(kaspiGuest('guest_booking_payment'))).status).toBe('success');
    expect((await h.run(kaspiReview())).status).toBe('success');
    const { booking } = kaspiFixtures();
    const at = kaspiReview().intent.receipt!.receivedAt;
    await h.executor.runAtomic({
      correlationId: kaspiReview().context.correlationId,
      run: async (session) => {
        await session.transitionToWrites();
        session.tx.update(
          { path: `payments/${booking.paymentId}` },
          PaymentSchema.parse({
            ...h.get(`payments/${booking.paymentId}`),
            payerAccountId: kaspiAccount,
            price: 15000,
            paidAmount: 15000,
            settledAmount: 15000,
            retainedAmount: 15000,
          })
        );
        session.tx.create(
          { path: `users/${kaspiAccount}/wallet/state` },
          WalletSchema.parse({
            accountId: kaspiAccount,
            currency: 'KZT',
            balance: 0,
            revision: 1,
            eventRevision: 1,
            createdAt: at,
            updatedAt: at,
          })
        );
      },
    });
    let cumulative = 0;
    for (const [index, amount] of [5000, 5000, 2000, 3000].entries()) {
      const bank = Math.min(amount, 10000 - Math.min(cumulative, 10000));
      await h.executor.runAtomic({
        correlationId: kaspiReview().context.correlationId,
        run: async (session) => {
          const plan = await planCancellationFinance(session, {
            envelope: kaspiReview(),
            booking: { ...booking, payerAccountId: kaspiAccount as never },
            payment: PaymentSchema.parse(h.get(`payments/${booking.paymentId}`)),
            refundAmount: KztMinorUnitsSchema.parse(amount),
            commandId: `command_partial_${index}` as never,
            correlationId: session.correlationId,
            decidedAt: at,
          });
          await session.transitionToWrites();
          commitPlannedCancellationFinanceEffects(session, plan);
        },
      });
      // A pending bank refund must not affect Payment until actually recorded.
      expect(h.get(`payments/${booking.paymentId}`)?.refundedAmount).toBe(
        cumulative + amount - bank
      );
      if (bank) {
        const revision = h.get(kaspiRequestPath(kaspiRequestA))!.revision as number;
        if (index === 1) {
          expect(
            (
              await h.run(
                kaspiReview(kaspiRequestA, revision, 'record_refund', {
                  refundBankReference: 'EMULATOR-PARTIAL-0',
                  refundedAt: at,
                })
              )
            ).status
          ).toBe('error');
          expect(h.get(`payments/${booking.paymentId}`)?.refundedAmount).toBe(cumulative);
        }
        const command = kaspiReview(kaspiRequestA, revision, 'record_refund', {
          refundBankReference: `EMULATOR-PARTIAL-${index}`,
          refundedAt: at,
        });
        expect((await h.run(command)).status).toBe('success');
        const events = h.events().length;
        expect((await h.run(command)).status).toBe('success');
        expect(h.events()).toHaveLength(events);
      }
      cumulative += amount;
      expect(h.get(`payments/${booking.paymentId}`)?.refundedAmount).toBe(cumulative);
      expect(h.get(kaspiRequestPath(kaspiRequestA))?.refundedAmount).toBe(
        Math.min(10000, cumulative)
      );
      expect(h.get(`users/${kaspiAccount}/wallet/state`)?.balance).toBe(
        Math.max(0, cumulative - 10000)
      );
    }
    expect(
      (
        await h.run(
          kaspiReview(
            kaspiRequestA,
            h.get(kaspiRequestPath(kaspiRequestA))!.revision as number,
            'require_refund',
            { refundAmount: 1 }
          )
        )
      ).status
    ).toBe('error');
    expect(h.get(`payments/${booking.paymentId}`)?.retainedAmount).toBe(0);
  });
  it('processes existing refund obligations while disabled and blocks new requests', async () => {
    const h = harness();
    await h.run(kaspiTopup());
    await h.run(kaspiReview());
    await h.executor.runAtomic({
      correlationId: kaspiReview().context.correlationId,
      run: async (session) => {
        await session.transitionToWrites();
        session.tx.update({ path: KASPI_CONFIGURATION_PATH }, { enabled: false });
      },
    });
    expect((await h.run(kaspiTopup(kaspiRequestB))).status).toBe('error');
    expect(
      (await h.run(kaspiReview(kaspiRequestA, 2, 'require_refund', { refundAmount: 4000 }))).status
    ).toBe('success');
    expect(
      (
        await h.run(
          kaspiReview(kaspiRequestA, 3, 'record_refund', {
            refundBankReference: 'EMULATOR-DISABLED-REFUND',
            refundedAt: kaspiReview().intent.receipt!.receivedAt,
          })
        )
      ).status
    ).toBe('success');
    expect(h.get(`users/${kaspiAccount}/wallet/state`)?.balance).toBe(6000);
  });
  it('does not allow the old manual capture command to bypass a QR request', async () => {
    const h = harness();
    await h.run(kaspiGuest('guest_booking_payment'));
    const { booking } = kaspiFixtures();
    const admin = kaspiReview().context;
    const result = await h.run({
      kind: 'record_provider_payment_event',
      context: {
        ...admin,
        expectedRevision: undefined,
        idempotencyKey: IdempotencyKeySchema.parse('old_capture_bypass'),
      },
      intent: {
        paymentId: booking.paymentId,
        amount: 10000 as never,
        sourceKind: 'bank_transfer',
        manualReference: 'BANK-DEMO-001',
      },
    });
    expect(result.status).toBe('error');
    expect(h.events()).toHaveLength(0);
  });
  it('blocks compensating refunds through the old correction command', async () => {
    const h = harness();
    await h.run(kaspiGuest('guest_booking_payment'));
    await h.run(kaspiReview());
    const { booking } = kaspiFixtures();
    const payment = h.get(`payments/${booking.paymentId}`)!;
    const result = await h.run({
      kind: 'record_financial_correction',
      context: {
        ...kaspiReview().context,
        idempotencyKey: IdempotencyKeySchema.parse('compensating_refund_bypass'),
        expectedRevision: undefined,
      },
      intent: {
        correctionKind: 'compensating_event',
        paymentId: booking.paymentId,
        expectedPaymentRevision: payment.revision as never,
        correctsEventId: h.events()[0]![1].data.eventId as never,
        paymentEffect: { refundedAmountDelta: 10000 },
        reasonExplanation: 'Old correction must not bypass bank refund',
      },
    });
    expect(result.status).toBe('error');
    expect(h.get(`payments/${booking.paymentId}`)?.refundedAmount).toBe(0);
    expect(h.events()).toHaveLength(1);
  });
  it('does not prepare a bank refund after the funded Wallet amount has been spent', async () => {
    const h = harness();
    await h.run(kaspiTopup());
    await h.run(kaspiReview());
    await h.executor.runAtomic({
      correlationId: kaspiReview().context.correlationId,
      run: async (session) => {
        await session.transitionToWrites();
        session.tx.update({ path: `users/${kaspiAccount}/wallet/state` }, { balance: 0 });
      },
    });
    expect((await h.run(kaspiReview(kaspiRequestA, 2, 'require_refund'))).status).toBe('error');
    expect(h.get(kaspiRequestPath(kaspiRequestA))?.status).toBe('confirmed');
    expect(h.events()).toHaveLength(1);
  });

  it('preserves an unallocated bank refund when a later Wallet-funded service is cancelled', async () => {
    const h = harness();
    await h.run(kaspiGuest('guest_booking_payment'));
    const confirm = kaspiReview();
    await h.run({
      ...confirm,
      intent: { ...confirm.intent, receipt: { ...confirm.intent.receipt!, amount: 5000 as never } },
    });
    const { booking } = kaspiFixtures();
    const beforeRequest = h.get(kaspiRequestPath(kaspiRequestA));
    await h.executor.runAtomic({
      correlationId: confirm.context.correlationId,
      run: async (session) => {
        const payment = PaymentSchema.parse({
          ...h.get(`payments/${booking.paymentId}`),
          payerAccountId: kaspiAccount,
          paidAmount: 10000,
          settledAmount: 10000,
          retainedAmount: 10000,
          outstandingAmount: 0,
          paymentStatus: 'paid',
        });
        const plan = await planKaspiCancellation(session, {
          payment,
          refundAmount: KztMinorUnitsSchema.parse(10000),
          commandId: 'command_unallocated_wallet_cancel' as never,
          correlationId: session.correlationId,
          decidedAt: confirm.intent.receipt!.receivedAt,
        });
        expect(plan?.effectiveRefundAmount).toBe(10000);
        await session.transitionToWrites();
        plan?.commit(session);
      },
    });
    expect(h.get(kaspiRequestPath(kaspiRequestA))).toEqual(beforeRequest);
    expect(h.get(kaspiRequestPath(kaspiRequestA))?.refundAmount).toBe(5000);
  });
  it('preserves Wallet price-refund capability after the bank portion has actually been returned', async () => {
    const h = harness();
    await h.run(kaspiGuest('guest_booking_payment'));
    await h.run(kaspiReview());
    const { booking } = kaspiFixtures();
    const at = timestampFromDate(new Date('2026-01-01T10:00:00Z'));
    const paid = PaymentSchema.parse({
      ...h.get(`payments/${booking.paymentId}`),
      payerAccountId: kaspiAccount,
      price: 15000,
      paidAmount: 15000,
      settledAmount: 15000,
      retainedAmount: 15000,
    });
    await h.executor.runAtomic({
      correlationId: kaspiReview().context.correlationId,
      run: async (session) => {
        await session.transitionToWrites();
        session.tx.update({ path: `payments/${booking.paymentId}` }, paid);
        session.tx.create(
          { path: `users/${kaspiAccount}/wallet/state` },
          WalletSchema.parse({
            accountId: kaspiAccount,
            currency: 'KZT',
            balance: 0,
            revision: 1,
            eventRevision: 1,
            createdAt: at,
            updatedAt: at,
          })
        );
      },
    });
    await h.run(kaspiReview(kaspiRequestA, 2, 'require_refund'));
    await h.run(
      kaspiReview(kaspiRequestA, 3, 'record_refund', {
        refundBankReference: 'BANK-COMPLETE-BEFORE-PRICE',
        refundedAt: at,
      })
    );
    const result = await h.run({
      kind: 'adjust_service_price',
      context: {
        ...kaspiReview().context,
        expectedRevision: h.get(`payments/${booking.paymentId}`)!.revision as never,
        idempotencyKey: IdempotencyKeySchema.parse('wallet_price_refund_after_bank'),
      },
      intent: {
        paymentId: booking.paymentId,
        newPrice: 0 as never,
        walletAccountId: kaspiAccount as never,
        reasonExplanation: 'Bank portion already returned; refund remaining Wallet funding',
      },
    });
    expect(result.status, JSON.stringify(result)).toBe('success');
    expect(h.get(`users/${kaspiAccount}/wallet/state`)?.balance).toBe(5000);
    expect(h.get(`payments/${booking.paymentId}`)?.refundedAmount).toBe(15000);
    expect(h.get(kaspiRequestPath(kaspiRequestA))?.refundedAmount).toBe(10000);
  });
});
