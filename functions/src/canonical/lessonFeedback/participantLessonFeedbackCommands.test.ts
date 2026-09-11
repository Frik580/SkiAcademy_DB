import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
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
  instructorRelationshipExpiresAt,
  instructorRelationshipIdFromPair,
  participantLessonFeedbackIdFromLessonParticipant,
  paymentIdFromBookingId,
  timestampFromDate,
  type CommandEnvelope,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_lesson_feedback_cmd_01');
const studentAccountId = AccountIdSchema.parse('account_feedback_student_01');
const otherAccountId = AccountIdSchema.parse('account_feedback_other_01');
const instructorAccountId = AccountIdSchema.parse('account_feedback_instructor_01');
const otherInstructorAccountId = AccountIdSchema.parse('account_feedback_instructor_02');
const participantId = ParticipantIdSchema.parse('participant_feedback_cmd_01');
const childParticipantId = ParticipantIdSchema.parse('participant_feedback_cmd_child');
const otherParticipantId = ParticipantIdSchema.parse('participant_feedback_cmd_other');
const managementId = ParticipantManagementIdSchema.parse('management_feedback_cmd_01');
const childManagementId = ParticipantManagementIdSchema.parse('management_feedback_cmd_child');
const otherManagementId = ParticipantManagementIdSchema.parse('management_feedback_cmd_other');
const instructorId = InstructorIdSchema.parse('instructor_feedback_cmd_01');
const otherInstructorId = InstructorIdSchema.parse('instructor_feedback_cmd_02');
const bookingId = BookingIdSchema.parse('booking_feedback_cmd_01');
const occurrenceId = OccurrenceIdSchema.parse('occurrence_feedback_cmd_01');
const decidedAt = timestampFromDate(new Date('2026-01-15T12:00:00.000Z'));
const lessonStartsAt = timestampFromDate(new Date('2026-01-15T10:00:00.000Z'));
const lessonEndsAt = timestampFromDate(new Date('2026-01-15T11:00:00.000Z'));
const futureStartsAt = timestampFromDate(new Date('2026-06-01T09:00:00.000Z'));
const futureEndsAt = timestampFromDate(new Date('2026-06-01T10:00:00.000Z'));
const relationshipId = instructorRelationshipIdFromPair({ participantId, instructorId });

