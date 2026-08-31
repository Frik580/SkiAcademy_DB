import { describe, expect, it } from 'vitest';
import {
  LESSON_BOOKING_READ_SCOPES,
  LessonBookingAdminProjectionSchema,
  QueryLessonBookingReadModelsInputSchema,
  isLessonBookingHot,
  mergeRevisionAwareReadModel,
} from './lessonBookingReadModel';
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
});
