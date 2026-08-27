import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  selectLessonBookingItems,
  useLessonBookingStore,
} from '../../src/features/lesson-bookings/lessonBookingStore';
import type { LessonBookingCabinetItem } from '../../src/features/lesson-bookings/lessonBookingContracts';

function cabinetItem(
  bookingId: string,
  revision: number,
  date = '2026-06-15'
): LessonBookingCabinetItem {
  return {
    id: bookingId,
    bookingId,
    revision,
    status: 'confirmed',
    date,
    time: '08:00',
    durationHours: 2,
    instructorId: 'instructor_fixture_01',
    instructorName: 'Coach',
    instructorAvatar: '',
    participantNames: ['Alice'],
    partyKind: 'individual',
    payment: { kind: 'visible', paymentStatus: 'settled' },
    bookingOrigin: 'account',
    isLessonBooking: true,
  };
}

describe('lessonBookingStore', () => {
  beforeEach(() => {
    useLessonBookingStore.getState().reset();
  });

  it('mergeItems never replaces a newer cached revision with an older one', () => {
    const store = useLessonBookingStore.getState();
    store.mergeItems(new Map([['booking_a', cabinetItem('booking_a', 4)]]));
    store.mergeItems(new Map([['booking_a', cabinetItem('booking_a', 2)]]));
    expect(useLessonBookingStore.getState().items.get('booking_a')?.revision).toBe(4);
    store.mergeItems(new Map([['booking_a', cabinetItem('booking_a', 6)]]));
    expect(useLessonBookingStore.getState().items.get('booking_a')?.revision).toBe(6);
  });

  it('keeps a stable itemsList snapshot when mergeItems makes no revision changes', () => {
    const store = useLessonBookingStore.getState();
    store.mergeItems(new Map([['booking_a', cabinetItem('booking_a', 4)]]));
    const before = useLessonBookingStore.getState();
    store.mergeItems(new Map([['booking_a', cabinetItem('booking_a', 2)]]));
    const after = useLessonBookingStore.getState();
    expect(after.itemsList).toBe(before.itemsList);
    expect(after.items).toBe(before.items);
  });

  it('selectLessonBookingItems returns the cached store snapshot', () => {
    const store = useLessonBookingStore.getState();
    store.mergeItems(new Map([['booking_a', cabinetItem('booking_a', 1)]]));
    const state = useLessonBookingStore.getState();
    expect(selectLessonBookingItems(state)).toBe(state.itemsList);
    expect(selectLessonBookingItems(state)).toBe(selectLessonBookingItems(state));
  });

  it('subscribing with selectLessonBookingItems does not rerender on no-op merges', () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount += 1;
      return useLessonBookingStore(selectLessonBookingItems);
    });
    expect(renderCount).toBe(1);
    act(() => {
      useLessonBookingStore.getState().mergeItems(
        new Map([['booking_a', cabinetItem('booking_a', 1)]])
      );
    });
    expect(renderCount).toBe(2);
    act(() => {
      useLessonBookingStore.getState().mergeItems(
        new Map([['booking_a', cabinetItem('booking_a', 1)]])
      );
    });
    expect(renderCount).toBe(2);
  });
});
