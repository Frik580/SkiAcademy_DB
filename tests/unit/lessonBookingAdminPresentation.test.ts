import { describe, expect, it } from 'vitest';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import {
  attendanceStatusLabelKey,
  attendanceUnavailableReason,
  guestLinkUnavailableLabelKey,
  hasVisibleLessonAdminMutation,
  isPendingUnpaidOutstanding,
  lessonAdminPaymentAncillaryRows,
  resolveLessonAdminEmptyActionsReason,
  resolveLessonAdminPrimaryStatus,
  shouldShowCancellationSection,
  shouldShowPayerRow,
} from '../../src/features/admin/lesson-bookings/lessonBookingAdminPresentation';

function baseAdmin() {
  return {
    participants: [
      {
        participantId: 'participant_presentation_01',
        displayName: 'Lola',
        skillLevel: 'intermediate',
        discipline: 'ski' as const,
        age: { kind: 'age_years' as const, years: 18 },
      },
    ],
    attribution: {
      bookingOrigin: 'guest' as const,
      bookedBy: { kind: 'guest' as const, guestSubjectId: 'guest_subject_presentation_01' },
    },
    payment: {
      paymentId: 'payment_presentation_01',
      status: 'unpaid' as const,
      revision: 1,
      currency: 'KZT' as const,
      originalPrice: 60_000,
      price: 60_000,
      paid: 0,
      refunded: 0,
      retained: 0,
      settled: 0,
      writtenOff: 0,
      outstanding: 60_000,
    },
    cancellationFinancial: {
      timing: 'direct_cancel' as const,
      maximumRefund: 0,
      suggestedRefund: 0,
    },
    relatedIssues: [],
    attendance: [
      {
        participantId: 'participant_presentation_01',
        authorizedActions: {
          canRecordPresent: false,
          canRecordAbsent: false,
          reasonRequired: true as const,
        },
      },
    ],
    scheduleRevision: 1,
    serviceParticipantIds: ['participant_presentation_01'],
    authorizedActions: {
      canConfirmGuest: false as const,
      canDirectCancel: false,
      canReschedule: false,
      canChangeInstructor: false,
      canChangeDuration: false,
      canRecordAttendance: false,
      canResolveCancellation: false,
      canResolveAttendanceOutcome: false,
      canLinkGuestToAccount: false,
    },
    guestIdentityLinkUnavailableReason: 'expired_reservation' as const,
  };
}

function item(
  overrides: Partial<LessonBookingReadModel> = {}
): LessonBookingReadModel {
  return {
    bookingId: 'booking_presentation_01',
    revision: 1,
    partyKind: 'individual',
    participantIds: ['participant_presentation_01'],
    participants: [{ participantId: 'participant_presentation_01', displayName: 'Lola' }],
    instructor: {
      instructorId: 'instructor_presentation_01',
      displayName: 'Arseniy',
    },
    occurrence: {
      startsAt: { seconds: 1_788_246_000, nanoseconds: 0 },
      endsAt: { seconds: 1_788_253_200, nanoseconds: 0 },
      timeZone: 'Asia/Almaty',
      durationMinutes: 120,
    },
    lifecycle: { status: 'pending' },
    bookingOrigin: 'guest',
    authorizedActions: {
      canRequestCancellation: false,
      canWithdrawCancellation: false,
      canReschedule: false,
    },
    updatedAt: { seconds: 10, nanoseconds: 0 },
    admin: baseAdmin(),
    ...overrides,
  } as LessonBookingReadModel;
}

