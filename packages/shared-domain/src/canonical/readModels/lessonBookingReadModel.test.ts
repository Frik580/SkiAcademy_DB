import { describe, expect, it } from 'vitest';
import {
  LESSON_BOOKING_READ_SCOPES,
  LessonBookingAdminProjectionSchema,
  LessonBookingInstructorAttendancePresentationSchema,
  LessonBookingManagedParticipantAttendanceSchema,
  LessonBookingReadModelSchema,
  QueryLessonBookingReadModelsInputSchema,
  isInstructorLessonBookingHot,
  isLessonBookingHot,
  mergeRevisionAwareReadModel,
} from './lessonBookingReadModel';
import {
  boundCanonicalReadIdempotencyCursor,
  buildCanonicalReadIdempotencyKey,
} from '../readIdempotency';
import { timestampFromDate } from '../primitives';

describe('lessonBookingReadModel contracts', () => {
  it('merges revision-aware state without replacing newer cached revisions', () => {
    const cached = { revision: 5, bookingId: 'booking_merge_01' };
    const stale = { revision: 3, bookingId: 'booking_merge_01' };
    const newer = { revision: 7, bookingId: 'booking_merge_01' };
    expect(mergeRevisionAwareReadModel(cached, stale)).toEqual(cached);
    expect(mergeRevisionAwareReadModel(cached, newer)).toEqual(newer);
  });

  it('classifies hot bookings using lifecycle and interval end', () => {
    const now = timestampFromDate(new Date('2026-06-01T12:00:00.000Z'));
    const futureEnd = timestampFromDate(new Date('2026-06-01T14:00:00.000Z'));
    const pastEnd = timestampFromDate(new Date('2026-06-01T10:00:00.000Z'));
    expect(
      isLessonBookingHot({
        lifecycleStatus: 'confirmed',
        endsAt: futureEnd,
        now,
      })
    ).toBe(true);
    expect(
      isLessonBookingHot({
        lifecycleStatus: 'cancelled',
        endsAt: futureEnd,
        now,
      })
    ).toBe(false);
    expect(
      isLessonBookingHot({
        lifecycleStatus: 'confirmed',
        endsAt: pastEnd,
        now,
      })
    ).toBe(false);
  });

  it('keeps ended confirmed instructor bookings operational until endsAt + 24h', () => {
    const now = timestampFromDate(new Date('2026-06-01T12:00:00.000Z'));
    const justEnded = timestampFromDate(new Date('2026-06-01T11:00:00.000Z'));
    const windowEnd = timestampFromDate(new Date('2026-06-02T11:00:00.000Z'));
    const afterWindow = timestampFromDate(new Date('2026-06-02T11:00:00.001Z'));
    expect(
      isInstructorLessonBookingHot({
        lifecycleStatus: 'confirmed',
        endsAt: justEnded,
        now,
      })
    ).toBe(true);
    expect(
      isInstructorLessonBookingHot({
        lifecycleStatus: 'confirmed',
        endsAt: justEnded,
        now: windowEnd,
      })
    ).toBe(true);
    expect(
      isInstructorLessonBookingHot({
        lifecycleStatus: 'confirmed',
        endsAt: justEnded,
        now: afterWindow,
      })
    ).toBe(false);
    expect(
      isInstructorLessonBookingHot({
        lifecycleStatus: 'completed',
        endsAt: justEnded,
        now,
      })
    ).toBe(false);
    expect(
      isInstructorLessonBookingHot({
        lifecycleStatus: 'pending',
        endsAt: justEnded,
        now,
      })
    ).toBe(false);
  });

  it('fails closed on invalid lesson booking read scopes', () => {
    const parsed = QueryLessonBookingReadModelsInputSchema.safeParse({ scope: 'guest_open' });
    expect(parsed.success).toBe(false);
  });

  it('accepts optional idempotencyKey injected by callable transport', () => {
    const parsed = QueryLessonBookingReadModelsInputSchema.safeParse({
      scope: 'account_hot',
      idempotencyKey: 'e2e-lesson-booking-read',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts instructor_hot scope with transport idempotencyKey from instructor panel', () => {
    const parsed = QueryLessonBookingReadModelsInputSchema.safeParse({
      scope: 'instructor_hot',
      idempotencyKey: 'read:lesson_booking:instructor_hot:start:none',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts instructor_history and rejects detail or guest credentials for instructor scopes', () => {
    expect(
      QueryLessonBookingReadModelsInputSchema.safeParse({
        scope: 'instructor_history',
        idempotencyKey: 'read:lesson_booking:instructor_history:start:none',
      }).success
    ).toBe(true);
    expect(
      QueryLessonBookingReadModelsInputSchema.safeParse({
        scope: 'instructor_history',
        bookingId: 'booking_instructor_history_01',
      }).success
    ).toBe(false);
  });

  it('rejects instructor_history pagination when idempotencyKey embeds the raw cursor', () => {
    const cursor =
      'eyJzY29wZSI6Imluc3RydWN0b3JfaGlzdG9yeSIsInVwZGF0ZWRBdFNlY29uZHMiOjE3ODgzNTU5MDQsInVwZGF0ZWRBdE5hbm9zZWNvbmRzIjozMzAwMDAwMCwiYm9va2luZ0lkIjoiYm9va2luZ19hZG1pbl8xMWY1YmM5YTY5Zjc0ZmY5YWFkNjU5MDVmZjI5ZmE2ZSJ9';
    const rawKey = `read:lesson_booking:instructor_history:${cursor}:none`;
    expect(rawKey.length).toBeGreaterThan(200);
    const parsed = QueryLessonBookingReadModelsInputSchema.safeParse({
      scope: 'instructor_history',
      cursor,
      idempotencyKey: rawKey,
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts instructor_history page 2 when idempotencyKey uses a bounded cursor hash', () => {
    const cursor =
      'eyJzY29wZSI6Imluc3RydWN0b3JfaGlzdG9yeSIsInVwZGF0ZWRBdFNlY29uZHMiOjE3ODgzNTU5MDQsInVwZGF0ZWRBdE5hbm9zZWNvbmRzIjozMzAwMDAwMCwiYm9va2luZ0lkIjoiYm9va2luZ19hZG1pbl8xMWY1YmM5YTY5Zjc0ZmY5YWFkNjU5MDVmZjI5ZmE2ZSJ9';
    const idempotencyKey = buildCanonicalReadIdempotencyKey([
      'read:lesson_booking',
      'instructor_history',
      boundCanonicalReadIdempotencyCursor(cursor),
      'none',
    ]);
    expect(idempotencyKey.length).toBeLessThanOrEqual(200);
    expect(
      QueryLessonBookingReadModelsInputSchema.safeParse({
        scope: 'instructor_history',
        cursor,
        idempotencyKey,
      }).success
    ).toBe(true);
  });

  it('accepts account_history without cursor on first page', () => {
    const parsed = QueryLessonBookingReadModelsInputSchema.safeParse({
      scope: 'account_history',
      idempotencyKey: 'read:lesson_booking:account_history:start:none',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects account_history with cursor: null', () => {
    const parsed = QueryLessonBookingReadModelsInputSchema.safeParse({
      scope: 'account_history',
      cursor: null,
      idempotencyKey: 'read:lesson_booking:account_history:start:none',
    });
    expect(parsed.success).toBe(false);
  });

  it('publishes strict Admin list and detail scopes', () => {
    expect(LESSON_BOOKING_READ_SCOPES).toEqual(
      expect.arrayContaining(['admin_hot', 'admin_history', 'admin_detail'])
    );
    expect(
      QueryLessonBookingReadModelsInputSchema.safeParse({
        scope: 'admin_detail',
        bookingId: 'booking_admin_detail_01',
      }).success
    ).toBe(true);
    expect(
      QueryLessonBookingReadModelsInputSchema.safeParse({
        scope: 'admin_detail',
      }).success
    ).toBe(false);
    expect(
      QueryLessonBookingReadModelsInputSchema.safeParse({
        scope: 'admin_detail',
        bookingId: 'booking_admin_detail_01',
        pageSize: 1,
      }).success
    ).toBe(false);
    expect(
      QueryLessonBookingReadModelsInputSchema.safeParse({
        scope: 'admin_hot',
        bookingId: 'booking_admin_detail_01',
      }).success
    ).toBe(false);
    expect(
      QueryLessonBookingReadModelsInputSchema.safeParse({
        scope: 'admin_history',
        guestActionNonce: 'spoofed',
        guestActionSignature: 'spoofed',
      }).success
    ).toBe(false);
  });

  it('rejects legacy money aliases from the focused Admin projection', () => {
    const parsed = LessonBookingAdminProjectionSchema.safeParse({
      participants: [
        {
          participantId: 'participant_admin_contract_01',
          displayName: 'Student',
          skillLevel: 'beginner',
          discipline: 'ski',
          age: { kind: 'age_years', years: 20 },
        },
      ],
      attribution: {
        bookingOrigin: 'account',
        bookedBy: { kind: 'account', accountId: 'account_admin_contract_01' },
      },
      payment: {
        paymentId: 'payment_admin_contract_01',
        status: 'paid',
        revision: 1,
        currency: 'KZT',
        originalPrice: 50_000,
        price: 50_000,
        paid: 50_000,
        refunded: 0,
        retained: 50_000,
        settled: 50_000,
        writtenOff: 0,
        outstanding: 0,
        totalPrice: 50_000,
      },
      relatedIssues: [],
      scheduleRevision: 1,
      serviceParticipantIds: ['participant_admin_contract_01'],
      authorizedActions: {
        canConfirmGuest: false,
        canRecordGuestPayment: false,
        canDirectCancel: true,
        canReschedule: true,
        canChangeInstructor: true,
        canChangeDuration: true,
        canRecordAttendance: false,
        canResolveCancellation: false,
        canResolveAttendanceOutcome: false,
        canLinkGuestToAccount: false,
      },
    });
    expect(parsed.success).toBe(false);
  });

  it('projects instructor attendance with missing or complete evidence, never a partial mix', () => {
    expect(
      LessonBookingInstructorAttendancePresentationSchema.safeParse({
        participantId: 'participant_instructor_attendance_01',
        authorizedActions: { canRecordPresent: true, canRecordAbsent: true },
      }).success
    ).toBe(true);
    expect(
      LessonBookingInstructorAttendancePresentationSchema.safeParse({
        participantId: 'participant_instructor_attendance_01',
        attendanceStatus: 'present',
        revision: 1,
        authorizedActions: { canRecordPresent: false, canRecordAbsent: true },
      }).success
    ).toBe(true);
    expect(
      LessonBookingInstructorAttendancePresentationSchema.safeParse({
        participantId: 'participant_instructor_attendance_01',
        attendanceStatus: 'present',
        authorizedActions: { canRecordPresent: false, canRecordAbsent: true },
      }).success
    ).toBe(false);
    expect(
      LessonBookingInstructorAttendancePresentationSchema.safeParse({
        participantId: 'participant_instructor_attendance_01',
        attendanceStatus: 'unknown',
        revision: 1,
        authorizedActions: { canRecordPresent: true, canRecordAbsent: false },
      }).success
    ).toBe(false);
  });

  it('accepts account-managed attendance projection without instructor authorizedActions', () => {
    expect(
      LessonBookingManagedParticipantAttendanceSchema.safeParse({
        participantId: 'participant_managed_attendance_01',
        attendanceStatus: 'present',
      }).success
    ).toBe(true);
    expect(
      LessonBookingManagedParticipantAttendanceSchema.safeParse({
        participantId: 'participant_managed_attendance_01',
      }).success
    ).toBe(true);
    expect(
      LessonBookingManagedParticipantAttendanceSchema.safeParse({
        participantId: 'participant_managed_attendance_01',
        attendanceStatus: 'present',
        authorizedActions: { canRecordPresent: true, canRecordAbsent: false },
      }).success
    ).toBe(false);
    const startsAt = timestampFromDate(new Date('2026-06-15T04:00:00.000Z'));
    const parsed = LessonBookingReadModelSchema.safeParse({
      bookingId: 'booking_managed_attendance_01',
      revision: 1,
      partyKind: 'family_group',
      participantIds: ['participant_managed_attendance_01', 'participant_unrelated_01'],
      participants: [
        { participantId: 'participant_managed_attendance_01', displayName: 'A' },
        { participantId: 'participant_unrelated_01', displayName: 'B' },
      ],
      instructor: { instructorId: 'instructor_managed_attendance_01', displayName: 'Coach' },
      occurrence: {
        startsAt,
        endsAt: timestampFromDate(new Date('2026-06-15T05:00:00.000Z')),
        timeZone: 'Asia/Almaty',
        durationMinutes: 60,
      },
      lifecycle: { status: 'completed', completedAt: startsAt },
      bookingOrigin: 'account',
      authorizedActions: {
        canRequestCancellation: false,
        canWithdrawCancellation: false,
        canReschedule: false,
        canCreateChangeRequest: false,
      },
      serviceParticipantIds: ['participant_managed_attendance_01', 'participant_unrelated_01'],
      managedParticipantAttendance: [
        { participantId: 'participant_managed_attendance_01', attendanceStatus: 'present' },
      ],
      updatedAt: startsAt,
    });
    expect(parsed.success).toBe(true);
  });
});
