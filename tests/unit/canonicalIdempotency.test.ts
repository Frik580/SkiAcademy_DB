import { describe, expect, it } from 'vitest';
import {
  accountCommandActor,
  AccountIdSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  buildProviderCallbackIdempotencyKey,
  buildScheduledCommandIdempotencyKey,
  canonicalJsonStringify,
  CanonicalCommandError,
  computeCommandFingerprint,
  computeCommandFingerprintFromEnvelope,
  deriveCommandKey,
  encodeCommandActorScope,
  guestCommandActor,
  GuestSubjectIdSchema,
  IdempotencyKeySchema,
  resolveCommandIdempotencyIdentity,
  shouldPersistIdempotencyOutcome,
  systemCommandActor,
  SystemActorIdSchema,
  assertExpectedRevision,
  nextAggregateRevision,
  CorrelationIdSchema,
  commandSuccessResult,
  commandErrorResult,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';

const accountId = AccountIdSchema.parse('account_idem_unit_01');
const guestSubjectId = GuestSubjectIdSchema.parse('guest_idem_unit_01');
const systemActorId = SystemActorIdSchema.parse('system_idem_unit_01');
const correlationId = CorrelationIdSchema.parse('correlation_idem_unit_01');

function baseEnvelope(
  overrides: Partial<CommandEnvelope<'complete_booking'>['context']> = {},
  intentOverrides: Partial<CommandEnvelope<'complete_booking'>['intent']> = {}
): CommandEnvelope<'complete_booking'> {
  return {
    kind: 'complete_booking',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: IdempotencyKeySchema.parse('idem-unit-01'),
      correlationId,
      source: 'client_callable',
      ...overrides,
    },
    intent: {
      bookingId: BookingIdSchema.parse('booking_idem_unit_01'),
      ...intentOverrides,
    },
  };
}

describe('command actor scope and identity', () => {
  it('scopes command keys by actor without embedding personal data', () => {
    const accountScope = encodeCommandActorScope(accountCommandActor(accountId));
    const guestScope = encodeCommandActorScope(guestCommandActor(guestSubjectId));

    expect(accountScope).toContain(accountId);
    expect(accountScope).not.toMatch(/@/);
    expect(deriveCommandKey(accountScope, 'idem-unit-01')).not.toBe(
      deriveCommandKey(guestScope, 'idem-unit-01')
    );
  });

  it('rejects malformed idempotency keys', () => {
    expect(IdempotencyKeySchema.safeParse('has space').success).toBe(false);
    expect(IdempotencyKeySchema.safeParse('').success).toBe(false);
  });

  it('builds scheduled and provider idempotency keys from opaque identifiers', () => {
    const scheduled = buildScheduledCommandIdempotencyKey({
      systemActorId,
      commandKind: 'enforce_payment_start_gate',
      subjectId: 'booking_sched_01',
      occurrenceId: 'occurrence_sched_01',
    });
    const provider = buildProviderCallbackIdempotencyKey('provider_evt_01');

    expect(IdempotencyKeySchema.safeParse(scheduled).success).toBe(true);
    expect(IdempotencyKeySchema.safeParse(provider).success).toBe(true);
    expect(scheduled).not.toMatch(/@/);
  });
});

describe('command fingerprinting', () => {
  it('produces the same fingerprint for equivalent semantic payloads', () => {
    const envelopeA = baseEnvelope();
    const envelopeB = baseEnvelope();

    const reorderedIntent = {
      bookingId: envelopeA.intent.bookingId,
    };

    const fingerprintA = computeCommandFingerprintFromEnvelope(envelopeA);
    const fingerprintB = computeCommandFingerprint({
      kind: 'complete_booking',
      exercisedCapability: 'account_owner',
      intent: reorderedIntent,
    });

    expect(fingerprintA).toBe(fingerprintB);
    expect(fingerprintA).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes fingerprint when a semantic field changes', () => {
    const left = computeCommandFingerprintFromEnvelope(baseEnvelope());
    const right = computeCommandFingerprintFromEnvelope(
      baseEnvelope({}, { bookingId: BookingIdSchema.parse('booking_idem_unit_02') })
    );

    expect(left).not.toBe(right);
  });

  it('canonicalizes object key order', () => {
    const left = canonicalJsonStringify({ b: 1, a: 2 });
    const right = canonicalJsonStringify({ a: 2, b: 1 });
    expect(left).toBe(right);
  });

  it('excludes transport-only context from fingerprint material', () => {
    const baseline = computeCommandFingerprintFromEnvelope(baseEnvelope());
    const withTransport = computeCommandFingerprintFromEnvelope(
      baseEnvelope({
        transportMetadata: { client_platform: 'web' },
        causationId: CorrelationIdSchema.parse('causation_idem_unit_01'),
      })
    );

    expect(baseline).toBe(withTransport);
  });
});

describe('revision concurrency helpers', () => {
  const revision = AggregateRevisionSchema.parse(3);

  it('allows matching expected revisions', () => {
    expect(() =>
      assertExpectedRevision({
        correlationId,
        expectedRevision: revision,
        currentRevision: revision,
      })
    ).not.toThrow();
  });

  it('rejects stale expected revisions with current revision details', () => {
    try {
      assertExpectedRevision({
        correlationId,
        expectedRevision: AggregateRevisionSchema.parse(2),
        currentRevision: revision,
      });
      throw new Error('expected stale_version');
    } catch (error) {
      expect(error).toBeInstanceOf(CanonicalCommandError);
      if (error instanceof CanonicalCommandError) {
        expect(error.code).toBe('stale_version');
        expect(error.currentRevision).toBe(revision);
      }
    }
  });

  it('increments revisions exactly once per helper call', () => {
    expect(nextAggregateRevision(revision)).toBe(AggregateRevisionSchema.parse(4));
  });
});

describe('idempotency outcome persistence policy', () => {
  it('persists successful and deterministic rejections but not retryable internal failures', () => {
    const success = commandSuccessResult('complete_booking', correlationId);
    const deterministic = commandErrorResult(
      'complete_booking',
      correlationId,
      new CanonicalCommandError('forbidden', { correlationId }).toTransport()
    );
    const transient = commandErrorResult(
      'complete_booking',
      correlationId,
      new CanonicalCommandError('internal', { correlationId }).toTransport()
    );

    expect(shouldPersistIdempotencyOutcome(success)).toBe(true);
    expect(shouldPersistIdempotencyOutcome(deterministic)).toBe(true);
    expect(shouldPersistIdempotencyOutcome(transient)).toBe(false);
  });

  it('resolves stable command idempotency identity for an envelope', () => {
    const identity = resolveCommandIdempotencyIdentity(baseEnvelope());
    expect(identity.recordPath).toMatch(/^\/command_idempotency\//);
    expect(identity.commandKey).toBeTruthy();
    expect(identity.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});