describe('lessonBookingAdminPresentation', () => {
  it('maps pending + unpaid outstanding to awaiting_payment without inventing other labels', () => {
    const pendingUnpaid = item();
    expect(isPendingUnpaidOutstanding(pendingUnpaid)).toBe(true);
    expect(resolveLessonAdminPrimaryStatus(pendingUnpaid)).toBe('awaiting_payment');
    expect(resolveLessonAdminEmptyActionsReason(pendingUnpaid)).toBe('awaiting_confirmation');
    expect(hasVisibleLessonAdminMutation(pendingUnpaid.admin!)).toBe(false);
  });

  it('does not call a funded pending booking awaiting payment', () => {
    const fundedPending = item({
      admin: {
        ...baseAdmin(),
        payment: {
          ...baseAdmin().payment,
          status: 'paid',
          paid: 60_000,
          outstanding: 0,
          retained: 60_000,
          settled: 60_000,
        },
      },
    });
    expect(isPendingUnpaidOutstanding(fundedPending)).toBe(false);
    expect(resolveLessonAdminPrimaryStatus(fundedPending)).toBe('pending');
    expect(resolveLessonAdminEmptyActionsReason(fundedPending)).toBe('neutral');
  });

  it('keeps lifecycle labels for confirmed, cancelled, completed, no-show, and pending cancellation', () => {
    expect(resolveLessonAdminPrimaryStatus(item({ lifecycle: { status: 'confirmed' } }))).toBe(
      'confirmed'
    );
    expect(resolveLessonAdminPrimaryStatus(item({ lifecycle: { status: 'cancelled' } }))).toBe(
      'cancelled'
    );
    expect(resolveLessonAdminPrimaryStatus(item({ lifecycle: { status: 'completed' } }))).toBe(
      'completed'
    );
    expect(resolveLessonAdminPrimaryStatus(item({ lifecycle: { status: 'no_show' } }))).toBe(
      'no_show'
    );
    expect(
      resolveLessonAdminPrimaryStatus(item({ lifecycle: { status: 'pending_cancellation' } }))
    ).toBe('pending_cancellation');
  });

  it('hides zero ancillary payment rows and shows non-zero refund/retained/settled/writtenOff', () => {
    expect(lessonAdminPaymentAncillaryRows(baseAdmin().payment)).toEqual([]);
    expect(
      lessonAdminPaymentAncillaryRows({
        ...baseAdmin().payment,
        originalPrice: 70_000,
        refunded: 1_000,
        retained: 2_000,
        settled: 3_000,
        writtenOff: 4_000,
      }).map((row) => row.id)
    ).toEqual(['original', 'refunded', 'retained', 'settled', 'writtenOff']);
  });

  it('labels attendance from recorded status only', () => {
    expect(attendanceStatusLabelKey(undefined)).toBe('adminLessonAttendanceMissing');
    expect(attendanceStatusLabelKey('present')).toBe('adminLessonAttendancePresent');
    expect(attendanceStatusLabelKey('absent')).toBe('adminLessonAttendanceAbsent');
  });

  it('explains attendance unavailability only for pending', () => {
    expect(attendanceUnavailableReason(item())).toBe('pending');
    expect(
      attendanceUnavailableReason(item({ lifecycle: { status: 'confirmed' } }))
    ).toBeUndefined();
  });

  it('maps guest-link expired to the server-derived reason key', () => {
    expect(guestLinkUnavailableLabelKey('expired_reservation')).toBe(
      'adminLessonLinkReasonExpired'
    );
  });

  it('shows payer only when the Account display name is not a duplicate of the sole participant', () => {
    expect(shouldShowPayerRow(baseAdmin())).toBe(false);
    expect(
      shouldShowPayerRow({
        ...baseAdmin(),
        payer: { accountId: 'account_payer_01', displayName: 'Canonical Payer' },
      })
    ).toBe(true);
  });

  it('shows cancellation only for pending request or authorized cancel actions', () => {
    expect(shouldShowCancellationSection(item())).toBe(false);
    expect(
      shouldShowCancellationSection(item({ lifecycle: { status: 'pending_cancellation' } }))
    ).toBe(true);
    expect(
      shouldShowCancellationSection(
        item({
          admin: {
            ...baseAdmin(),
            authorizedActions: { ...baseAdmin().authorizedActions, canDirectCancel: true },
          },
        })
      )
    ).toBe(true);
  });
});
