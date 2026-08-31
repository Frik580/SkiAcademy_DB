import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  AttendanceSchema,
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  activityLogIdFromCommandId,
  attendanceIdFromBookingIdentity,
  accountCommandActor,
  guestCommandActor,
  guestParticipantTransportMetadataFromProfile,
  guestSubjectIdFromBookingId,
  participantManagementIdFromGuestLink,
  paymentIdFromBookingId,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import { bookingClaimIdentities } from './bookingClaimOperations';

const correlationId = CorrelationIdSchema.parse('correlation_admin_guest_booking_link_01');
const instructorId = InstructorIdSchema.parse('instructor_admin_guest_booking_link_01');
const guestParticipantId = ParticipantIdSchema.parse('participant_admin_guest_booking_link_guest');
const managedParticipantId = ParticipantIdSchema.parse(
  'participant_admin_guest_booking_link_managed'
);
const dependentParticipantId = ParticipantIdSchema.parse(
  'participant_admin_guest_booking_link_dependent'
);
const bookingId = BookingIdSchema.parse('booking_admin_guest_booking_link_01');
const paymentId = paymentIdFromBookingId(bookingId);
const guestSubjectId = guestSubjectIdFromBookingId(bookingId);
const adminAccountId = AccountIdSchema.parse('account_admin_guest_booking_link_admin');
const targetAccountId = AccountIdSchema.parse('account_admin_guest_booking_link_target');
const managementId = participantManagementIdFromGuestLink({
  participantId: managedParticipantId,
  accountId: targetAccountId,
});
const dependentManagementId = participantManagementIdFromGuestLink({
  participantId: dependentParticipantId,
  accountId: targetAccountId,
});
const tokenSecret = 'admin-guest-booking-link-unit-secret';
const decidedAt = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));

function environment(at = '2026-01-01T10:00:00.000Z') {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function seedAccount(accountId: typeof adminAccountId) {
  return AccountSchema.parse({
    accountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_account',
      lastChangedByCommandId: 'command_seed_account',
      correlationId,
    },
  });
}

function seedGuestParticipant() {
  return {
    participantId: guestParticipantId,
    displayName: 'Guest Link Source',
    age: { kind: 'age_years', years: 25 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'unmanaged_guest' },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_participant',
      lastChangedByCommandId: 'command_seed_participant',
      correlationId,
    },
  };
}

function seedManagedParticipant(
  participantId: typeof managedParticipantId,
  managementParticipantId: typeof managementId,
  authority: 'self' | 'parent_guardian' = 'self'
) {
  return {
    participant: {
      participantId,
      displayName: authority === 'self' ? 'Canonical Self' : 'Canonical Dependent',
      age: { kind: 'age_years', years: authority === 'self' ? 28 : 12 },
      skillLevel: 'beginner',
      discipline: 'ski',
      management: { kind: 'managed', participantManagementId: managementParticipantId },
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_managed',
        lastChangedByCommandId: 'command_seed_managed',
        correlationId,
      },
    },
    management: {
      participantManagementId: managementParticipantId,
      participantId,
      accountId: targetAccountId,
      role: 'owner',
      authority,
      status: 'active',
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_management',
        lastChangedByCommandId: 'command_seed_management',
        correlationId,
      },
    },
  };
}

function baseFixture(extra: Record<string, unknown> = {}) {
  const self = seedManagedParticipant(managedParticipantId, managementId, 'self');
  const dependent = seedManagedParticipant(
    dependentParticipantId,
    dependentManagementId,
    'parent_guardian'
  );
  return {
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Admin Link Coach',
      pricePerHourKZT: 12_000,
      isAvailable: true,
    },
    [`participants/${guestParticipantId}`]: seedGuestParticipant(),
    [`participants/${managedParticipantId}`]: self.participant,
    [`participants/${dependentParticipantId}`]: dependent.participant,
    [`participant_management/${managementId}`]: self.management,
    [`participant_management/${dependentManagementId}`]: dependent.management,
    [`users/${adminAccountId}`]: seedAccount(adminAccountId),
    [`users/${targetAccountId}`]: seedAccount(targetAccountId),
    ...extra,
  };
}

