import { describe, expect, it } from 'vitest';
import {
  accountCommandActor,
  AggregateRevisionSchema,
  BookingIdSchema,
  CanonicalCommandError,
  commandErrorResult,
  commandSuccessResult,
  CorrelationIdSchema,
  AccountIdSchema,
  resolveCommandIdempotencyIdentity,
  type CommandEnvelope,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from './commandClock';
import { executeIdempotentCanonicalCommand } from './idempotentCommandExecution';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_idem_fn_01');
const accountId = AccountIdSchema.parse('account_idem_fn_01');
const bookingPath = 'bookings/booking_idem_fn_01';

function envelope(
  idempotencyKey = 'idem-fn-01',
  expectedRevision?: number
): CommandEnvelope<'complete_booking'> {
  return {
    kind: 'complete_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
      ...(expectedRevision === undefined
        ? {}
        : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
    },
    intent: { bookingId: BookingIdSchema.parse('booking_idem_fn_01') },
  };
}

function environment(at: string) {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

describe('executeIdempotentCanonicalCommand', () => {
  it('stores canonical results and replays without invoking the handler again', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });
    let handlerCalls = 0;
    let mutationCount = 0;

    const handler = {
      execute: async (session) => {
        handlerCalls += 1;
        mutationCount += 1;
        session.tx.update({ path: bookingPath }, { revision: 2, status: 'completed' });
        return commandSuccessResult('complete_booking', correlationId);
      },
    };

    const first = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-replay-01', 1),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler,
    });
    const second = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-replay-01', 1),
      environment: environment('2026-01-02T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler,
    });

    expect(first).toEqual(second);
    expect(handlerCalls).toBe(1);
    expect(mutationCount).toBe(1);
    expect(executor.snapshot().docs.get(bookingPath)?.data.revision).toBe(2);

    const identity = resolveCommandIdempotencyIdentity(envelope('idem-replay-01', 1));
    expect(executor.snapshot().docs.has(identity.recordPath.slice(1))).toBe(true);
  });

  it('returns idempotency_conflict for the same key with a different fingerprint', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const handler = {
      execute: async () => commandSuccessResult('complete_booking', correlationId),
    };

    await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-conflict-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler,
    });

    const conflictEnvelope = envelope('idem-conflict-01', 1);
    conflictEnvelope.intent.bookingId = BookingIdSchema.parse('booking_idem_fn_02');

    const conflict = await executeIdempotentCanonicalCommand({
      envelope: conflictEnvelope,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler,
    });

    expect(conflict.status).toBe('error');
    if (conflict.status === 'error') {
      expect(conflict.error.code).toBe('idempotency_conflict');
    }
  });

  it('returns idempotency_conflict for the same key with a different command kind', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const handler = {
      execute: async () => commandSuccessResult('complete_booking', correlationId),
    };

    await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-conflict-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler,
    });

    const conflictEnvelope: CommandEnvelope<'reschedule_booking'> = {
      kind: 'reschedule_booking',
      context: envelope('idem-conflict-01').context,
      intent: { bookingId: BookingIdSchema.parse('booking_idem_fn_01') },
    };

    const conflict = await executeIdempotentCanonicalCommand({
      envelope: conflictEnvelope,
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        execute: async () => commandSuccessResult('reschedule_booking', correlationId),
      },
    });

    expect(conflict.status).toBe('error');
    if (conflict.status === 'error') {
      expect(conflict.error.code).toBe('idempotency_conflict');
    }
  });

  it('rejects stale revisions without mutating the aggregate or storing idempotency', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 5, status: 'confirmed' },
    });
    let handlerCalls = 0;

    const result = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-stale-01', 4),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler: {
        execute: async () => {
          handlerCalls += 1;
          return commandSuccessResult('complete_booking', correlationId);
        },
      },
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('stale_version');
      expect(result.error.currentRevision).toBe(5);
    }
    expect(handlerCalls).toBe(0);
    expect(executor.snapshot().docs.get(bookingPath)?.data.revision).toBe(5);

    const identity = resolveCommandIdempotencyIdentity(envelope('idem-stale-01', 4));
    expect(executor.snapshot().docs.has(identity.recordPath.slice(1))).toBe(false);
  });

  it('persists deterministic rejections for replay but not retryable internal failures', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor();
    const deterministic: CommandResult<'complete_booking'> = commandErrorResult(
      'complete_booking',
      correlationId,
      new CanonicalCommandError('forbidden', { correlationId }).toTransport()
    );

    const rejected = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-reject-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: { execute: async () => deterministic },
    });
    const replay = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-reject-01'),
      environment: environment('2026-01-02T00:00:00.000Z'),
      executor,
      handler: {
        execute: async () => commandSuccessResult('complete_booking', correlationId),
      },
    });

    expect(rejected).toEqual(deterministic);
    expect(replay).toEqual(deterministic);

    const transient = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-internal-01'),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      handler: {
        execute: async () =>
          commandErrorResult(
            'complete_booking',
            correlationId,
            new CanonicalCommandError('internal', { correlationId }).toTransport()
          ),
      },
    });
    const retryAfterTransient = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-internal-01'),
      environment: environment('2026-01-02T00:00:00.000Z'),
      executor,
      handler: {
        execute: async () => commandSuccessResult('complete_booking', correlationId),
      },
    });

    expect(transient.status).toBe('error');
    expect(retryAfterTransient.status).toBe('success');
  });

  it('aborts the transaction when a handler returns a retryable error after writes were staged', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      [bookingPath]: { revision: 1, status: 'confirmed' },
    });

    const transient = await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-transient-abort-01', 1),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler: {
        execute: async (session) => {
          session.tx.update({ path: bookingPath }, { revision: 99, status: 'broken' });
          return commandErrorResult(
            'complete_booking',
            correlationId,
            new CanonicalCommandError('internal', { correlationId }).toTransport()
          );
        },
      },
    });

    expect(transient.status).toBe('error');
    expect(executor.snapshot().docs.get(bookingPath)?.data.revision).toBe(1);
  });

  it('does not double-increment revision when the transaction callback is retried', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      { [bookingPath]: { revision: 1, status: 'confirmed' } },
      { simulateRetry: true }
    );
    let attempt = 0;

    await executeIdempotentCanonicalCommand({
      envelope: envelope('idem-retry-01', 1),
      environment: environment('2026-01-01T00:00:00.000Z'),
      executor,
      revisionTarget: { ref: { path: bookingPath }, requireExpectedRevision: true },
      handler: {
        execute: async (session, ctx) => {
          attempt += 1;
          if (attempt === 1) {
            throw new CanonicalCommandError('concurrent_modification', { correlationId });
          }
          session.tx.update(
            { path: bookingPath },
            { revision: ctx.nextRevision(AggregateRevisionSchema.parse(1)), status: 'completed' }
          );
          return commandSuccessResult('complete_booking', correlationId);
        },
      },
    });

    expect(attempt).toBe(2);
    expect(executor.snapshot().docs.get(bookingPath)?.data.revision).toBe(2);
  });
});
