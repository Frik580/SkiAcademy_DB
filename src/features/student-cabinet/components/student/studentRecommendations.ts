import type { Booking, Course, Instructor, UserProfile } from '../../../../types';
import type { TranslationKey } from '../../../../app/providers/LanguageContext';
import { getEnrolledCourses, getMyInstructors } from './studentBookingOverview';

const USER_LEVEL_TO_COURSE_LEVEL: Record<number, NonNullable<Course['level']>> = {
  1: 'beginner',
  2: 'intermediate',
  3: 'advanced',
  4: 'expert',
};

export const getRecommendedCourses = (
  userProfile: UserProfile,
  courses: Course[],
  bookings: Booking[],
  limit = 2
): Course[] => {
  const targetLevel = USER_LEVEL_TO_COURSE_LEVEL[userProfile.level || 1] ?? 'beginner';
  const enrolledIds = new Set(
    getEnrolledCourses(bookings, courses, userProfile.uid).map((c) => c.id)
  );

  return courses
    .filter((c) => !c.isHidden && !enrolledIds.has(c.id) && c.availableSeats > 0)
    .sort((a, b) => {
      const aMatch = a.level === targetLevel ? 0 : 1;
      const bMatch = b.level === targetLevel ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return (a.order ?? 999) - (b.order ?? 999);
    })
    .slice(0, limit);
};

export const getRecommendedInstructors = (
  userProfile: UserProfile,
  instructors: Instructor[],
  bookings: Booking[],
  limit = 2
): Instructor[] => {
  const myIds = new Set(getMyInstructors(bookings, instructors, userProfile.uid).map((i) => i.id));

  return instructors
    .filter((i) => i.isAvailable && !myIds.has(i.id))
    .sort((a, b) => b.rating - a.rating || b.reviewsCount - a.reviewsCount)
    .slice(0, limit);
};

export type NextLessonBookingTarget =
  | { kind: 'instructor'; instructor: Instructor }
  | { kind: 'course'; course: Course }
  | { kind: 'pick'; tab: 'coach' | 'courses' };

/** Best target when the student taps «Book next lesson». */
export const resolveNextLessonBookingTarget = (
  userProfile: UserProfile,
  bookings: Booking[],
  courses: Course[],
  instructors: Instructor[]
): NextLessonBookingTarget => {
  const myInstructors = getMyInstructors(bookings, instructors, userProfile.uid);
  const recentAvailable = myInstructors.find((i) => i.isAvailable);
  if (recentAvailable) return { kind: 'instructor', instructor: recentAvailable };

  const recommendedInstructor = getRecommendedInstructors(userProfile, instructors, bookings, 1)[0];
  if (recommendedInstructor) return { kind: 'instructor', instructor: recommendedInstructor };

  const fallbackInstructor = instructors.find((i) => i.isAvailable);
  if (fallbackInstructor) return { kind: 'instructor', instructor: fallbackInstructor };

  const recommendedCourse = getRecommendedCourses(userProfile, courses, bookings, 1)[0];
  if (recommendedCourse) return { kind: 'course', course: recommendedCourse };

  return { kind: 'pick', tab: myInstructors.length > 0 ? 'coach' : 'courses' };
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
