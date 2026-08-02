/** Production-like ids from the ski-school-8f3ca enrollment incident. */
export const PROD_USER_ID = 'F5mwFT8KvAOkYHxlElpagT1yftr1';
export const PROD_COURSE_ID = 'course_1784217360616';

export const prodBookingId = (userId: string, courseId: string) =>
  `booking_course_${userId}_${courseId}`;

export const prodInstructorId = (courseId: string) => `course_${courseId}`;

export type RulesBookingSeed = {
  id: string;
  userId: string;
  instructorId: string;
  instructorName: string;
  instructorAvatar: string;
  date: string;
  time: string;
  durationHours: number;
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'pending_cancellation';
  difficulty: string;
  notes: string;
  isDeleted?: boolean;
};

export const buildCourseEnrollmentBooking = (
  userId: string,
  courseId: string,
  overrides: Partial<RulesBookingSeed> = {}
): RulesBookingSeed => {
  const id = prodBookingId(userId, courseId);
  return {
    id,
    userId,
    instructorId: prodInstructorId(courseId),
    instructorName: 'BASE — Первые повороты (Групповой курс)',
    instructorAvatar: 'https://storage.yandexcloud.net/carve/courses/beginners.jpg',
    date: '2 - 6 Декабря 2026',
    time: '09:00 - 13:00',
    durationHours: 20,
    totalPrice: 199,
    status: 'confirmed',
    difficulty: 'intermediate',
    notes: 'Запись на групповой курс: Learn to ski confidently from scratch.',
    ...overrides,
  };
};

export const buildProdCourseSeed = (courseId: string, availableSeats = 3, price = 199) => ({
  title: 'BASE — Первые повороты',
  duration: '5 days',
  description: 'Learn to ski confidently from scratch',
  dates: '2 - 6 Дecабря 2026, 09:00 - 13:00',
  totalSeats: 5,
  availableSeats,
  price,
  bgImageUrl: 'https://storage.yandexcloud.net/carve/courses/beginners.jpg',
});