function cloneDocs(
  snapshot: ReturnType<ReturnType<typeof createInMemoryCanonicalTransactionExecutor>['snapshot']>
): Record<string, Record<string, unknown>> {
  const docs: Record<string, Record<string, unknown>> = {};
  for (const [path, document] of snapshot.docs) {
    docs[path] = { ...(document.data as Record<string, unknown>) };
  }
  return docs;
}

function guestCreateEnvelope(): CommandEnvelope<'create_guest_booking_request'> {
  return {
    kind: 'create_guest_booking_request',
    context: {
      actor: guestCommandActor(guestSubjectId),
      exercisedCapability: 'guest',
      idempotencyKey: 'admin-guest-booking-create-01',
      correlationId,
      source: 'guest_callable',
      calendarInput: {
        localDate: '2026-01-15',
        localTime: '09:00',
        durationMinutes: 60,
      },
      timezone: 'Asia/Almaty',
      transportMetadata: guestParticipantTransportMetadataFromProfile({
        displayName: 'Guest Link Source',
        skillLevel: 'beginner',
        discipline: 'ski',
        ageYears: 25,
      }),
    },
    intent: {
      bookingId,
      instructorId,
      participantIds: [guestParticipantId],
    },
  };
}

function adminLinkEnvelope(
  overrides: Partial<CommandEnvelope<'link_guest_booking_to_account_as_administrator'>> = {}
): CommandEnvelope<'link_guest_booking_to_account_as_administrator'> {
  return {
    kind: 'link_guest_booking_to_account_as_administrator',
    context: {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator',
      idempotencyKey: 'admin-guest-booking-link-01',
      correlationId,
      source: 'admin_callable',
      expectedRevision: AggregateRevisionSchema.parse(1),
      ...overrides.context,
    },
    intent: {
      bookingId,
      targetAccountId,
      targetParticipantId: managedParticipantId,
      reasonExplanation: 'Guest is the existing managed Participant',
      ...overrides.intent,
    },
  };
}

function runCommands(
  executor: ReturnType<typeof createInMemoryCanonicalTransactionExecutor>,
  at = '2026-01-01T10:00:00.000Z'
) {
  return createProductionCanonicalCommands(environment(at), executor, {
    guestActionTokenSecret: tokenSecret,
  });
}

async function createGuestBooking(
  extra: Record<string, unknown> = {}
): Promise<ReturnType<typeof createInMemoryCanonicalTransactionExecutor>> {
  const executor = createInMemoryCanonicalTransactionExecutor(baseFixture(extra));
  const created = await runCommands(executor).execute(guestCreateEnvelope());
  expect(created.status).toBe('success');
  return executor;
}