function environment() {
  return { clock: createAuthoritativeCommandClock(new Date('2026-01-15T12:00:00.000Z')) };
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

function seedParticipant(id: ParticipantId, management: typeof managementId) {
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
  participant: ParticipantId,
  accountId: typeof studentAccountId,
  authority: 'self' | 'parent_guardian'
) {
  return {
    participantManagementId: id,
    participantId: participant,
    accountId,
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

function seedWorld() {
  return {
    [`users/${studentAccountId}`]: seedAccount(studentAccountId),
    [`users/${otherAccountId}`]: seedAccount(otherAccountId),
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
      name: 'Coach Feedback',
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
    [`participants/${otherParticipantId}`]: seedParticipant(otherParticipantId, otherManagementId),
    [`participant_management/${managementId}`]: seedManagement(
      managementId,
      participantId,
      studentAccountId,
      'self'
    ),
    [`participant_management/${childManagementId}`]: seedManagement(
      childManagementId,
      childParticipantId,
      studentAccountId,
      'parent_guardian'
    ),
    [`participant_management/${otherManagementId}`]: seedManagement(
      otherManagementId,
      otherParticipantId,
      otherAccountId,
      'self'
    ),
  };
}

function seedBooking(
  input: {
    readonly status?: 'confirmed' | 'completed' | 'no_show';
    readonly participantIds?: readonly ParticipantId[];
    readonly startsAt?: typeof lessonStartsAt;
    readonly endsAt?: typeof lessonEndsAt;
    readonly instructorId?: typeof instructorId;
  } = {}
) {
  const participantIds = input.participantIds ?? [participantId];
  const startsAt = input.startsAt ?? lessonStartsAt;
  const endsAt = input.endsAt ?? lessonEndsAt;
  const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
  const status = input.status ?? 'completed';
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
      instructorId: input.instructorId ?? instructorId,
      interval: { startsAt, endsAt },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds, frozenAt: startsAt },
    },
    lifecycle:
      status === 'completed'
        ? { status: 'completed', completedAt: endsAt }
        : status === 'no_show'
          ? { status: 'no_show', noShowAt: endsAt }
          : { status: 'confirmed' },
    paymentId: paymentIdFromBookingId(bookingId),
    revision: 1,
    createdAt,
    updatedAt: status === 'confirmed' ? createdAt : endsAt,
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

function presentWorld(
  extra: Record<string, unknown> = {},
  bookingInput: Parameters<typeof seedBooking>[0] = {}
) {
  const present = seedAttendance(participantId, 'present');
  return {
    ...seedWorld(),
    [`bookings/${bookingId}`]: seedBooking(bookingInput) as unknown as Record<string, unknown>,
    [present.path]: present.data as unknown as Record<string, unknown>,
    ...extra,
  };
}

function saveEnvelope(
  input: {
    readonly actorAccountId?: typeof instructorAccountId;
    readonly participantId?: ParticipantId;
    readonly expectedRevision?: number;
    readonly idempotencyKey?: string;
    readonly items?: ReadonlyArray<{ itemId: string; text: string }>;
    readonly capability?: 'instructor' | 'account_owner' | 'parent_guardian';
    readonly transportInstructorId?: string;
  } = {}
): CommandEnvelope<'save_participant_lesson_feedback'> {
  return {
    kind: 'save_participant_lesson_feedback',
    context: {
      actor: accountCommandActor(input.actorAccountId ?? instructorAccountId),
      exercisedCapability: input.capability ?? 'instructor',
      idempotencyKey: input.idempotencyKey ?? 'save-feedback-01',
      correlationId,
      source: 'client_callable',
      ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
      ...(input.transportInstructorId
        ? { transportMetadata: { instructor_id: input.transportInstructorId } }
        : {}),
    },
    intent: {
      participantId: input.participantId ?? participantId,
      lessonBookingId: bookingId,
      items: input.items ?? [{ itemId: 'item_a', text: 'Practice carving' }],
    },
  };
}

function completeEnvelope(
  input: {
    readonly actorAccountId?: typeof studentAccountId;
    readonly participantId?: ParticipantId;
    readonly itemId?: string;
    readonly completed?: boolean;
    readonly expectedRevision?: number;
    readonly idempotencyKey?: string;
    readonly capability?: 'account_owner' | 'parent_guardian' | 'instructor';
  } = {}
): CommandEnvelope<'set_participant_lesson_feedback_item_completion'> {
  return {
    kind: 'set_participant_lesson_feedback_item_completion',
    context: {
      actor: accountCommandActor(input.actorAccountId ?? studentAccountId),
      exercisedCapability: input.capability ?? 'account_owner',
      idempotencyKey: input.idempotencyKey ?? 'complete-feedback-01',
      correlationId,
      source: 'client_callable',
      ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
    },
    intent: {
      participantId: input.participantId ?? participantId,
      lessonBookingId: bookingId,
      itemId: input.itemId ?? 'item_a',
      completed: input.completed ?? true,
    },
  };
}

function feedbackPath(targetParticipantId: ParticipantId = participantId) {
  return `participant_lesson_feedback/${participantLessonFeedbackIdFromLessonParticipant({
    participantId: targetParticipantId,
    lessonBookingId: bookingId,
  })}`;
}

describe('participant lesson feedback instructor write authorization', () => {
  it('allows the booking instructor after startsAt when the participant is present', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(presentWorld());
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      saveEnvelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.payload).toMatchObject({
        participantId,
        lessonBookingId: bookingId,
        revision: 1,
      });
    }
    expect(executor.snapshot().docs.get(feedbackPath())?.data).toMatchObject({
      instructorId,
      items: [{ itemId: 'item_a', text: 'Practice carving' }],
      revision: 1,
    });
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data).not.toMatchObject({
      recommendations: expect.anything(),
    });
  });

  it('denies missing attendance', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking() as unknown as Record<string, unknown>,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      saveEnvelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
    expect(executor.snapshot().docs.get(feedbackPath())).toBeUndefined();
  });

  it('denies absent attendance', async () => {
    const absent = seedAttendance(participantId, 'absent');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking() as unknown as Record<string, unknown>,
      [absent.path]: absent.data as unknown as Record<string, unknown>,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      saveEnvelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('denies present attendance before startsAt', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      presentWorld({}, { status: 'confirmed', startsAt: futureStartsAt, endsAt: futureEndsAt })
    );
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      saveEnvelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('denies the wrong instructor', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(presentWorld());
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      saveEnvelope({ expectedRevision: 0, actorAccountId: otherInstructorAccountId })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('denies a participant who is not in the booking service party', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(
      presentWorld({}, { participantIds: [participantId] })
    );
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      saveEnvelope({ expectedRevision: 0, participantId: childParticipantId })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('keeps present/absent group authority participant-specific', async () => {
    const present = seedAttendance(participantId, 'present');
    const absent = seedAttendance(childParticipantId, 'absent');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking({
        participantIds: [participantId, childParticipantId],
      }) as unknown as Record<string, unknown>,
      [present.path]: present.data as unknown as Record<string, unknown>,
      [absent.path]: absent.data as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(saveEnvelope({ expectedRevision: 0 }))).status).toBe('success');
    const denied = await commands.execute(
      saveEnvelope({
        participantId: childParticipantId,
        expectedRevision: 0,
        idempotencyKey: 'save-child-absent',
      })
    );
    expect(denied.status).toBe('error');
    if (denied.status === 'error') expect(denied.error.code).toBe('forbidden');
    expect(executor.snapshot().docs.get(feedbackPath(childParticipantId))).toBeUndefined();
  });

  it('denies a sibling with missing attendance when another is present', async () => {
    const present = seedAttendance(participantId, 'present');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking({
        participantIds: [participantId, childParticipantId],
      }) as unknown as Record<string, unknown>,
      [present.path]: present.data as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(saveEnvelope({ expectedRevision: 0 }))).status).toBe('success');
    const denied = await commands.execute(
      saveEnvelope({
        participantId: childParticipantId,
        expectedRevision: 0,
        idempotencyKey: 'save-child-missing',
      })
    );
    expect(denied.status).toBe('error');
    if (denied.status === 'error') expect(denied.error.code).toBe('forbidden');
  });

  it('does not let InstructorRelationship bypass missing present attendance', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking({ status: 'confirmed' }) as unknown as Record<
        string,
        unknown
      >,
      [`instructor_relationships/${relationshipId}`]: {
        instructorRelationshipId: relationshipId,
        participantId,
        instructorId,
        basis: {
          kind: 'guardian_permission',
          participantManagementId: managementId,
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
      },
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      saveEnvelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('allows a dependent Participant who has no /users document', async () => {
    const present = seedAttendance(childParticipantId, 'present');
    const world = seedWorld() as Record<string, unknown>;
    delete world[`users/${childParticipantId}`];
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...world,
      [`bookings/${bookingId}`]: seedBooking({
        participantIds: [childParticipantId],
      }) as unknown as Record<string, unknown>,
      [present.path]: present.data as unknown as Record<string, unknown>,
    });
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      saveEnvelope({
        participantId: childParticipantId,
        expectedRevision: 0,
      })
    );
    expect(result.status).toBe('success');
  });
});

