import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  selectLessonBookingItems,
  useLessonBookingStore,
} from '../../src/features/lesson-bookings/lessonBookingStore';
import { useLessonBookingReadSync } from '../../src/features/lesson-bookings/useLessonBookingReadSync';
import { isBookingUpcomingBySchedule } from '../../src/features/student-cabinet/components/student/studentBookingSchedule';
import { filterBookingsByScope } from '../../src/features/student-cabinet/components/student/studentBookingOverview';
import { shouldSyncAccountLessonBookings } from '../../src/store/accountLessonBookingSync';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const queryLessonBookingReadModelsMock = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonBookingReadModelsMock(...args),
}));

function buildFutureAccountHotItem(bookingId: string) {
  const participantId = ParticipantIdSchema.parse('participant_cabinet_upcoming_01');
  const startsAt = timestampFromDate(new Date('2027-06-15T04:00:00.000Z'));
  const endsAt = timestampFromDate(new Date('2027-06-15T06:00:00.000Z'));
  return {
    bookingId: BookingIdSchema.parse(bookingId),
    revision: 1,
    partyKind: 'individual' as const,
    participantIds: [participantId],
    participants: [{ participantId, displayName: 'Cabinet Student' }],
    instructor: {
      instructorId: InstructorIdSchema.parse('instructor_cabinet_upcoming_01'),
      displayName: 'Coach',
    },
    occurrence: {
      startsAt,
      endsAt,
      timeZone: 'Asia/Almaty',
      durationMinutes: 120,
    },
    lifecycle: { status: 'confirmed' as const },
    bookingOrigin: 'account' as const,
    authorizedActions: {
      canRequestCancellation: true,
      canWithdrawCancellation: false,
      canReschedule: true,
    },
    paymentPresentation: {
      kind: 'visible' as const,
      paymentStatus: 'paid' as const,
      price: 25000,
    },
    updatedAt: timestampFromDate(new Date('2026-06-01T00:00:00.000Z')),
  };
}

describe('Student Cabinet upcoming individual Booking regression (T32.9A.9A)', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
    queryLessonBookingReadModelsMock.mockReset();
  });

  it('enables canonical account_hot sync for dual-role and admin accounts on /cabinet', () => {
    expect(
      shouldSyncAccountLessonBookings({
        pathname: '/cabinet',
        accountId: 'admin_or_dual_role_account',
      })
    ).toBe(true);
  });

  it('loads a canonical future Booking into the cabinet store via account_hot and keeps it upcoming', async () => {
    const bookingId = 'booking_cabinet_upcoming_01';
    queryLessonBookingReadModelsMock
      .mockResolvedValueOnce({
        scope: 'account_hot',
        items: [buildFutureAccountHotItem(bookingId)],
        hasMore: false,
      })
      .mockResolvedValueOnce({ scope: 'account_history', items: [], hasMore: false });

    renderHook(() => useLessonBookingReadSync(true, 'account_cabinet_upcoming_01'));

    await waitFor(() => {
      expect(queryLessonBookingReadModelsMock).toHaveBeenCalledWith({ scope: 'account_hot' });
    });

    await waitFor(() => {
      expect(useLessonBookingStore.getState().items.has(bookingId)).toBe(true);
    });

    const items = selectLessonBookingItems(useLessonBookingStore.getState());
    expect(items).toHaveLength(1);
    expect(items[0]?.bookingId).toBe(bookingId);
    expect(items[0]?.status).toBe('confirmed');

    const now = new Date('2026-09-07T00:00:00.000Z');
    expect(isBookingUpcomingBySchedule(items[0]!, [], now)).toBe(true);
    expect(filterBookingsByScope(items, 'upcoming', [], now).map((item) => item.bookingId)).toEqual(
      [bookingId]
    );
  });

  it('keeps legacy bookings sync OFF in the cutover wiring', () => {
    const bookingSync = readFileSync(
      join(process.cwd(), 'src/features/bookings/sync/useBookingsSync.ts'),
      'utf8'
    );
    const storeSync = readFileSync(join(process.cwd(), 'src/store/useStoreSync.ts'), 'utf8');

    expect(bookingSync).toContain('useBookingsStore.getState().setBookings([])');
    expect(bookingSync).not.toContain("collection(db, 'bookings')");
    expect(storeSync).toContain('shouldSyncAccountLessonBookings');
    expect(storeSync).not.toContain("userProfile?.role === 'user'");
    expect(storeSync).not.toContain('!userProfile?.instructorId');
  });
});
