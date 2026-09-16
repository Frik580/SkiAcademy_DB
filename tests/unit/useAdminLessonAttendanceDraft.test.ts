import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import { useAdminLessonAttendanceDraft } from '../../src/features/admin/lesson-bookings/useAdminLessonAttendanceDraft';

function fixture(input?: {
  bookingId?: string;
  attendance?: Array<{ participantId: string; attendanceStatus?: 'present' | 'absent'; revision?: number }>;
}): { detail: LessonBookingReadModel; admin: NonNullable<LessonBookingReadModel['admin']> } {
  const bookingId = input?.bookingId ?? 'booking_draft_01';
  const admin = {
    participants: [
      { participantId: 'participant_a', displayName: 'A' },
      { participantId: 'participant_b', displayName: 'B' },
      { participantId: 'participant_c', displayName: 'C' },
    ],
    attribution: { bookingOrigin: 'admin', bookedBy: { kind: 'account', accountId: 'account_01' } },
    payment: {
      paymentId: 'payment_01',
      status: 'paid',
      revision: 1,
      currency: 'KZT',
      originalPrice: 1,
      price: 1,
      paid: 1,
      refunded: 0,
      retained: 1,
      settled: 1,
      writtenOff: 0,
      outstanding: 0,
    },
    relatedIssues: [],
    relatedOpenChangeRequests: [],
    scheduleRevision: 1,
    serviceParticipantIds: ['participant_a', 'participant_b', 'participant_c'],
    authorizedActions: {
      canConfirmGuest: false,
      canRecordGuestPayment: false,
      canDirectCancel: false,
      canReschedule: false,
      canChangeInstructor: false,
      canChangeDuration: false,
      canRecordAttendance: true,
      canResolveCancellation: false,
      canResolveAttendanceOutcome: false,
      canLinkGuestToAccount: false,
    },
    attendance: input?.attendance ?? [],
  } as NonNullable<LessonBookingReadModel['admin']>;

  const detail = {
    bookingId,
    revision: 1,
    partyKind: 'family_group',
    participantIds: ['participant_a', 'participant_b', 'participant_c'],
    participants: admin.participants,
    instructor: { instructorId: 'instructor_01', displayName: 'Coach' },
    occurrence: {
      startsAt: { seconds: 1, nanoseconds: 0 },
      endsAt: { seconds: 2, nanoseconds: 0 },
      timeZone: 'Asia/Almaty',
      durationMinutes: 60,
    },
    lifecycle: { status: 'confirmed' },
    bookingOrigin: 'admin',
    authorizedActions: {
      canRequestCancellation: false,
      canWithdrawCancellation: false,
      canReschedule: false,
      canCreateChangeRequest: false,
    },
    notes: undefined,
    updatedAt: { seconds: 1, nanoseconds: 0 },
    serviceParticipantIds: ['participant_a', 'participant_b', 'participant_c'],
    admin,
  } as LessonBookingReadModel;

  return { detail, admin };
}

describe('useAdminLessonAttendanceDraft', () => {
  it('disables completeness until every target participant is drafted', () => {
    const { detail, admin } = fixture();
    const { result } = renderHook(() => useAdminLessonAttendanceDraft({ detail, admin }));
    expect(result.current.allTargetParticipantsDrafted).toBe(false);
    act(() => result.current.setParticipantStatus('participant_a', 'present'));
    expect(result.current.allTargetParticipantsDrafted).toBe(false);
    act(() => {
      result.current.setParticipantStatus('participant_b', 'absent');
      result.current.setParticipantStatus('participant_c', 'present');
    });
    expect(result.current.allTargetParticipantsDrafted).toBe(true);
  });

  it('reseeds from server attendance and preserves dirty draft across rerender', () => {
    const seeded = fixture({
      attendance: [{ participantId: 'participant_a', attendanceStatus: 'present', revision: 1 }],
    });
    const { result, rerender } = renderHook(
      ({ detail, admin }) => useAdminLessonAttendanceDraft({ detail, admin }),
      { initialProps: seeded }
    );
    act(() => result.current.setParticipantStatus('participant_b', 'absent'));
    rerender({
      ...seeded,
      detail: { ...seeded.detail, revision: 2 },
    });
    expect(result.current.draft.participant_b).toBe('absent');
    expect(result.current.draft.participant_a).toBe('present');
  });

  it('resets draft when bookingId changes', () => {
    const first = fixture({ bookingId: 'booking_one' });
    const { result, rerender } = renderHook(
      ({ detail, admin }) => useAdminLessonAttendanceDraft({ detail, admin }),
      { initialProps: first }
    );
    act(() => result.current.setParticipantStatus('participant_a', 'absent'));
    const second = fixture({ bookingId: 'booking_two' });
    rerender(second);
    expect(result.current.draft.participant_a).toBeUndefined();
  });
});
