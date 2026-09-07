import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('T32.9A.9A individual Booking lifecycle cutover boundary', () => {
  it('does not export legacy individual Booking callables or the legacy auto-completion writer', () => {
    const functionsIndex = readRepoFile('functions/src/index.ts');
    for (const exportName of [
      'createBooking',
      'addBooking',
      'createGuestBooking',
      'updateBookingSchedule',
      'linkGuestBooking',
      'completeBooking',
      'cancelBooking',
      'confirmBooking',
      'deleteBooking',
      'requestBookingCancellation',
      'scheduledAutoCompleteBookings',
    ]) {
      expect(functionsIndex).not.toContain(`export const ${exportName}`);
    }
    expect(functionsIndex).not.toContain("from './bookings/autoComplete'");
  });

  it('keeps active app routes off legacy Booking reads and recommendation writes', () => {
    const bookingSync = readRepoFile('src/features/bookings/sync/useBookingsSync.ts');
    const instructorRoute = readRepoFile('src/app/routes/InstructorRouteContainer.tsx');
    const instructorWorkspace = readRepoFile(
      'src/features/instructor-workspace/components/useInstructorWorkspace.ts'
    );
    const instructorCard = readRepoFile(
      'src/features/instructor-workspace/components/InstructorBookingCard.tsx'
    );
    const cabinetRoute = readRepoFile('src/app/routes/CabinetRouteContainer.tsx');
    const firebaseInfrastructure = readRepoFile('src/infrastructure/firebase/firebase.ts');

    expect(bookingSync).not.toContain("collection(db, 'bookings')");
    expect(bookingSync).not.toContain('getRealtimeBookingsQuery');
    expect(bookingSync).not.toContain('getBookingHistoryPage');
    expect(instructorRoute).not.toContain('state.bookings');
    expect(instructorWorkspace).not.toContain('saveBookingRecommendationsService');
    expect(instructorWorkspace).not.toContain('completeBookingService');
    expect(instructorWorkspace).not.toContain('confirmBookingService');
    expect(instructorCard).not.toContain('InstructorRecommendationsEditor');
    expect(cabinetRoute).not.toContain('onToggleRecommendation=');
    expect(cabinetRoute).not.toContain('toggleRecommendationService');
    expect(firebaseInfrastructure).not.toContain("updateDoc(doc(db, 'bookings'");
  });

  it('keeps Student Cabinet upcoming individual Bookings on canonical account_hot owner', () => {
    const storeSync = readRepoFile('src/store/useStoreSync.ts');
    const lessonSync = readRepoFile('src/features/lesson-bookings/useLessonBookingReadSync.ts');
    const cabinetRoute = readRepoFile('src/app/routes/CabinetRouteContainer.tsx');
    const bookingSync = readRepoFile('src/features/bookings/sync/useBookingsSync.ts');
    const accountLessonGate = readRepoFile('src/store/accountLessonBookingSync.ts');

    expect(storeSync).toContain('useLessonBookingReadSync(isCustomerCanonicalLessonPath');
    expect(storeSync).toContain('shouldSyncAccountLessonBookings');
    expect(storeSync).not.toContain("userProfile?.role === 'user'");
    expect(accountLessonGate).toContain("input.pathname.startsWith('/cabinet')");
    expect(lessonSync).toContain("scope: 'account_hot'");
    expect(lessonSync).toContain('queryLessonBookingReadModels');
    expect(cabinetRoute).toContain('useLessonBookingStore(selectLessonBookingItems)');
    expect(cabinetRoute).not.toContain('state.bookings');
    expect(bookingSync).toContain('setBookings([])');
    expect(bookingSync).not.toContain("collection(db, 'bookings')");
  });
});
