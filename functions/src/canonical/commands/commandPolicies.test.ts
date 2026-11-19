import { describe, expect, it, vi } from 'vitest';
import {
  AccountIdSchema,
  BookingIdSchema,
  CallableGuestCommandTransportSchema,
  COMMAND_KINDS,
  CorrelationIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  TestSessionIdSchema,
  accountCommandActor,
  commandSuccessResult,
  isTestSessionExistingIdentityBootstrap,
  isTestSessionStarterCreditBootstrapNoOp,
  resolveTestSessionCommandSupport,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createCanonicalCommands, createProductionCommandHandlers } from './canonicalCommands';
import { createAuthoritativeCommandClock } from './commandClock';
import {
  COMMAND_POLICIES,
  commandAccessModeMatchesInvocation,
  findCommandAccessMode,
  getCommandPolicy,
} from './commandPolicies';

describe('canonical command policy inventory', () => {
  it('covers each unique CommandKind and matches the production handler registry', () => {
    expect(COMMAND_KINDS).toHaveLength(103);
    expect(new Set(COMMAND_KINDS).size).toBe(COMMAND_KINDS.length);
    expect(Object.keys(COMMAND_POLICIES).sort()).toEqual([...COMMAND_KINDS].sort());

    const handlers = createProductionCommandHandlers({
      run: async () => {
        throw new Error('Inventory must never enter a transaction');
      },
    });
    const unavailable = COMMAND_KINDS.filter(
      (kind) => getCommandPolicy(kind)?.availability === 'unavailable'
    );
    expect(unavailable).toEqual(['complete_booking', 'record_booking_no_show']);
    expect(Object.keys(handlers).sort()).toEqual(
      COMMAND_KINDS.filter((kind) => !unavailable.includes(kind)).sort()
    );
    expect(Object.values(handlers).every((handler) => typeof handler === 'function')).toBe(true);
  });

  it('reuses the current TEST classification and permits only the existing bootstrap exceptions', () => {
    for (const kind of COMMAND_KINDS) {
      const policy = getCommandPolicy(kind)!;
      expect(policy.testSupport).toBe(resolveTestSessionCommandSupport(kind));
      expect(policy.testBootstrap === 'existing_self_identity').toBe(
        isTestSessionExistingIdentityBootstrap(kind)
      );
      expect(policy.testBootstrap === 'starter_credit_noop').toBe(
        isTestSessionStarterCreditBootstrapNoOp(kind)
      );
    }
  });

  it('allows only guest kinds backed by guest handlers', () => {
    const transportKinds = CallableGuestCommandTransportSchema.options.map(
      (schema) => schema.shape.kind.value
    );
    const policyKinds = COMMAND_KINDS.filter((kind) =>
      findCommandAccessMode(getCommandPolicy(kind)!, 'guest_callable', 'guest')
    );
    expect(transportKinds).toContain('withdraw_course_enrollment');
    expect(policyKinds.sort()).toEqual(
      transportKinds.filter((kind) => kind !== 'withdraw_course_enrollment').sort()
    );
  });

  it.each([
    'adjust_service_price',
    'change_booking_party',
    'rollback_unpaid_booking_party_additions',
    'create_instructor_relationship',
    'revoke_instructor_relationship',
  ] as const)('keeps the existing %s administrative branch outside callable routing', (kind) => {
    const mode = findCommandAccessMode(getCommandPolicy(kind)!, 'admin_callable', 'administrator');
    expect(mode).toMatchObject({ callable: 'server_only', identity: 'active_administrator' });
    const actor = accountCommandActor(AccountIdSchema.parse('account_policy_administrator'));
    expect(commandAccessModeMatchesInvocation(mode!, actor, 'server')).toBe(true);
    expect(commandAccessModeMatchesInvocation(mode!, actor, 'authenticated_callable')).toBe(false);
  });
});

describe('canonical command policy enforcement', () => {
  const clock = createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00Z'));
  const testScope = {
    dataScope: 'test',
    testSessionId: TestSessionIdSchema.parse('test_session_policy'),
  } as const;
  const bookingId = BookingIdSchema.parse('booking_policy_validation');
  const envelope: CommandEnvelope<'create_confirmed_booking'> = {
    kind: 'create_confirmed_booking',
    context: {
      actor: accountCommandActor(AccountIdSchema.parse('account_policy_validation')),
      source: 'client_callable',
      exercisedCapability: 'account_owner',
      idempotencyKey: 'policy-validation',
      correlationId: CorrelationIdSchema.parse('correlation_policy_validation'),
    },
    intent: {
      bookingId,
      instructorId: InstructorIdSchema.parse('instructor_policy_validation'),
      participantIds: [ParticipantIdSchema.parse('participant_policy_validation')],
    },
  };

  it.each(['account_owner', 'parent_guardian'] as const)(
    'dispatches valid booking %s context in LIVE and TEST and rejects instructor context',
    async (exercisedCapability) => {
      for (const scope of [{ dataScope: 'live' } as const, testScope]) {
        const handler = vi.fn(async () =>
          commandSuccessResult(envelope.kind, envelope.context.correlationId)
        );
        const commands = createCanonicalCommands(
          { create_confirmed_booking: handler },
          { clock, scope }
        );
        await expect(
          commands.execute(
            {
              ...envelope,
              context: { ...envelope.context, exercisedCapability },
            },
            'authenticated_callable'
          )
        ).resolves.toMatchObject({ status: 'success' });
        await expect(
          commands.execute(
            {
              ...envelope,
              context: { ...envelope.context, exercisedCapability: 'instructor' },
            },
            'authenticated_callable'
          )
        ).resolves.toMatchObject({
          status: 'error',
          error: { code: 'forbidden' },
        });
        expect(handler).toHaveBeenCalledTimes(1);
      }
    }
  );

  it('denies dispatch for an unknown command or missing runtime policy', async () => {
    const handler = vi.fn(async () =>
      commandSuccessResult(envelope.kind, envelope.context.correlationId)
    );
    const commands = createCanonicalCommands({ create_confirmed_booking: handler }, { clock });
    await expect(
      commands.execute({
        ...envelope,
        kind: 'constructor',
      } as unknown as typeof envelope)
    ).resolves.toMatchObject({
      status: 'error',
      error: { code: 'validation' },
    });
    const policy = COMMAND_POLICIES.create_confirmed_booking;
    Reflect.deleteProperty(COMMAND_POLICIES, 'create_confirmed_booking');
    try {
      await expect(commands.execute(envelope)).resolves.toMatchObject({
        status: 'error',
        error: { code: 'forbidden' },
      });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      COMMAND_POLICIES.create_confirmed_booking = policy;
    }
  });

  it.each(['complete_booking', 'record_booking_no_show'] as const)(
    'keeps %s unavailable even with a registered handler',
    async (kind) => {
      const handler = vi.fn(async () => {
        throw new Error('Unavailable handler ran');
      });
      const commands = createCanonicalCommands({ [kind]: handler }, { clock });
      await expect(
        commands.execute({ kind, context: envelope.context, intent: { bookingId } })
      ).resolves.toMatchObject({ status: 'error', error: { code: 'unavailable' } });
      expect(handler).not.toHaveBeenCalled();
    }
  );
});
