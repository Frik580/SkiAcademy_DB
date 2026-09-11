import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AttendanceSchema,
  BookingIdSchema,
  BookingSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  accountCommandActor,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  instructorRelationshipExpiresAt,
  instructorRelationshipIdFromPair,
  paymentIdFromBookingId,
  timestampFromDate,
  type CommandEnvelope,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_progress_cmd_01');
const studentAccountId = AccountIdSchema.parse('account_progress_student_01');
const instructorAccountId = AccountIdSchema.parse('account_progress_instructor_01');
const otherInstructorAccountId = AccountIdSchema.parse('account_progress_instructor_02');
const participantId = ParticipantIdSchema.parse('participant_progress_cmd_01');
const childParticipantId = ParticipantIdSchema.parse('participant_progress_cmd_child');
const managementId = ParticipantManagementIdSchema.parse('management_progress_cmd_01');
const childManagementId = ParticipantManagementIdSchema.parse('management_progress_cmd_child');
const instructorId = InstructorIdSchema.parse('instructor_progress_cmd_01');
const otherInstructorId = InstructorIdSchema.parse('instructor_progress_cmd_02');
const relationshipId = instructorRelationshipIdFromPair({ participantId, instructorId });
const childRelationshipId = instructorRelationshipIdFromPair({
  participantId: childParticipantId,
  instructorId,
});
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function environment() {
  return { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) };
}

