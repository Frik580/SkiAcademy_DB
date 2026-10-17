import { describe, expect, it, vi } from 'vitest';
import {
  AccountIdSchema,
  BookingIdSchema,
  CanonicalCommandError,
  CommandIdSchema,
  CorrelationIdSchema,
  PaymentIdSchema,
  TestSessionIdSchema,
  accountCommandActor,
  commandErrorResult,
  commandSuccessResult,
  testCanonicalExecutionScope,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { executeIdempotentCanonicalCommand } from '../commands/idempotentCommandExecution';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import {
  conversionEventsForNewCommercialSubject,
  conversionEventsForPaidTransition,
  selectCommittedConversionAnalyticsEvents,
  stageConversionAnalyticsEvents,
  withConversionAnalyticsSink,
  type ConversionAnalyticsEvent,
  type ConversionAnalyticsSink,
} from './conversionAnalytics';

const occurredAt = timestampFromDate(new Date('2026-04-01T12:00:00.000Z'));
const commandId = CommandIdSchema.parse('command_conv_01');
const correlationId = CorrelationIdSchema.parse('correlation_conv_01');
const bookingId = BookingIdSchema.parse('booking_conv_01');
const paymentId = PaymentIdSchema.parse('payment_conv_01');
const accountId = AccountIdSchema.parse('account_conv_01');

function newSubject(
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid',
  lifecycle: 'pending' | 'confirmed' = 'confirmed'
) {
  return conversionEventsForNewCommercialSubject({
    commandKind: 'create_confirmed_booking',
    commandId,
    correlationId,
    occurredAt,
    subjectType: 'booking',
    subjectId: bookingId,
    paymentId,
    priceMinor: 15_000,
    paidAmountMinor:
      paymentStatus === 'paid' ? 15_000 : paymentStatus === 'partially_paid' ? 5_000 : 0,
    paymentStatus,
    subjectLifecycle: lifecycle,
    accountId,
  });
}

function envelope(idempotencyKey: string): CommandEnvelope<'complete_booking'> {
  return {
    kind: 'complete_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
    },
    intent: { bookingId },
  };
}

function capturingSink(): { sink: ConversionAnalyticsSink; events: ConversionAnalyticsEvent[] } {
  const events: ConversionAnalyticsEvent[] = [];
  return {
    events,
    sink: {
      emit(event) {
        events.push(event);
      },
    },
  };
}

describe('conversion analytics facts', () => {
  it('emits booking_complete for a new unpaid booking and not paid', () => {
    const events = newSubject('unpaid', 'pending');
    expect(events.map((event) => event.name)).toEqual(['booking_complete']);
    expect(events[0]).toMatchObject({
      name: 'booking_complete',
      source: 'canonical_command',
      occurredAt: '2026-04-01T12:00:00.000Z',
      commandKind: 'create_confirmed_booking',
      subjectType: 'booking',
      subjectId: bookingId,
      paymentId,
      currency: 'KZT',
      priceMinor: 15_000,
      paidAmountMinor: 0,
      paymentStatus: 'unpaid',
      subjectLifecycle: 'pending',
      accountId,
    });
  });

  it('emits booking_complete then paid when the new payment is already paid', () => {
    expect(newSubject('paid').map((event) => event.name)).toEqual(['booking_complete', 'paid']);
  });

  it('emits paid only on the first transition to paid', () => {
    const base = {
      commandKind: 'record_provider_payment_event' as const,
      commandId,
      correlationId,
      occurredAt,
      subjectType: 'booking' as const,
      subjectId: bookingId,
      paymentId,
      priceMinor: 15_000,
      paidAmountMinor: 15_000,
      paymentStatus: 'paid' as const,
      accountId,
    };
    expect(
      conversionEventsForPaidTransition({ ...base, previousPaymentStatus: 'unpaid' }).map(
        (event) => event.name
      )
    ).toEqual(['paid']);
    expect(
      conversionEventsForPaidTransition({
        ...base,
        previousPaymentStatus: 'partially_paid',
        paidAmountMinor: 15_000,
      })
    ).toHaveLength(1);
    expect(conversionEventsForPaidTransition({ ...base, previousPaymentStatus: 'paid' })).toEqual(
      []
    );
    expect(
      conversionEventsForPaidTransition({
        ...base,
        previousPaymentStatus: 'unpaid',
        paymentStatus: 'partially_paid',
        paidAmountMinor: 5_000,
      })
    ).toEqual([]);
    expect(
      conversionEventsForPaidTransition({
        ...base,
        previousPaymentStatus: 'paid',
        paymentStatus: 'refunded',
        paidAmountMinor: 0,
      })
    ).toEqual([]);
  });

  it('drops replay, error, and test-scope facts', () => {
    const staged = newSubject('paid');
    expect(
      selectCommittedConversionAnalyticsEvents({
        dataScope: 'live',
        replayed: false,
        status: 'success',
        staged,
      }).map((event) => event.dataScope)
    ).toEqual(['live', 'live']);
    expect(
      selectCommittedConversionAnalyticsEvents({
        dataScope: 'live',
        replayed: true,
        status: 'success',
        staged,
      })
    ).toEqual([]);
    expect(
      selectCommittedConversionAnalyticsEvents({
        dataScope: 'live',
        replayed: false,
        status: 'error',
        staged,
      })
    ).toEqual([]);
    expect(
      selectCommittedConversionAnalyticsEvents({
        dataScope: 'test',
        replayed: false,
        status: 'success',
        staged,
      })
    ).toEqual([]);
  });
});

