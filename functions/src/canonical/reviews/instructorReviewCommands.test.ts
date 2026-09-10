import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  BookingIdSchema,
  BookingSchema,
  CorrelationIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementActiveOwnerGuardSchema,
  ParticipantManagementIdSchema,
  ParticipantManagementSchema,
  accountCommandActor,
  attendanceIdFromBookingIdentity,
  instructorReviewIdFromBookingAccount,
  paymentIdFromBookingId,
  timestampFromDate,
  type Booking,
  type CommandEnvelope,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const accountId = AccountIdSchema.parse('account_review_unit_01');
const otherAccountId = AccountIdSchema.parse('account_review_unit_02');
const instructorId = 'instructor_review_unit_01';
const participantOne = ParticipantIdSchema.parse('participant_review_unit_01');
const participantTwo = ParticipantIdSchema.parse('participant_review_unit_02');
const bookingOneId = BookingIdSchema.parse('booking_review_unit_01');
const bookingTwoId = BookingIdSchema.parse('booking_review_unit_02');
const correlationId = CorrelationIdSchema.parse('correlation_review_unit_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const completedAt = timestampFromDate(new Date('2026-01-15T10:00:00.000Z'));

function environment() {
  return { clock: createAuthoritativeCommandClock(new Date('2026-01-16T00:00:00.000Z')) };
}

function lifecycle(
  status: 'pending' | 'confirmed' | 'pending_cancellation' | 'cancelled' | 'completed' | 'no_show'
): Booking['lifecycle'] {
  if (status === 'pending') return { status, reservationExpiresAt: completedAt };
  if (status === 'pending_cancellation') return { status, requestedAt: completedAt };
  if (status === 'cancelled') {
    return { status, cancelledAt: completedAt, reasonCode: 'account_owner_cancelled' };
  }
  if (status === 'completed') return { status, completedAt };
  if (status === 'no_show') return { status, noShowAt: completedAt };
  return { status };
}

function booking(
  bookingId = bookingOneId,
  participants: readonly ParticipantId[] = [participantOne],
  status: Parameters<typeof lifecycle>[0] = 'completed'
) {
  const occurrenceId = OccurrenceIdSchema.parse(`occurrence_${bookingId}`);
  return BookingSchema.parse({
    bookingId,
    attribution:
      status === 'pending'
        ? {
            bookingOrigin: 'guest',
            bookedBy: { kind: 'guest', guestSubjectId: 'guest_review_unit_01' },
          }
        : {
            bookingOrigin: 'account',
            bookedBy: { kind: 'account', accountId },
          },
    party: {
      kind: participants.length === 1 ? 'individual' : 'family_group',
      participantIds: participants,
    },
    occurrence: {
      occurrenceId,
      instructorId,
      interval: {
        startsAt: timestampFromDate(new Date('2026-01-15T09:00:00.000Z')),
        endsAt: completedAt,
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: participants, frozenAt: completedAt },
    },
    lifecycle: lifecycle(status),
    paymentId: paymentIdFromBookingId(bookingId),
    revision: 2,
    createdAt,
    updatedAt: completedAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
}

function managementSeed(
  participantId: ParticipantId,
  manager = accountId,
  authority: 'self' | 'parent_guardian' = 'parent_guardian'
) {
  const managementId = ParticipantManagementIdSchema.parse(`management_${participantId}`);
  return {
    management: ParticipantManagementSchema.parse({
      participantManagementId: managementId,
      accountId: manager,
      participantId,
      role: 'owner',
      authority,
      status: 'active',
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      audit: {
        createdByCommandId: 'seed',
        lastChangedByCommandId: 'seed',
        correlationId,
      },
    }),
    guard: ParticipantManagementActiveOwnerGuardSchema.parse({
      participantId,
      accountId: manager,
      participantManagementId: managementId,
      managementRevision: 1,
      updatedAt: createdAt,
      lastChangedByCommandId: 'seed',
      correlationId,
    }),
  };
}

function attendanceSeed(
  targetBooking: ReturnType<typeof booking>,
  participantId: ParticipantId,
  attendanceStatus: 'present' | 'absent'
) {
  const attendanceId = attendanceIdFromBookingIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'booking',
    occurrenceId: targetBooking.occurrence.occurrenceId,
    participantId,
  });
  return {
    path: `attendance/${attendanceId}`,
    data: {
      attendanceId,
      subject: {
        subjectKind: 'booking',
        bookingId: targetBooking.bookingId,
        occurrenceId: targetBooking.occurrence.occurrenceId,
        participantId,
      },
      attendanceStatus,
      recordedBy: { kind: 'instructor', instructorId },
      recordedAt: completedAt,
      lastChangedBy: { kind: 'instructor', instructorId },
      updatedAt: completedAt,
      revision: 1,
      correlationId,
    },
  };
}

function seedFor(input: {
  readonly targetBooking?: ReturnType<typeof booking>;
  readonly managers?: ReadonlyMap<ParticipantId, typeof accountId>;
  readonly attendance?: ReadonlyMap<ParticipantId, 'present' | 'absent'>;
}) {
  const targetBooking = input.targetBooking ?? booking();
  const account = AccountSchema.parse({
    accountId,
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
  const records: Record<string, Record<string, unknown>> = {
    [`users/${accountId}`]: {
      ...(account as unknown as Record<string, unknown>),
      displayName: 'Review Author',
      avatarUrl: 'https://example.com/reviewer.jpg',
    },
    [`bookings/${targetBooking.bookingId}`]: targetBooking as unknown as Record<string, unknown>,
    [`instructors/${instructorId}`]: {
      id: instructorId,
      instructorId,
      name: 'Canonical Instructor',
      pricePerHourKZT: 40_000,
      rating: 1,
      reviewsCount: 99,
    },
  };
  for (const participantId of targetBooking.party.participantIds) {
    const manager = input.managers?.get(participantId) ?? accountId;
    const { management, guard } = managementSeed(participantId, manager);
    records[`participant_management/${management.participantManagementId}`] =
      management as unknown as Record<string, unknown>;
    records[`participant_management_active_owner/${participantId}`] =
      guard as unknown as Record<string, unknown>;
  }
  for (const participantId of targetBooking.occurrence.serviceParty.participantIds) {
    const attendance = attendanceSeed(
      targetBooking,
      participantId,
      input.attendance?.get(participantId) ?? 'present'
    );
    records[attendance.path] = attendance.data as unknown as Record<string, unknown>;
  }
  return records;
}

function envelope(
  bookingId = bookingOneId,
  idempotencyKey = 'create-review-01',
  rating = 5
): CommandEnvelope<'create_instructor_review'> {
  return {
    kind: 'create_instructor_review',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'parent_guardian',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
    },
    intent: { bookingId, rating, comment: '  Excellent lesson  ' },
  };
}

describe('instructorReviewCommands', () => {
  it('creates a rating-only review when comment is omitted or whitespace', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedFor({}));
    const result = await createProductionCanonicalCommands(environment(), executor).execute({
      ...envelope(bookingOneId, 'create-review-no-comment', 5),
      intent: { bookingId: bookingOneId, rating: 5, comment: '   ' },
    });
    expect(result.status).toBe('success');
    const reviewId = instructorReviewIdFromBookingAccount({
      bookingId: bookingOneId,
      managingAccountId: accountId,
    });
    expect(executor.snapshot().docs.get(`instructor_reviews/${reviewId}`)?.data).toMatchObject({
      rating: 5,
    });
    expect(executor.snapshot().docs.get(`instructor_reviews/${reviewId}`)?.data).not.toHaveProperty(
      'comment'
    );
  });

  it('creates a canonical review and first-rating projection, ignoring legacy aggregates', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedFor({}));
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope()
    );
    expect(result.status).toBe('success');
    const reviewId = instructorReviewIdFromBookingAccount({
      bookingId: bookingOneId,
      managingAccountId: accountId,
    });
    expect(executor.snapshot().docs.get(`instructor_reviews/${reviewId}`)?.data).toMatchObject({
      instructorId,
      rating: 5,
      comment: 'Excellent lesson',
      managingAccountId: accountId,
    });
    expect(
      executor.snapshot().docs.get(`instructor_rating_summaries/${instructorId}`)?.data
    ).toMatchObject({
      rating: 5,
      ratingSum: 5,
      reviewsCount: 1,
      ratingCounts: [0, 0, 0, 0, 1],
    });
  });

  it.each(['pending', 'confirmed', 'pending_cancellation', 'cancelled', 'no_show'] as const)(
    'rejects %s booking lifecycle',
    async (status) => {
      const targetBooking = booking(bookingOneId, [participantOne], status);
      const executor = createInMemoryCanonicalTransactionExecutor(seedFor({ targetBooking }));
      const result = await createProductionCanonicalCommands(environment(), executor).execute(
        envelope()
      );
      expect(result.status).toBe('error');
      if (result.status === 'error') expect(result.error.code).toBe('invalid_transition');
    }
  );

  it('rejects an unrelated or wrong managing account', async () => {
    const managers = new Map([[participantOne, otherAccountId]]);
    const executor = createInMemoryCanonicalTransactionExecutor(seedFor({ managers }));
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope()
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('rejects completed booking when the managing party has no present attendance', async () => {
    const attendance = new Map([[participantOne, 'absent' as const]]);
    const executor = createInMemoryCanonicalTransactionExecutor(seedFor({ attendance }));
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope()
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('invalid_transition');
  });

  it('allows a managed family party when at least one participant is present', async () => {
    const targetBooking = booking(bookingOneId, [participantOne, participantTwo]);
    const attendance = new Map<ParticipantId, 'present' | 'absent'>([
      [participantOne, 'absent'],
      [participantTwo, 'present'],
    ]);
    const executor = createInMemoryCanonicalTransactionExecutor(
      seedFor({ targetBooking, attendance })
    );
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope()
    );
    expect(result.status).toBe('success');
  });

  it('enforces the same managing Account for the entire family party', async () => {
    const targetBooking = booking(bookingOneId, [participantOne, participantTwo]);
    const managers = new Map<ParticipantId, typeof accountId>([
      [participantOne, accountId],
      [participantTwo, otherAccountId],
    ]);
    const executor = createInMemoryCanonicalTransactionExecutor(
      seedFor({ targetBooking, managers })
    );
    const result = await createProductionCanonicalCommands(environment(), executor).execute(
      envelope()
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('forbidden');
  });

  it('makes same-key replay and different-key duplicate equivalent without another review', async () => {
    const executor = createInMemoryCanonicalTransactionExecutor(seedFor({}));
    const commands = createProductionCanonicalCommands(environment(), executor);
    const first = await commands.execute(envelope());
    const replay = await commands.execute(envelope());
    const duplicate = await commands.execute(envelope(bookingOneId, 'create-review-02', 1));
    expect(first.status).toBe('success');
    expect(replay.status).toBe('success');
    expect(duplicate.status).toBe('success');
    if (duplicate.status === 'success') {
      expect(duplicate.payload).toMatchObject({ outcome: 'already_exists' });
    }
    expect(
      [...executor.snapshot().docs.keys()].filter((path) =>
        path.startsWith('instructor_reviews/')
      )
    ).toHaveLength(1);
    expect(
      executor.snapshot().docs.get(`instructor_rating_summaries/${instructorId}`)?.data
    ).toMatchObject({ reviewsCount: 1, rating: 5 });
  });

  it('updates average and count transactionally for a second canonical booking review', async () => {
    const firstBooking = booking();
    const secondBooking = booking(bookingTwoId);
    const executor = createInMemoryCanonicalTransactionExecutor({
      ...seedFor({ targetBooking: firstBooking }),
      ...seedFor({ targetBooking: secondBooking }),
    });
    const commands = createProductionCanonicalCommands(environment(), executor);
    expect((await commands.execute(envelope(bookingOneId, 'review-first', 5))).status).toBe(
      'success'
    );
    expect((await commands.execute(envelope(bookingTwoId, 'review-second', 3))).status).toBe(
      'success'
    );
    expect(
      executor.snapshot().docs.get(`instructor_rating_summaries/${instructorId}`)?.data
    ).toMatchObject({
      rating: 4,
      ratingSum: 8,
      reviewsCount: 2,
      ratingCounts: [0, 0, 1, 0, 1],
    });
  });
});
