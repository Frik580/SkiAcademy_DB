import { randomUUID } from 'node:crypto';
import { Firestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';

type GuestCourseEnrollmentInput = {
  courseId: string;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  guestNotes?: string;
  language?: 'en' | 'ru';
};

type CourseRecord = {
  title?: string;
  dates?: string;
  price?: number;
  bgImageUrl?: string;
  availableSeats?: number;
};

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${field} must be a string.`);
  }
  return value.trim();
}

function parseInput(data: unknown): GuestCourseEnrollmentInput {
  if (!data || typeof data !== 'object') {
    throw new HttpsError('invalid-argument', 'Guest course enrollment payload is required.');
  }

  const payload = data as Record<string, unknown>;
  const language = payload.language === 'ru' ? 'ru' : 'en';
  return {
    courseId: requireText(payload.courseId, 'courseId'),
    guestName: requireText(payload.guestName, 'guestName'),
    guestPhone: requireText(payload.guestPhone, 'guestPhone'),
    guestEmail: optionalText(payload.guestEmail, 'guestEmail'),
    guestNotes: optionalText(payload.guestNotes, 'guestNotes'),
    language,
  };
}

export function createGuestCourseEnrollmentHandler(db: Firestore) {
  return async (request: CallableRequest<unknown>) => {
    const input = parseInput(request.data);
    const bookingId = `guest_course_${input.courseId}_${randomUUID()}`;
    const guestId = `guest_${randomUUID()}`;
    const courseRef = db.collection('courses').doc(input.courseId);

    return db.runTransaction(async (transaction) => {
      const courseSnap = await transaction.get(courseRef);
      if (!courseSnap.exists) throw new HttpsError('not-found', 'Course does not exist.');

      const course = courseSnap.data() as CourseRecord;
      if (typeof course.price !== 'number' || typeof course.availableSeats !== 'number') {
        throw new HttpsError('failed-precondition', 'Course has invalid seat or price data.');
      }
      if (course.availableSeats <= 0) {
        throw new HttpsError('failed-precondition', 'COURSE_FULL');
      }

      const localizedPrefix = input.language === 'ru' ? 'Заявка на курс' : 'Course request';
      const notes = input.guestNotes
        ? `${localizedPrefix} "${course.title ?? input.courseId}". ${input.guestNotes}`
        : `${localizedPrefix} "${course.title ?? input.courseId}"`;
      const createdAt = new Date().toISOString();

      transaction.set(db.collection('bookings').doc(bookingId), {
        id: bookingId,
        userId: guestId,
        courseId: input.courseId,
        instructorId: `course_${input.courseId}`,
        instructorName: `${localizedPrefix}: ${course.title ?? input.courseId}`,
        instructorAvatar: course.bgImageUrl ?? '',
        date: course.dates ?? '',
        time: input.language === 'ru' ? 'Групповое расписание' : 'Group schedule',
        durationHours: 10,
        totalPrice: course.price,
        status: 'pending',
        difficulty: 'intermediate',
        notes,
        isGuest: true,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        guestEmail: input.guestEmail,
        createdAt,
      });
      transaction.update(courseRef, { availableSeats: course.availableSeats - 1 });

      return { bookingId, availableSeats: course.availableSeats - 1 };
    });
  };
}