describe('participant lesson feedback completion', () => {
  async function savedExecutor() {
    const executor = createInMemoryCanonicalTransactionExecutor(presentWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect(
      (
        await commands.execute(
          saveEnvelope({
            expectedRevision: 0,
            items: [
              { itemId: 'item_a', text: 'Drill A' },
              { itemId: 'item_b', text: 'Drill B' },
            ],
          })
        )
      ).status
    ).toBe('success');
    return { executor, commands };
  }

  it('allows the managing self Account to complete an item', async () => {
    const { executor, commands } = await savedExecutor();
    const result = await commands.execute(completeEnvelope({ expectedRevision: 1 }));
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(feedbackPath())?.data).toMatchObject({
      completedItemIds: ['item_a'],
      revision: 2,
    });
  });

  it('allows a guardian to complete a managed dependent item', async () => {
    const present = seedAttendance(childParticipantId, 'present');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking({
        participantIds: [childParticipantId],
      }) as unknown as Record<string, unknown>,
      [present.path]: present.data as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect(
      (
        await commands.execute(
          saveEnvelope({ participantId: childParticipantId, expectedRevision: 0 })
        )
      ).status
    ).toBe('success');
    const result = await commands.execute(
      completeEnvelope({
        participantId: childParticipantId,
        capability: 'parent_guardian',
        expectedRevision: 1,
      })
    );
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(feedbackPath(childParticipantId))?.data).toMatchObject({
      completedItemIds: ['item_a'],
    });
  });

  it('denies completion for an unmanaged Account', async () => {
    const { commands } = await savedExecutor();
    const result = await commands.execute(
      completeEnvelope({
        actorAccountId: otherAccountId,
        expectedRevision: 1,
        idempotencyKey: 'complete-unmanaged',
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('denies completion for a sibling the Account does not manage', async () => {
    const presentA = seedAttendance(participantId, 'present');
    const presentB = seedAttendance(otherParticipantId, 'present');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking({
        participantIds: [participantId, otherParticipantId],
      }) as unknown as Record<string, unknown>,
      [presentA.path]: presentA.data as unknown as Record<string, unknown>,
      [presentB.path]: presentB.data as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(saveEnvelope({ expectedRevision: 0 }))).status).toBe('success');
    expect(
      (
        await commands.execute(
          saveEnvelope({
            participantId: otherParticipantId,
            expectedRevision: 0,
            idempotencyKey: 'save-other',
          })
        )
      ).status
    ).toBe('success');
    const denied = await commands.execute(
      completeEnvelope({
        participantId: otherParticipantId,
        expectedRevision: 1,
      })
    );
    expect(denied.status).toBe('error');
    if (denied.status === 'error') expect(denied.error.code).toBe('forbidden');
  });

  it('does not grant the authoring Instructor completion authority', async () => {
    const { commands } = await savedExecutor();
    const result = await commands.execute(
      completeEnvelope({
        actorAccountId: instructorAccountId,
        capability: 'instructor',
        expectedRevision: 1,
        idempotencyKey: 'complete-as-instructor',
      })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('denies an unknown itemId', async () => {
    const { commands } = await savedExecutor();
    const result = await commands.execute(
      completeEnvelope({ itemId: 'missing_item', expectedRevision: 1 })
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('validation');
  });

  it('keeps completion for A from changing B', async () => {
    const presentA = seedAttendance(participantId, 'present');
    const presentB = seedAttendance(childParticipantId, 'present');
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedWorld(),
      [`bookings/${bookingId}`]: seedBooking({
        participantIds: [participantId, childParticipantId],
      }) as unknown as Record<string, unknown>,
      [presentA.path]: presentA.data as unknown as Record<string, unknown>,
      [presentB.path]: presentB.data as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(saveEnvelope({ expectedRevision: 0 }))).status).toBe('success');
    expect(
      (
        await commands.execute(
          saveEnvelope({
            participantId: childParticipantId,
            expectedRevision: 0,
            idempotencyKey: 'save-child',
          })
        )
      ).status
    ).toBe('success');
    expect((await commands.execute(completeEnvelope({ expectedRevision: 1 }))).status).toBe(
      'success'
    );
    expect(executor.snapshot().docs.get(feedbackPath())?.data).toMatchObject({
      completedItemIds: ['item_a'],
    });
    expect(executor.snapshot().docs.get(feedbackPath(childParticipantId))?.data).toMatchObject({
      completedItemIds: [],
    });
  });

  it('increments revision on completion toggle', async () => {
    const { executor, commands } = await savedExecutor();
    expect((await commands.execute(completeEnvelope({ expectedRevision: 1 }))).status).toBe(
      'success'
    );
    expect(executor.snapshot().docs.get(feedbackPath())?.data.revision).toBe(2);
  });

  it('replays the same completion idempotency key without a second mutation', async () => {
    const { executor, commands } = await savedExecutor();
    const first = await commands.execute(completeEnvelope({ expectedRevision: 1 }));
    const replay = await commands.execute(completeEnvelope({ expectedRevision: 1 }));
    expect(first.status).toBe('success');
    expect(replay.status).toBe('success');
    expect(executor.snapshot().docs.get(feedbackPath())?.data).toMatchObject({
      completedItemIds: ['item_a'],
      revision: 2,
    });
  });

  it('prunes stale completedItemIds when the instructor removes an item', async () => {
    const { executor, commands } = await savedExecutor();
    expect((await commands.execute(completeEnvelope({ expectedRevision: 1 }))).status).toBe(
      'success'
    );
    const saved = await commands.execute(
      saveEnvelope({
        expectedRevision: 2,
        idempotencyKey: 'save-pruned',
        items: [{ itemId: 'item_b', text: 'Drill B only' }],
      })
    );
    expect(saved.status).toBe('success');
    expect(executor.snapshot().docs.get(feedbackPath())?.data).toMatchObject({
      items: [{ itemId: 'item_b', text: 'Drill B only' }],
      completedItemIds: [],
      revision: 3,
    });
  });
});

describe('participant lesson feedback OCC, idempotency, and isolation', () => {
  it('creates revision 1 from a missing document', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(presentWorld());
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      saveEnvelope({ expectedRevision: 0 })
    );
    expect(result.status).toBe('success');
    if (result.status === 'success') expect(result.payload?.revision).toBe(1);
  });

  it('updates when expectedRevision matches', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(presentWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(saveEnvelope({ expectedRevision: 0 }))).status).toBe('success');
    const updated = await commands.execute(
      saveEnvelope({
        expectedRevision: 1,
        idempotencyKey: 'save-feedback-02',
        items: [{ itemId: 'item_a', text: 'Updated drill' }],
      })
    );
    expect(updated.status).toBe('success');
    expect(executor.snapshot().docs.get(feedbackPath())?.data).toMatchObject({
      items: [{ itemId: 'item_a', text: 'Updated drill' }],
      revision: 2,
    });
  });

  it('rejects a stale expectedRevision', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(presentWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(saveEnvelope({ expectedRevision: 0 }))).status).toBe('success');
    const stale = await commands.execute(
      saveEnvelope({ expectedRevision: 0, idempotencyKey: 'save-stale' })
    );
    expect(stale.status).toBe('error');
    if (stale.status === 'error') expect(stale.error.code).toBe('stale_version');
    expect(executor.snapshot().docs.get(feedbackPath())?.data.revision).toBe(1);
  });

  it('returns the equivalent result for the same idempotencyKey', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(presentWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    const first = await commands.execute(saveEnvelope({ expectedRevision: 0 }));
    const replay = await commands.execute(saveEnvelope({ expectedRevision: 0 }));
    expect(first.status).toBe('success');
    expect(replay.status).toBe('success');
    expect(executor.snapshot().docs.get(feedbackPath())?.data.revision).toBe(1);
  });

  it('stores instructorId from the authenticated actor, not client transport', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(presentWorld());
    const denied = await createProductionCanonicalCommands(environment(), executor).execute(
      saveEnvelope({
        expectedRevision: 0,
        transportInstructorId: otherInstructorId,
      })
    );
    expect(denied.status).toBe('error');
    const allowed = await createProductionCanonicalCommands(environment(), executor).execute(
      saveEnvelope({ expectedRevision: 0, idempotencyKey: 'save-server-instructor' })
    );
    expect(allowed.status).toBe('success');
    expect(executor.snapshot().docs.get(feedbackPath())?.data.instructorId).toBe(instructorId);
  });

  it('does not leave a partial aggregate after a denied sibling write', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(presentWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(saveEnvelope({ expectedRevision: 0 }))).status).toBe('success');
    const denied = await commands.execute(
      saveEnvelope({
        participantId: childParticipantId,
        expectedRevision: 0,
        idempotencyKey: 'save-sibling-denied',
      })
    );
    expect(denied.status).toBe('error');
    expect(executor.snapshot().docs.get(feedbackPath(childParticipantId))).toBeUndefined();
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.recommendations).toBeUndefined();
  });

  it('persists an empty items array instead of deleting the aggregate', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(presentWorld());
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(saveEnvelope({ expectedRevision: 0 }))).status).toBe('success');
    const cleared = await commands.execute(
      saveEnvelope({
        expectedRevision: 1,
        idempotencyKey: 'save-empty',
        items: [],
      })
    );
    expect(cleared.status).toBe('success');
    expect(executor.snapshot().docs.get(feedbackPath())?.data).toMatchObject({
      items: [],
      completedItemIds: [],
      revision: 2,
    });
  });

  it('does not copy leftover Booking recommendation fields', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(presentWorld());
    await createProductionCanonicalCommands(environment(), executor).execute(
      saveEnvelope({ expectedRevision: 0, items: [{ itemId: 'item_a', text: 'Canonical' }] })
    );
    const stored = executor.snapshot().docs.get(feedbackPath())?.data;
    expect(stored?.items).toEqual([{ itemId: 'item_a', text: 'Canonical' }]);
    expect(stored?.recommendations).toBeUndefined();
    expect(stored?.completedRecommendationIds).toBeUndefined();
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.recommendations).toBeUndefined();
  });
});
