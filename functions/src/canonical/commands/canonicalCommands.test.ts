import { describe, expect, it } from 'vitest';
import {
  accountCommandActor,
  commandSuccessResult,
  CorrelationIdSchema,
  AccountIdSchema,
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  systemCommandActor,
  SystemActorIdSchema,
  type CommandEnvelope,
  type CommandExecutionEnvironment,
  type CommandResult,
} from '@ski-academy/shared-domain';
import {
  buildCommandEnvelopeFromCallable,
  createAuthoritativeCommandClock,
  createCanonicalCommands,
  createProductionCanonicalCommands,
  mapCommandErrorTransportToHttpsError,
  rethrowCanonicalCommandErrorAsHttps,
} from './index';

const correlationId = CorrelationIdSchema.parse('correlation_fn_cmd_01');
const accountId = AccountIdSchema.parse('account_fn_cmd_01');
const systemActorId = SystemActorIdSchema.parse('system_fn_cmd_01');

function testEnvironment(at: string): CommandExecutionEnvironment {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function accountEnvelope(
  kind: 'complete_booking' = 'complete_booking',
  capability: 'account_owner' | 'administrator' = 'account_owner',
  source: 'client_callable' | 'admin_callable' = 'client_callable'
): CommandEnvelope<typeof kind> {
  return {
    kind,
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: capability,
      idempotencyKey: 'idem-fn-01',
      correlationId,
      source,
    },
    intent: { bookingId: BookingIdSchema.parse('booking_fn_cmd_01') },
  };
}

describe('CanonicalCommands.execute', () => {
  it('leaves complete_booking unregistered so attendance commands own completion', async () => {
    const commands = createProductionCanonicalCommands(
      testEnvironment('2026-01-01T00:00:00.000Z'),
      {
        run: async () => {
          throw new Error('executor must not run for an unregistered command');
        },
      } as never
    );
    const result = await commands.execute(accountEnvelope('complete_booking'));
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('returns unavailable for catalog commands without registered handlers', async () => {
    const commands = createCanonicalCommands({}, testEnvironment('2026-01-01T00:00:00.000Z'));
    const result = await commands.execute(accountEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('unavailable');
    }
  });

  it('dispatches to registered handlers through the canonical seam', async () => {
    const environment = testEnvironment('2026-06-01T12:00:00.000Z');
    const commands = createCanonicalCommands(
      {
        complete_booking: async (envelope, env) => {
          expect(env.clock.decidedAt().toISOString()).toBe('2026-06-01T12:00:00.000Z');
          return commandSuccessResult(envelope.kind, envelope.context.correlationId);
        },
      },
      environment
    );

    const result = await commands.execute(accountEnvelope());
    expect(result).toEqual({
      status: 'success',
      kind: 'complete_booking',
      correlationId,
    });
  });

  it('rejects forged system administrator context at the authorization boundary', async () => {
    const commands = createCanonicalCommands({}, testEnvironment('2026-01-01T00:00:00.000Z'));
    const envelope: CommandEnvelope<'complete_booking'> = {
      kind: 'complete_booking',
      context: {
        actor: systemCommandActor(systemActorId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'system-idem',
        correlationId,
        source: 'scheduler',
      },
      intent: { bookingId: BookingIdSchema.parse('booking_fn_cmd_02') },
    };
    const result = await commands.execute(envelope);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }
  });

  it('rejects envelopes with forbidden authoritative intent fields', async () => {
    const commands = createCanonicalCommands({}, testEnvironment('2026-01-01T00:00:00.000Z'));
    const envelope = {
      kind: 'create_confirmed_booking' as const,
      context: {
        actor: accountCommandActor(accountId),
        exercisedCapability: 'account_owner' as const,
        idempotencyKey: 'idem-forbidden',
        correlationId,
        source: 'client_callable' as const,
      },
      intent: {
        bookingId: BookingIdSchema.parse('booking_fn_cmd_03'),
        instructorId: InstructorIdSchema.parse('instructor_fn_cmd_01'),
        participantIds: [ParticipantIdSchema.parse('participant_fn_cmd_01')],
        bookingOrigin: 'account' as const,
      },
    };
    const result = await commands.execute(envelope);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('validation');
    }
  });

  it('returns validation without throwing when correlationId is missing', async () => {
    const commands = createCanonicalCommands({}, testEnvironment('2026-01-01T00:00:00.000Z'));
    const result = await commands.execute({
      kind: 'complete_booking',
      context: {
        actor: accountCommandActor(accountId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'missing-correlation',
        correlationId: undefined as unknown as typeof correlationId,
        source: 'client_callable',
      },
      intent: { bookingId: BookingIdSchema.parse('booking_fn_cmd_06') },
    });

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('validation');
      expect(result.correlationId).toBe('correlation_malformed_envelope');
    }
  });
});

describe('callable transport adapter', () => {
  it('builds canonical envelope from callable transport input', () => {
    const envelope = buildCommandEnvelopeFromCallable(
      {
        accountId,
        capability: 'administrator',
        source: 'admin_callable',
      },
      {
        kind: 'create_confirmed_booking',
        idempotencyKey: 'callable-idem',
        correlationId,
        intent: {
          bookingId: BookingIdSchema.parse('booking_fn_cmd_04'),
          instructorId: InstructorIdSchema.parse('instructor_fn_cmd_02'),
          participantIds: [ParticipantIdSchema.parse('participant_fn_cmd_02')],
        },
      }
    );

    expect(envelope.kind).toBe('create_confirmed_booking');
    expect(envelope.context.actor).toEqual(accountCommandActor(accountId));
    expect(envelope.context.exercisedCapability).toBe('administrator');
    expect(envelope.context.source).toBe('admin_callable');
    expect(envelope.intent.bookingId).toBe('booking_fn_cmd_04');
    expect(envelope.context.transportMetadata).toEqual({ transport: 'firebase_callable' });
    expect(envelope.intent).not.toHaveProperty('bookingOrigin');
  });

  it('invokes CanonicalCommands.execute via adapter-assembled envelope', async () => {
    const envelope = buildCommandEnvelopeFromCallable(
      { accountId, capability: 'account_owner', source: 'client_callable' },
      {
        kind: 'complete_booking',
        idempotencyKey: 'adapter-idem',
        correlationId,
        intent: { bookingId: BookingIdSchema.parse('booking_fn_cmd_05') },
      }
    );

    const commands = createCanonicalCommands(
      {
        complete_booking: async () =>
          commandSuccessResult('complete_booking', correlationId) as CommandResult<'complete_booking'>,
      },
      testEnvironment('2026-01-02T00:00:00.000Z')
    );

    const result = await commands.execute(envelope);
    expect(result.status).toBe('success');
  });
});

describe('Https error mapping', () => {
  it('maps canonical validation errors without leaking internal codes', () => {
    const transport = {
      code: 'validation' as const,
      message: 'The request is invalid.',
      retryable: false,
      correlationId,
    };
    const httpsError = mapCommandErrorTransportToHttpsError(transport);
    expect(httpsError.code).toBe('invalid-argument');
    expect(httpsError.message).toBe('The request is invalid.');
  });

  it('sanitizes audit_integrity_violation through rethrow helper', () => {
    expect(() =>
      rethrowCanonicalCommandErrorAsHttps(
        new Error('audit_integrity_violation raw'),
        correlationId
      )
    ).toThrowError(expect.objectContaining({ code: 'internal' }));
  });
});
