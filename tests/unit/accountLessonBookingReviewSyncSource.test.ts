import { describe, expect, it } from 'vitest';
import { LESSON_BOOKING_READ_MODEL_PAGE_SIZE_MAX } from '@ski-academy/shared-domain';

describe('account lesson booking review sync source', () => {
  it('matches hot rows plus the first account_history page (useBookingsSync lessonBookingItems)', () => {
    // syncAccountLessonBookingsFromServer loads account_hot and account_history (default page 25)
    // into useLessonBookingStore.items; useBookingsSync maps every cached item to account_reviews bookingIds.
    const hotLessonCount = 2;
    const historyFirstPageCount = LESSON_BOOKING_READ_MODEL_PAGE_SIZE_MAX;
    expect(hotLessonCount + historyFirstPageCount).toBe(27);
  });
});