describe('executeIdempotentCanonicalCommand conversion emission', () => {
  it('emits staged facts once after a live commit and not on replay', async () => {
    const captured = capturingSink();
    const executor = createInMemoryCanonicalTransactionExecutor();
    const handler = {
      execute: async () => {
        stageConversionAnalyticsEvents(newSubject('paid'));
        return commandSuccessResult('complete_booking', correlationId);
      },
    };

    await withConversionAnalyticsSink(captured.sink, async () => {
      const first = await executeIdempotentCanonicalCommand({
        envelope: envelope('idem-conv-live'),
        environment: {
          clock: createAuthoritativeCommandClock(new Date('2026-04-01T12:00:00.000Z')),
        },
        executor,
        handler,
      });
      const replay = await executeIdempotentCanonicalCommand({
        envelope: envelope('idem-conv-live'),
        environment: {
          clock: createAuthoritativeCommandClock(new Date('2026-04-01T12:00:00.000Z')),
        },
        executor,
        handler,
      });
      expect(first.status).toBe('success');
      expect(replay.status).toBe('success');
    });

    expect(captured.events.map((event) => event.name)).toEqual(['booking_complete', 'paid']);
    expect(captured.events.every((event) => event.dataScope === 'live')).toBe(true);
  });

  it('does not emit when the handler does not stage a conversion fact', async () => {
    const captured = capturingSink();
    await withConversionAnalyticsSink(captured.sink, async () => {
      const result = await executeIdempotentCanonicalCommand({
        envelope: envelope('idem-conv-complete-only'),
        environment: {
          clock: createAuthoritativeCommandClock(new Date('2026-04-01T12:00:00.000Z')),
        },
        executor: createInMemoryCanonicalTransactionExecutor(),
        handler: {
          execute: async () => commandSuccessResult('complete_booking', correlationId),
        },
      });
      expect(result.status).toBe('success');
    });
    expect(captured.events).toEqual([]);
  });

  it('does not emit test-scope commits', async () => {
    const captured = capturingSink();
    const testSessionId = TestSessionIdSchema.parse('test_session_conv_a');
    await withConversionAnalyticsSink(captured.sink, async () => {
      const result = await executeIdempotentCanonicalCommand({
        envelope: envelope('idem-conv-test'),
        environment: {
          clock: createAuthoritativeCommandClock(new Date('2026-04-01T12:00:00.000Z')),
          scope: testCanonicalExecutionScope(testSessionId),
        },
        executor: createInMemoryCanonicalTransactionExecutor(),
        handler: {
          execute: async () => {
            stageConversionAnalyticsEvents(newSubject('unpaid'));
            return commandSuccessResult('complete_booking', correlationId);
          },
        },
      });
      expect(result.status).toBe('success');
    });
    expect(captured.events).toEqual([]);
  });

  it('does not emit rejected outcomes and keeps the command result when the sink throws', async () => {
    const captured = capturingSink();
    const rejected = await withConversionAnalyticsSink(captured.sink, () =>
      executeIdempotentCanonicalCommand({
        envelope: envelope('idem-conv-rejected'),
        environment: {
          clock: createAuthoritativeCommandClock(new Date('2026-04-01T12:00:00.000Z')),
        },
        executor: createInMemoryCanonicalTransactionExecutor(),
        handler: {
          execute: async () => {
            stageConversionAnalyticsEvents(newSubject('paid'));
            return commandErrorResult(
              'complete_booking',
              correlationId,
              new CanonicalCommandError('validation', { correlationId }).toTransport()
            );
          },
        },
      })
    );
    expect(rejected.status).toBe('error');
    expect(captured.events).toEqual([]);

    const throwingSink: ConversionAnalyticsSink = {
      emit() {
        throw new Error('analytics down');
      },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const result = await withConversionAnalyticsSink(throwingSink, () =>
        executeIdempotentCanonicalCommand({
          envelope: envelope('idem-conv-sink-down'),
          environment: {
            clock: createAuthoritativeCommandClock(new Date('2026-04-01T12:00:00.000Z')),
          },
          executor: createInMemoryCanonicalTransactionExecutor(),
          handler: {
            execute: async () => {
              stageConversionAnalyticsEvents(newSubject('paid'));
              return commandSuccessResult('complete_booking', correlationId);
            },
          },
        })
      );
      expect(result.status).toBe('success');
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