describe('link_guest_booking_to_account_as_administrator', () => {
  it('replaces the unique guest occurrence with an existing managed Participant and migrates claims atomically', async () => {
    const executor = await createGuestBooking();
    const before = cloneDocs(executor.snapshot());
    const paymentBefore = before[`payments/${paymentId}`];
    const bookingBefore = before[`bookings/${bookingId}`];
    const occurrenceId = bookingBefore.occurrence.occurrenceId as string;
    const guestClaimId = bookingClaimIdentities({
      bookingId,
      occurrenceId,
      instructorId,
      participantId: guestParticipantId,
    }).participantClaimId;
    const targetClaimId = bookingClaimIdentities({
      bookingId,
      occurrenceId,
      instructorId,
      participantId: managedParticipantId,
    }).participantClaimId;

    const envelope = adminLinkEnvelope();
    const result = await runCommands(executor).execute(envelope);
    expect(result.status).toBe('success');

    const snapshot = executor.snapshot();
    const booking = snapshot.docs.get(`bookings/${bookingId}`)?.data;
    expect(booking?.party.participantIds).toEqual([managedParticipantId]);
    expect(booking?.occurrence.serviceParty.participantIds).toEqual([managedParticipantId]);
    expect(booking?.occurrence.serviceParty).not.toHaveProperty('frozenAt');
    expect(booking?.attribution).toEqual(bookingBefore.attribution);
    expect(booking?.lifecycle).toEqual(bookingBefore.lifecycle);
    expect(booking?.paymentId).toBe(paymentId);
    expect(snapshot.docs.get(`participants/${guestParticipantId}`)?.data.management).toEqual({
      kind: 'unmanaged_guest',
    });
    expect(snapshot.docs.get(`participants/${managedParticipantId}`)?.data.management.kind).toBe(
      'managed'
    );
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data).toMatchObject({
      price: paymentBefore.price,
      paidAmount: paymentBefore.paidAmount,
      paymentStatus: paymentBefore.paymentStatus,
    });
    expect(snapshot.docs.get(`payments/${paymentId}`)?.data).not.toHaveProperty('payerAccountId');
    expect(snapshot.docs.get(`resource_claims/${guestClaimId}`)?.data.lifecycle.status).toBe(
      'released'
    );
    expect(snapshot.docs.get(`resource_claims/${targetClaimId}`)?.data.lifecycle.status).toBe(
      'active'
    );
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('bookings/')).length
    ).toBe(1);
    expect(
      snapshot.docs.has(
        `activity_logs/${activityLogIdFromCommandId(
          resolveCommandIdempotencyIdentity(envelope).commandKey
        )}`
      )
    ).toBe(true);
  });

  it('links a parent_guardian managed Participant without creating management', async () => {
    const executor = await createGuestBooking();
    const result = await runCommands(executor).execute(
      adminLinkEnvelope({
        context: {
          actor: accountCommandActor(adminAccountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'admin-guest-booking-link-dependent',
          correlationId,
          source: 'admin_callable',
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
        intent: {
          bookingId,
          targetAccountId,
          targetParticipantId: dependentParticipantId,
          reasonExplanation: 'Guest is the existing dependent',
        },
      })
    );
    expect(result.status).toBe('success');
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.party.participantIds).toEqual([
      dependentParticipantId,
    ]);
    expect(
      [...snapshot.docs.keys()].filter((path) => path.startsWith('participant_management/')).length
    ).toBe(2);
  });

  it('replays the same delivery exactly once', async () => {
    const executor = await createGuestBooking();
    const envelope = adminLinkEnvelope();
    const commands = runCommands(executor);
    expect((await commands.execute(envelope)).status).toBe('success');
    expect((await commands.execute(envelope)).status).toBe('success');
    expect(
      [...executor.snapshot().docs.keys()].filter((path) => path.startsWith('bookings/')).length
    ).toBe(1);
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.revision).toBe(2);
  });

  it('rejects a new attempt after the guest occurrence is already linked', async () => {
    const executor = await createGuestBooking();
    const commands = runCommands(executor);
    expect((await commands.execute(adminLinkEnvelope())).status).toBe('success');
    const relink = await commands.execute(
      adminLinkEnvelope({
        context: {
          actor: accountCommandActor(adminAccountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'admin-guest-booking-link-02',
          correlationId,
          source: 'admin_callable',
          expectedRevision: AggregateRevisionSchema.parse(2),
        },
      })
    );
    expect(relink.status).toBe('error');
    if (relink.status === 'error') {
      expect(relink.error.code).toBe('validation');
    }
  });

  it('refuses a stale Booking revision', async () => {
    const executor = await createGuestBooking();
    const result = await runCommands(executor).execute(
      adminLinkEnvelope({
        context: {
          actor: accountCommandActor(adminAccountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'admin-guest-booking-link-stale',
          correlationId,
          source: 'admin_callable',
          expectedRevision: AggregateRevisionSchema.parse(9),
        },
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('stale_version');
    }
  });

  it('denies a non-administrator actor', async () => {
    const executor = await createGuestBooking();
    const result = await runCommands(executor).execute(
      adminLinkEnvelope({
        context: {
          actor: accountCommandActor(targetAccountId),
          exercisedCapability: 'account_owner',
          idempotencyKey: 'admin-guest-booking-link-owner',
          correlationId,
          source: 'client_callable',
          expectedRevision: AggregateRevisionSchema.parse(1),
        },
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('forbidden');
    }
  });

  it('rejects a disabled target Account', async () => {
    const executor = await createGuestBooking({
      [`users/${targetAccountId}`]: AccountSchema.parse({
        ...seedAccount(targetAccountId),
        lifecycle: { status: 'disabled', disabledAt: decidedAt },
      }),
    });
    const result = await runCommands(executor).execute(adminLinkEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('invalid_transition');
    }
  });

  it('rejects an archived or unmanaged target Participant and ended management', async () => {
    const archived = await createGuestBooking({
      [`participants/${managedParticipantId}`]: {
        ...seedManagedParticipant(managedParticipantId, managementId).participant,
        lifecycle: { status: 'archived', archivedAt: decidedAt },
      },
    });
    const archivedResult = await runCommands(archived).execute(adminLinkEnvelope());
    expect(archivedResult.status).toBe('error');

    const unmanaged = await createGuestBooking({
      [`participants/${managedParticipantId}`]: {
        ...seedManagedParticipant(managedParticipantId, managementId).participant,
        management: { kind: 'unmanaged_guest' },
      },
    });
    const unmanagedResult = await runCommands(unmanaged).execute(adminLinkEnvelope());
    expect(unmanagedResult.status).toBe('error');
    if (unmanagedResult.status === 'error') {
      expect(unmanagedResult.error.code).toBe('forbidden');
    }

    const ended = await createGuestBooking({
      [`participant_management/${managementId}`]: {
        ...seedManagedParticipant(managedParticipantId, managementId).management,
        status: 'ended',
        endedAt: decidedAt,
      },
    });
    const endedResult = await runCommands(ended).execute(adminLinkEnvelope());
    expect(endedResult.status).toBe('error');
    if (endedResult.status === 'error') {
      expect(endedResult.error.code).toBe('forbidden');
    }
  });

  it('fails closed when Attendance already exists for the guest occurrence', async () => {
    const created = await createGuestBooking();
    const booking = created.snapshot().docs.get(`bookings/${bookingId}`)?.data;
    const occurrenceId = OccurrenceIdSchema.parse(booking?.occurrence.occurrenceId);
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId,
      participantId: guestParticipantId,
    });
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...cloneDocs(created.snapshot()),
      [`attendance/${attendanceId}`]: AttendanceSchema.parse({
        attendanceId,
        subject: {
          subjectKind: 'booking',
          bookingId,
          occurrenceId,
          participantId: guestParticipantId,
        },
        attendanceStatus: 'present',
        recordedBy: { kind: 'instructor', instructorId },
        recordedAt: decidedAt,
        lastChangedBy: { kind: 'instructor', instructorId },
        updatedAt: decidedAt,
        revision: 1,
        correlationId,
      }),
    });
    const result = await runCommands(executor).execute(adminLinkEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('invalid_transition');
    }
  });

  it('does not allow Admin linking after self-service promotion, and self-service cannot relink after Admin replace', async () => {
    const promoted = await createGuestBooking();
    const promote = await runCommands(promoted).execute({
      kind: 'link_guest_booking_to_account',
      context: {
        actor: accountCommandActor(targetAccountId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'self-service-guest-booking-link',
        correlationId,
        source: 'client_callable',
        expectedRevision: AggregateRevisionSchema.parse(1),
      },
      intent: { bookingId, participantId: guestParticipantId },
    });
    expect(promote.status).toBe('success');
    const afterPromote = await runCommands(promoted).execute(
      adminLinkEnvelope({
        context: {
          actor: accountCommandActor(adminAccountId),
          exercisedCapability: 'administrator',
          idempotencyKey: 'admin-after-self-service',
          correlationId,
          source: 'admin_callable',
          expectedRevision: AggregateRevisionSchema.parse(2),
        },
      })
    );
    expect(afterPromote.status).toBe('error');

    const replaced = await createGuestBooking();
    expect((await runCommands(replaced).execute(adminLinkEnvelope())).status).toBe('success');
    const afterAdmin = await runCommands(replaced).execute({
      kind: 'link_guest_booking_to_account',
      context: {
        actor: accountCommandActor(targetAccountId),
        exercisedCapability: 'account_owner',
        idempotencyKey: 'self-service-after-admin',
        correlationId,
        source: 'client_callable',
        expectedRevision: AggregateRevisionSchema.parse(2),
      },
      intent: { bookingId, participantId: guestParticipantId },
    });
    expect(afterAdmin.status).toBe('error');
  });

  it('fails closed when a party Participant document is missing', async () => {
    const created = await createGuestBooking();
    const docs = cloneDocs(created.snapshot());
    delete docs[`participants/${guestParticipantId}`];
    const executor = createInMemoryCanonicalTransactionExecutor(docs);
    const result = await runCommands(executor).execute(adminLinkEnvelope());
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('validation');
    }
  });
});