function seedAccount(accountId: typeof studentAccountId) {
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

function seedParticipant(
  id: typeof participantId,
  management: typeof managementId
) {
  return {
    participantId: id,
    displayName: id === childParticipantId ? 'Child' : 'Self',
    age: { kind: 'age_years', years: id === childParticipantId ? 8 : 30 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: management },
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

function seedManagement(
  id: typeof managementId,
  participant: typeof participantId,
  authority: 'self' | 'parent_guardian'
) {
  return {
    participantManagementId: id,
    participantId: participant,
    accountId: studentAccountId,
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
  };
}

function seedRelationship(
  id: typeof relationshipId,
  participant: typeof participantId,
  instructor: typeof instructorId,
  management: typeof managementId
) {
  return {
    instructorRelationshipId: id,
    participantId: participant,
    instructorId: instructor,
    basis: {
      kind: 'guardian_permission',
      participantManagementId: management,
      grantedByAccountId: studentAccountId,
    },
    validFrom: decidedAt,
    expiresAt: instructorRelationshipExpiresAt(decidedAt),
    status: 'active',
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed_relationship',
      lastChangedByCommandId: 'command_seed_relationship',
      correlationId,
    },
  };
}

function seedWorld() {
  return {
    [`users/${studentAccountId}`]: seedAccount(studentAccountId),
    [`users/${instructorAccountId}`]: {
      ...seedAccount(instructorAccountId),
      instructorId,
    },
    [`users/${otherInstructorAccountId}`]: {
      ...seedAccount(otherInstructorAccountId),
      instructorId: otherInstructorId,
    },
    [`instructors/${instructorId}`]: {
      id: instructorId,
      name: 'Coach Progress',
      pricePerHourKZT: 12_000,
      linkedAccountId: instructorAccountId,
    },
    [`instructors/${otherInstructorId}`]: {
      id: otherInstructorId,
      name: 'Other Coach',
      pricePerHourKZT: 11_000,
      linkedAccountId: otherInstructorAccountId,
    },
    [`participants/${participantId}`]: seedParticipant(participantId, managementId),
    [`participants/${childParticipantId}`]: seedParticipant(childParticipantId, childManagementId),
    [`participant_management/${managementId}`]: seedManagement(
      managementId,
      participantId,
      'self'
    ),
    [`participant_management/${childManagementId}`]: seedManagement(
      childManagementId,
      childParticipantId,
      'parent_guardian'
    ),
    [`instructor_relationships/${relationshipId}`]: seedRelationship(
      relationshipId,
      participantId,
      instructorId,
      managementId
    ),
    [`instructor_relationships/${childRelationshipId}`]: seedRelationship(
      childRelationshipId,
      childParticipantId,
      instructorId,
      childManagementId
    ),
  };
}

function envelope(
  input: {
    readonly actorAccountId?: typeof instructorAccountId;
    readonly participantId?: typeof participantId;
    readonly expectedRevision?: number;
    readonly idempotencyKey?: string;
    readonly level?: number;
    readonly skillScores?: Record<string, number>;
    readonly skillComments?: Record<string, string>;
    readonly capability?: 'instructor' | 'account_owner' | 'parent_guardian';
  } = {}
): CommandEnvelope<'update_participant_progress'> {
  return {
    kind: 'update_participant_progress',
    context: {
      actor: accountCommandActor(input.actorAccountId ?? instructorAccountId),
      exercisedCapability: input.capability ?? 'instructor',
      idempotencyKey: input.idempotencyKey ?? 'update-progress-01',
      correlationId,
      source: 'client_callable',
      ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
    },
    intent: {
      participantId: input.participantId ?? participantId,
      level: input.level ?? 2,
      skillScores: input.skillScores ?? { carving: 10 },
      skillComments: input.skillComments ?? { carving: 'Good edge' },
    },
  };
}

describe('participantProgressCommands', () => {
  it('lets an instructor with relationship authority create and then OCC-update progress', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const created = await commands.execute(envelope({ expectedRevision: 0 }));
    expect(created.status).toBe('success');
    if (created.status === 'success') {
      expect(created.payload).toMatchObject({ participantId, revision: 1 });
    }
    const updated = await commands.execute(
      envelope({
        expectedRevision: 1,
        idempotencyKey: 'update-progress-02',
        level: 3,
        skillScores: { carving: 20 },
      })
    );
    expect(updated.status).toBe('success');
    expect(executor.snapshot().docs.get(`participant_progress/${participantId}`)?.data).toMatchObject(
      {
        participantId,
        level: 3,
        skillScores: { carving: 20 },
        revision: 2,
      }
    );
  });

  it('creates revision 1 from a missing document and does not copy leftover /users progress', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`users/${studentAccountId}`]: {
        ...seedAccount(studentAccountId),
        level: 3,
        skillScores: { carving: 99 },
        skillComments: { carving: 'Legacy leftover' },
      },
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    const created = await commands.execute(envelope({ expectedRevision: 0, level: 2 }));
    expect(created.status).toBe('success');
    if (created.status === 'success') {
      expect(created.payload).toMatchObject({ participantId, revision: 1 });
    }
    expect(executor.snapshot().docs.get(`participant_progress/${participantId}`)?.data).toMatchObject(
      {
        participantId,
        level: 2,
        skillScores: { carving: 10 },
        skillComments: { carving: 'Good edge' },
        revision: 1,
      }
    );
    expect(
      executor.snapshot().docs.get(`participant_progress/${participantId}`)?.data.skillScores
    ).not.toEqual({ carving: 99 });
    expect(executor.snapshot().docs.get(`users/${studentAccountId}`)?.data).toMatchObject({
      level: 3,
      skillScores: { carving: 99 },
    });
  });

  it('rejects a stale expectedRevision and retries the same idempotency key', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(envelope({ expectedRevision: 0 }))).status).toBe('success');
    const stale = await commands.execute(
      envelope({ expectedRevision: 0, idempotencyKey: 'update-progress-stale' })
    );
    expect(stale.status).toBe('error');
    if (stale.status === 'error') expect(stale.error.code).toBe('stale_version');
    const replay = await commands.execute(envelope({ expectedRevision: 0 }));
    expect(replay.status).toBe('success');
    expect(executor.snapshot().docs.get(`participant_progress/${participantId}`)?.data).toMatchObject(
      { revision: 1, level: 2 }
    );
  });

  it('requires expectedRevision and instructor capability', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const missingRevision = await commands.execute(envelope());
    expect(missingRevision.status).toBe('error');
    if (missingRevision.status === 'error') expect(missingRevision.error.code).toBe('validation');
    const guardian = await commands.execute(
      envelope({
        expectedRevision: 0,
        capability: 'parent_guardian',
        actorAccountId: studentAccountId,
      })
    );
    expect(guardian.status).toBe('error');
    if (guardian.status === 'error') expect(guardian.error.code).toBe('forbidden');
  });

  it('denies an unrelated instructor', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({
        expectedRevision: 0,
        actorAccountId: otherInstructorAccountId,
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('keeps self and child progress isolated', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect(
      (await commands.execute(envelope({ expectedRevision: 0, level: 3 }))).status
    ).toBe('success');
    expect(
      (
        await commands.execute(
          envelope({
            participantId: childParticipantId,
            expectedRevision: 0,
            idempotencyKey: 'update-child-01',
            level: 2,
            skillScores: { skating: 8 },
            skillComments: { skating: 'Child note' },
          })
        )
      ).status
    ).toBe('success');
    expect(executor.snapshot().docs.get(`participant_progress/${participantId}`)?.data).toMatchObject(
      { level: 3, skillScores: { carving: 10 } }
    );
    expect(
      executor.snapshot().docs.get(`participant_progress/${childParticipantId}`)?.data
    ).toMatchObject({
      level: 2,
      skillScores: { skating: 8 },
      skillComments: { skating: 'Child note' },
    });
  });
});

const bookingId = BookingIdSchema.parse('booking_progress_cmd_01');
const occurrenceId = OccurrenceIdSchema.parse('occurrence_progress_cmd_01');
const lessonStartsAt = timestampFromDate(new Date('2025-12-31T09:00:00.000Z'));
const lessonEndsAt = timestampFromDate(new Date('2025-12-31T10:00:00.000Z'));
const futureStartsAt = timestampFromDate(new Date('2026-06-01T09:00:00.000Z'));
const futureEndsAt = timestampFromDate(new Date('2026-06-01T10:00:00.000Z'));

function seedWorldWithoutRelationships() {
  const world = seedWorld() as Record<string, unknown>;
  delete world[`instructor_relationships/${relationshipId}`];
  delete world[`instructor_relationships/${childRelationshipId}`];
  return world as ReturnType<typeof seedWorld>;
}

