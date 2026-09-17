import type { Booking, Instructor, UserProfile } from '../../../../types';
import type { TranslationKey } from '../../../../app/providers/LanguageContext';
import { getMyInstructors } from './studentBookingOverview';

export const getRecommendedInstructors = (
  userProfile: UserProfile,
  instructors: Instructor[],
  bookings: Booking[],
  limit = 2
): Instructor[] => {
  const myIds = new Set(getMyInstructors(bookings, instructors, userProfile.uid).map((i) => i.id));

  return instructors
    .filter((i) => i.isAvailable && !myIds.has(i.id))
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.reviewsCount - a.reviewsCount)
    .slice(0, limit);
};

export type InstructorPickerGroup = {
  id: string;
  labelKey: TranslationKey;
  subtitleKey?: TranslationKey;
  instructors: Instructor[];
  bookLabelKey?: TranslationKey;
};

export const getInstructorPickerGroups = (
  userProfile: UserProfile,
  bookings: Booking[],
  instructors: Instructor[]
): InstructorPickerGroup[] => {
  const myInstructors = getMyInstructors(bookings, instructors, userProfile.uid);
  const recommended = getRecommendedInstructors(userProfile, instructors, bookings, 5);
  const shownIds = new Set([...myInstructors.map((i) => i.id), ...recommended.map((i) => i.id)]);
  const others = instructors.filter((i) => i.isAvailable && !shownIds.has(i.id));

  const groups: InstructorPickerGroup[] = [];
  if (myInstructors.length > 0) {
    groups.push({
      id: 'my',
      labelKey: 'scMyInstructors',
      subtitleKey: 'scMyInstructorsSub',
      instructors: myInstructors,
      bookLabelKey: 'scBookAgain',
    });
  }
  if (recommended.length > 0) {
    groups.push({
      id: 'recommended',
      labelKey: 'scRecommendedInstructors',
      subtitleKey: 'scRecommendedInstructorsSub',
      instructors: recommended,
    });
  }
  if (others.length > 0) {
    groups.push({
      id: 'others',
      labelKey: 'scAvailableInstructors',
      instructors: others,
    });
  }
  return groups;
};
