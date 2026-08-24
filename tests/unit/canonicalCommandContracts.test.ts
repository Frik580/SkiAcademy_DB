import { describe, expect, it } from 'vitest';
import {
  COMMAND_KINDS,
  CommandEnvelopeSchema,
  CommandIntentSchemaByKind,
  catalogExcludesGenericMutationCommands,
  containsForbiddenAuthoritativeFields,
  evaluateActorCapabilityPairing,
  evaluateCommandContextAuthorization,
  administratorCapabilityExercisedByAccount,
  accountCommandActor,
  guestCommandActor,
  providerCommandActor,
  systemCommandActor,
  findForbiddenAuthoritativeFields,
  isSourceCompatibleWithActorKind,
  parseCommandEnvelope,
  toCommandErrorTransport,
  CanonicalCommandError,
  CorrelationIdSchema,
  AccountIdSchema,
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  GuestSubjectIdSchema,
  SystemActorIdSchema,
  ProviderIdSchema,
} from '@ski-academy/shared-domain';

const correlationId = CorrelationIdSchema.parse('correlation_cmd_test_01');
const accountId = AccountIdSchema.parse('account_cmd_test_01');
const guestSubjectId = GuestSubjectIdSchema.parse('guest_cmd_test_01');
const systemActorId = SystemActorIdSchema.parse('system_scheduler_01');
const providerId = ProviderIdSchema.parse('provider_payment_01');

function baseContext(
  overrides: Partial<{
    actor: ReturnType<typeof accountCommandActor>;
    exercisedCapability:
      'account_owner' | 'administrator' | 'guest' | 'system' | 'provider_callback';
    source:
      'client_callable' | 'admin_callable' | 'guest_callable' | 'scheduler' | 'provider_callback';
  }> = {}
) {
  return {
    actor: overrides.actor ?? accountCommandActor(accountId),
    exercisedCapability: overrides.exercisedCapability ?? 'account_owner',
    idempotencyKey: 'idem-key-01',
    correlationId,
    source: overrides.source ?? 'client_callable',
  };
}

describe('closed command catalog', () => {
  it('declares only intent-oriented command kinds and excludes generic mutations', () => {
    expect(COMMAND_KINDS.length).toBeGreaterThan(20);
    expect(catalogExcludesGenericMutationCommands()).toBe(true);
    expect(COMMAND_KINDS).not.toContain('setStatus');
    expect(COMMAND_KINDS).not.toContain('patchBooking');
    expect(COMMAND_KINDS).not.toContain('adjustWallet');
  });

  it('provides a strict intent schema for every catalog kind', () => {
    for (const kind of COMMAND_KINDS) {
      expect(CommandIntentSchemaByKind[kind]).toBeDefined();
    }
  });
});

describe('command envelope validation', () => {
  it('accepts a valid envelope for a catalog command', () => {
    const envelope = {
      kind: 'complete_booking',
      context: baseContext(),
      intent: { bookingId: BookingIdSchema.parse('booking_cmd_test_01') },
    };
    expect(CommandEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(parseCommandEnvelope(envelope).success).toBe(true);
  });

  it('rejects unknown command kinds', () => {
    const envelope = {
      kind: 'patchBooking',
      context: baseContext(),
      intent: {},
    };
    expect(parseCommandEnvelope(envelope).success).toBe(false);
  });

  it('rejects caller-provided bookingOrigin in intent', () => {
    const envelope = {
      kind: 'create_confirmed_booking',
      context: baseContext(),
      intent: {
        bookingId: BookingIdSchema.parse('booking_cmd_test_02'),
        instructorId: InstructorIdSchema.parse('instructor_cmd_test_01'),
        participantIds: [ParticipantIdSchema.parse('participant_cmd_test_01')],
        bookingOrigin: 'admin',
      },
    };
    expect(containsForbiddenAuthoritativeFields(envelope.intent)).toBe(true);
    expect(parseCommandEnvelope(envelope).success).toBe(false);
    expect(findForbiddenAuthoritativeFields(envelope.intent)).toEqual([
      { path: 'bookingOrigin', field: 'bookingOrigin' },
    ]);
  });

  it('rejects caller-provided target lifecycle status fields', () => {
    const envelope = {
      kind: 'complete_booking',
      context: baseContext(),
      intent: {
        bookingId: BookingIdSchema.parse('booking_cmd_test_03'),
        targetLifecycleStatus: 'completed',
      },
    };
    expect(parseCommandEnvelope(envelope).success).toBe(false);
  });
});

describe('actor identity separate from capability', () => {
  it('allows an Account to exercise administrator capability without becoming an admin identity', () => {
    const context = {
      ...baseContext({
        exercisedCapability: 'administrator',
        source: 'admin_callable',
      }),
    };
    expect(evaluateActorCapabilityPairing(context.actor, context.exercisedCapability)).toBe(
      'authorized'
    );
    expect(administratorCapabilityExercisedByAccount(context)).toBe(true);
    expect(context.actor.kind).toBe('account');
    expect(context.actor).not.toHaveProperty('administrator');
  });

  it('forbids a system actor from exercising administrator capability', () => {
    const actor = systemCommandActor(systemActorId);
    expect(evaluateActorCapabilityPairing(actor, 'administrator')).toBe('forbidden');
    expect(evaluateActorCapabilityPairing(actor, 'system')).toBe('authorized');
  });

  it('keeps guest, system, and provider scopes structurally distinct', () => {
    expect(guestCommandActor(guestSubjectId).kind).toBe('guest');
    expect(systemCommandActor(systemActorId).kind).toBe('system');
    expect(providerCommandActor(providerId).kind).toBe('provider');
    expect(accountCommandActor(accountId).kind).toBe('account');
  });

  it('requires compatible transport source and actor kind', () => {
    expect(isSourceCompatibleWithActorKind('guest_callable', 'guest')).toBe(true);
    expect(isSourceCompatibleWithActorKind('guest_callable', 'account')).toBe(false);
    expect(isSourceCompatibleWithActorKind('scheduler', 'system')).toBe(true);
    expect(isSourceCompatibleWithActorKind('provider_callback', 'provider')).toBe(true);
  });

  it('evaluates full context authorization for account admin and guest flows', () => {
    expect(
      evaluateCommandContextAuthorization({
        ...baseContext({ exercisedCapability: 'administrator', source: 'admin_callable' }),
      })
    ).toBe('authorized');

    expect(
      evaluateCommandContextAuthorization({
        actor: guestCommandActor(guestSubjectId),
        exercisedCapability: 'guest',
        idempotencyKey: 'guest-idem',
        correlationId,
        source: 'guest_callable',
      })
    ).toBe('authorized');

    expect(
      evaluateCommandContextAuthorization({
        actor: systemCommandActor(systemActorId),
        exercisedCapability: 'administrator',
        idempotencyKey: 'system-idem',
        correlationId,
        source: 'scheduler',
      })
    ).toBe('forbidden');
  });
});

describe('stable public error boundary', () => {
  it('does not leak audit_integrity_violation through transport mapping', () => {
    const transport = new CanonicalCommandError('audit_integrity_violation', {
      correlationId,
    }).toTransport();
    expect(transport.code).toBe('internal');
    expect(transport.message).toBe('The operation could not be completed.');
  });

  it('maps unknown failures to internal without SDK leakage', () => {
    const transport = toCommandErrorTransport(
      new Error('Firestore: collection/path leaked'),
      correlationId
    );
    expect(transport.code).toBe('internal');
    expect(transport.message).not.toContain('Firestore');
    expect(transport.message).not.toContain('collection');
  });
});
