import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  AccountSchema,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  BookingIdSchema,
  BookingSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementActiveOwnerGuardSchema,
  ParticipantManagementIdSchema,
  ParticipantManagementSchema,
  ParticipantSchema,
  accountCommandActor,
  attendanceIdFromBookingIdentity,
  paymentIdFromBookingId,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createFirestoreCanonicalTransactionExecutor } from '../transactions';
import { queryInstructorReviewReadModels } from '../readModels/instructorReviewReadModels';

const runsOnFirestoreEmulator = Boolean(
  process.env.FIREBASE_EMULATOR_HUB ?? process.env.FIRESTORE_EMULATOR_HOST
);
const describeEmulator = runsOnFirestoreEmulator ? describe : describe.skip;
const PROJECT_ID = 'ski-academy-instructor-review-emulator-test';
const accountId = 'account_review_emulator_01';
const participantId = ParticipantIdSchema.parse('participant_review_emulator_01');
const managementId = ParticipantManagementIdSchema.parse('management_review_emulator_01');
const instructorId = InstructorIdSchema.parse('instructor_review_emulator_01');
const correlationId = CorrelationIdSchema.parse('correlation_review_emulator_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const completedAt = timestampFromDate(new Date('2026-02-01T10:00:00.000Z'));

let app: App;
let firestore: Firestore;

function booking(ordinal: number) {
  const bookingId = BookingIdSchema.parse(`booking_review_emulator_0${ordinal}`);
  const occurrenceId = OccurrenceIdSchema.parse(`occurrence_review_emulator_0${ordinal}`);
  return BookingSchema.parse({
    bookingId,
    attribution: {
      bookingOrigin: 'account',
      bookedBy: { kind: 'account', accountId },
    },
    party: { kind: 'individual', participantIds: [participantId] },
    occurrence: {
      occurrenceId,
      instructorId,
      interval: {
        startsAt: timestampFromDate(new Date('2026-02-01T09:00:00.000Z')),
        endsAt: completedAt,
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [participantId], frozenAt: completedAt },
    },
    lifecycle: { status: 'completed', completedAt },
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

function envelope(
  targetBooking: ReturnType<typeof booking>,
  rating: number,
  key: string
): CommandEnvelope<'create_instructor_review'> {
  return {
    kind: 'create_instructor_review',
    context: {
      actor: accountCommandActor(accountId as never),
      exercisedCapability: 'parent_guardian',
      idempotencyKey: key,
      correlationId,
      source: 'client_callable',
    },
    intent: { bookingId: targetBooking.bookingId, rating },
  };
}

async function seedFixture() {
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
  const management = ParticipantManagementSchema.parse({
    participantManagementId: managementId,
    accountId,
    participantId,
    role: 'owner',
    authority: 'parent_guardian',
    status: 'active',
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
  const participant = ParticipantSchema.parse({
    participantId,
    displayName: 'Managed Child',
    age: { kind: 'age_years', years: 10 },
    skillLevel: 'beginner',
    discipline: 'ski',
    management: { kind: 'managed', participantManagementId: managementId },
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
  const guard = ParticipantManagementActiveOwnerGuardSchema.parse({
    participantId,
    accountId,
    participantManagementId: managementId,
    managementRevision: 1,
    updatedAt: createdAt,
    lastChangedByCommandId: 'seed',
    correlationId,
  });
  await Promise.all([
    firestore.doc(`users/${accountId}`).set({
      ...account,
      displayName: 'Review Account',
    }),
    firestore.doc(`participants/${participantId}`).set(participant),
    firestore.doc(`participant_management/${managementId}`).set(management),
    firestore.doc(`participant_management_active_owner/${participantId}`).set(guard),
    firestore.doc(`instructors/${instructorId}`).set({
      id: instructorId,
      instructorId,
      name: 'Review Instructor',
      pricePerHourKZT: 50_000,
      rating: 1,
      reviewsCount: 700,
    }),
  ]);
  for (const targetBooking of [booking(1), booking(2), booking(3)]) {
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId: targetBooking.occurrence.occurrenceId,
      participantId,
    });
    await Promise.all([
      firestore.doc(`bookings/${targetBooking.bookingId}`).set(targetBooking),
      firestore.doc(`attendance/${attendanceId}`).set({
        attendanceId,
        subject: {
          subjectKind: 'booking',
          bookingId: targetBooking.bookingId,
          occurrenceId: targetBooking.occurrence.occurrenceId,
          participantId,
        },
        attendanceStatus: 'present',
        recordedBy: { kind: 'instructor', instructorId },
        recordedAt: completedAt,
        lastChangedBy: { kind: 'instructor', instructorId },
        updatedAt: completedAt,
        revision: 1,
        correlationId,
      }),
    ]);
  }
}

describeEmulator('canonical instructor reviews emulator', () => {
  beforeAll(async () => {
    app =
      getApps().find((candidate) => candidate.options.projectId === PROJECT_ID) ??
      initializeApp({ projectId: PROJECT_ID }, PROJECT_ID);
    firestore = getFirestore(app);
    await seedFixture();
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  it('keeps concurrent review projection exact and exposes canonical-only read models', async () => {
    const commands = createProductionCanonicalCommands(
      { clock: createAuthoritativeCommandClock(new Date('2026-02-02T00:00:00.000Z')) },
      createFirestoreCanonicalTransactionExecutor(firestore)
    );
    const results = await Promise.all([
      commands.execute(envelope(booking(1), 5, 'concurrent-review-1')),
      commands.execute(envelope(booking(2), 3, 'concurrent-review-2')),
    ]);
    expect(results.every((result) => result.status === 'success')).toBe(true);

    const summary = await queryInstructorReviewReadModels(firestore, {
      scope: 'instructor_reviews',
      instructorId,
      pageSize: 1,
    });
    expect(summary.scope).toBe('instructor_reviews');
    if (summary.scope === 'instructor_reviews') {
      expect(summary.summary).toMatchObject({ rating: 4, reviewsCount: 2 });
      expect(summary.reviews).toHaveLength(1);
      expect(summary.hasMore).toBe(true);
      expect(summary.nextCursor).toBeTruthy();
      expect(summary.reviews[0]).not.toHaveProperty('bookingId');
      expect(summary.reviews[0]).not.toHaveProperty('managingAccountId');
    }

    const publicSummaries = await queryInstructorReviewReadModels(firestore, {
      scope: 'public_summaries',
      instructorIds: [instructorId],
    });
    expect(publicSummaries).toMatchObject({
      scope: 'public_summaries',
      summaries: [expect.objectContaining({ instructorId, rating: 4, reviewsCount: 2 })],
    });

    const account = await queryInstructorReviewReadModels(
      firestore,
      { scope: 'account_reviews', bookingIds: [booking(1).bookingId, booking(2).bookingId] },
      { accountId: accountId as never }
    );
    expect(account.scope).toBe('account_reviews');
    if (account.scope === 'account_reviews') {
      expect(account.reviews).toHaveLength(2);
      expect(account.bookingStates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ bookingId: booking(1).bookingId, reviewed: true }),
          expect.objectContaining({ bookingId: booking(2).bookingId, reviewed: true }),
        ])
      );
    }

    const sameBookingResults = await Promise.all([
      commands.execute(envelope(booking(3), 4, 'same-booking-concurrent-a')),
      commands.execute(envelope(booking(3), 1, 'same-booking-concurrent-b')),
    ]);
    expect(sameBookingResults.every((result) => result.status === 'success')).toBe(true);
    const outcomes = sameBookingResults.map((result) =>
      result.status === 'success' ? result.payload?.outcome : undefined
    );
    expect(outcomes.sort()).toEqual(['already_exists', 'created']);
    const winnerRating =
      sameBookingResults[0]?.status === 'success' &&
      sameBookingResults[0].payload?.outcome === 'created'
        ? 4
        : 1;
    const ratingSum = 5 + 3 + winnerRating;
    const finalSummary = await firestore
      .doc(`instructor_rating_summaries/${instructorId}`)
      .get();
    expect(finalSummary.data()).toMatchObject({
      reviewsCount: 3,
      ratingSum,
      rating: ratingSum / 3,
    });
    expect(
      (
        await firestore
          .collection('instructor_reviews')
          .where('bookingId', '==', booking(3).bookingId)
          .get()
      ).size
    ).toBe(1);

    const legacyCatalog = await firestore.doc(`instructors/${instructorId}`).get();
    expect(legacyCatalog.data()).toMatchObject({ rating: 1, reviewsCount: 700 });
  });
});