function seedBooking(input: {
  readonly status: 'confirmed' | 'completed' | 'no_show';
  readonly participantIds?: readonly ParticipantId[];
  readonly startsAt?: typeof lessonStartsAt;
  readonly endsAt?: typeof lessonEndsAt;
}) {
  const participantIds = input.participantIds ?? [participantId];
  const startsAt = input.startsAt ?? lessonStartsAt;
  const endsAt = input.endsAt ?? lessonEndsAt;
  const createdAt = timestampFromDate(new Date('2025-12-01T00:00:00.000Z'));
  const updatedAt = input.status === 'confirmed' ? createdAt : endsAt;
  return BookingSchema.parse({
    bookingId,
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId: studentAccountId },
    },
    party: {
      kind: participantIds.length === 1 ? 'individual' : 'family_group',
      participantIds,
    },
    occurrence: {
      occurrenceId,
      instructorId,
      interval: {
        startsAt,
        endsAt,
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds, frozenAt: startsAt },
    },
    lifecycle:
      input.status === 'completed'
        ? { status: 'completed', completedAt: endsAt }
        : input.status === 'no_show'
          ? { status: 'no_show', noShowAt: endsAt }
          : { status: 'confirmed' },
    paymentId: paymentIdFromBookingId(bookingId),
    revision: 1,
    createdAt,
    updatedAt,
    audit: {
      createdByCommandId: 'command_seed_booking',
      lastChangedByCommandId: 'command_seed_booking',
      correlationId,
    },
  });
}

function seedAttendance(targetParticipantId: ParticipantId, attendanceStatus: 'present' | 'absent') {
  const attendanceId = attendanceIdFromBookingIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'booking',
    occurrenceId,
    participantId: targetParticipantId,
  });
  return {
    path: `attendance/${attendanceId}`,
    data: AttendanceSchema.parse({
      attendanceId,
      subject: {
        subjectKind: 'booking',
        bookingId,
        occurrenceId,
        participantId: targetParticipantId,
      },
      attendanceStatus,
      recordedBy: { kind: 'instructor', instructorId },
      recordedAt: lessonEndsAt,
      lastChangedBy: { kind: 'instructor', instructorId },
      updatedAt: lessonEndsAt,
      revision: 1,
      correlationId,
    }),
  };
}

describe('participantProgressCommands booking-scoped evidence', () => {
  it('keeps active InstructorRelationship authority even when the only Booking is no_show', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'no_show' }) as unknown as Record<
        string,
        unknown
      >,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('success');
  });
  it('denies confirmed booking-based progress without present attendance after startsAt', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('allows confirmed booking-based progress after startsAt with present attendance', async () => {
    const present = seedAttendance(participantId, 'present');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
      [present.path]: present.data as unknown as Record<string, unknown>,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('success');
  });

  it('denies confirmed booking-based progress when attendance is absent', async () => {
    const absent = seedAttendance(participantId, 'absent');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
      [absent.path]: absent.data as unknown as Record<string, unknown>,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('keeps active InstructorRelationship authority without attendance facts', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('success');
  });

  it('keeps active InstructorRelationship authority when attendance is absent', async () => {
    const absent = seedAttendance(participantId, 'absent');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
      [absent.path]: absent.data as unknown as Record<string, unknown>,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('success');
  });

  it('denies confirmed booking-based evaluation before startsAt', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({
        status: 'confirmed',
        startsAt: futureStartsAt,
        endsAt: futureEndsAt,
      }) as unknown as Record<string, unknown>,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('does not treat no_show as booking-based progress authority', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'no_show' }) as unknown as Record<
        string,
        unknown
      >,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('keeps group present/absent progress authority participant-specific', async () => {
    const present = seedAttendance(participantId, 'present');
    const absent = seedAttendance(childParticipantId, 'absent');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({
        status: 'completed',
        participantIds: [participantId, childParticipantId],
      }) as unknown as Record<string, unknown>,
      [present.path]: present.data as unknown as Record<string, unknown>,
      [absent.path]: absent.data as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    const presentResult = await commands.execute(envelope({ expectedRevision: 0 }));
    expect(presentResult.status).toBe('success');
    const absentResult = await commands.execute(
      envelope({
        participantId: childParticipantId,
        expectedRevision: 0,
        idempotencyKey: 'update-absent-child',
      })
    );
    expect(absentResult.status).toBe('error');
    if (absentResult.status === 'error') expect(absentResult.error.code).toBe('forbidden');
  });

  it('denies booking-based progress for a sibling with missing attendance when another is present', async () => {
    const present = seedAttendance(participantId, 'present');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorldWithoutRelationships(),
      [`bookings/${bookingId}`]: seedBooking({
        status: 'completed',
        participantIds: [participantId, childParticipantId],
      }) as unknown as Record<string, unknown>,
      [present.path]: present.data as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(envelope({ expectedRevision: 0 }))).status).toBe('success');
    const missingSibling = await commands.execute(
      envelope({
        participantId: childParticipantId,
        expectedRevision: 0,
        idempotencyKey: 'update-missing-child',
      })
    );
    expect(missingSibling.status).toBe('error');
    if (missingSibling.status === 'error') expect(missingSibling.error.code).toBe('forbidden');
  });
});
