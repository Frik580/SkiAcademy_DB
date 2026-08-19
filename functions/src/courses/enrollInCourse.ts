import { Firestore } from 'firebase-admin/firestore';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import {
  loadIdempotencyReplay,
  idempotencySpecFromRequest,
  writeIdempotentResult,
} from '../idempotency';
import { recordWalletLedgerEntryInTransaction, walletLedgerEntryId } from '../walletLedger';

type EnrollCourseInput = { courseId: string; language?: 'en' | 'ru' };

function parseInput(data: unknown): EnrollCourseInput {
  if (
    !data ||
    typeof data !== 'object' ||
    typeof (data as Record<string, unknown>).courseId !== 'string'
  ) {
    throw new HttpsError('invalid-argument', 'courseId is required.');
  }
  const payload = data as Record<string, unknown>;
  const courseId = payload.courseId as string;
  const normalizedCourseId = courseId.trim();
  if (!normalizedCourseId) throw new HttpsError('invalid-argument', 'courseId is required.');
  return { courseId: normalizedCourseId, language: payload.language === 'ru' ? 'ru' : 'en' };
}

export function enrollInCourseHandler(db: Firestore) {
  return async (request: CallableRequest<unknown>) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Authentication is required.');
    }

    const { courseId, language } = parseInput(request.data);
    const userId = request.auth.uid;
    const courseRef = db.collection('courses').doc(courseId);
    const userRef = db.collection('users').doc(userId);
    const bookingId = `booking_course_${userId}_${courseId}`;
    const bookingRef = db.collection('bookings').doc(bookingId);

    const spec = idempotencySpecFromRequest(request.data, `enrollInCourse_${userId}`, {
      courseId,
      language,
    });

    return db.runTransaction(async (transaction) => {
      const { ref: idempotencyRef, replay } = await loadIdempotencyReplay<{
        bookingId: string;
        newBalance: number;
        courseTitle: string;
        availableSeats: number;
      }>(transaction, db, spec);

      const [courseSnap, userSnap, bookingSnap] = await Promise.all([
        transaction.get(courseRef),
        transaction.get(userRef),
        transaction.get(bookingRef),
      ]);
      if (!courseSnap.exists) throw new HttpsError('not-found', 'Course does not exist.');
      if (!userSnap.exists) throw new HttpsError('not-found', 'User profile does not exist.');

      const course = courseSnap.data() as Record<string, unknown>;
      const user = userSnap.data() as Record<string, unknown>;
      const availableSeats = course.availableSeats;
      const price = course.price;
      if (typeof availableSeats !== 'number' || typeof price !== 'number') {
        throw new HttpsError('failed-precondition', 'Course has invalid seat or price data.');
      }
      const balance = typeof user.balanceUSD === 'number' ? user.balanceUSD : 0;
      const courseTitle = typeof course.title === 'string' ? course.title : courseId;
      const activeEnrollment =
        bookingSnap.exists &&
        (bookingSnap.data() as Record<string, unknown>).status !== 'cancelled' &&
        (bookingSnap.data() as Record<string, unknown>).isDeleted !== true;

      if (replay && activeEnrollment) {
        return replay;
      }

      if (bookingSnap.exists) {
        const previous = bookingSnap.data() as Record<string, unknown>;
        if (previous.status !== 'cancelled' && previous.isDeleted !== true) {
          const result = {
            bookingId,
            newBalance: balance,
            courseTitle:
              typeof previous.instructorName === 'string' ? previous.instructorName : courseTitle,
            availableSeats,
          };
          if (idempotencyRef && spec) {
            writeIdempotentResult(transaction, idempotencyRef, spec.requestSignature, result);
          }
          return result;
        }
      }
      if (availableSeats <= 0) throw new HttpsError('failed-precondition', 'COURSE_FULL');

      if (balance < price) throw new HttpsError('failed-precondition', 'INSUFFICIENT_FUNDS');

      const createdAt = new Date().toISOString();
      const newBalance = balance - price;
      const courseDates = typeof course.dates === 'string' ? course.dates : '';
      const courseDuration = typeof course.duration === 'string' ? course.duration : '';

      transaction.update(userRef, { balanceUSD: newBalance });
      transaction.set(bookingRef, {
        id: bookingId,
        userId,
        courseId,
        instructorId: `course_${courseId}`,
        instructorName: courseTitle,
        instructorAvatar: typeof course.bgImageUrl === 'string' ? course.bgImageUrl : '',
        date: courseDates,
        time: language === 'ru' ? 'Групповое расписание' : 'Group schedule',
        durationHours: 10,
        totalPrice: price,
        status: 'confirmed',
        difficulty: 'intermediate',
        notes: courseDuration,
        createdAt,
      });
      transaction.update(courseRef, { availableSeats: availableSeats - 1 });
      recordWalletLedgerEntryInTransaction(transaction, db, {
        userId,
        amount: -price,
        balanceAfter: newBalance,
        type: 'course_payment',
        subjectName: courseTitle,
        bookingId,
        courseId,
        entryId: walletLedgerEntryId('course_payment', `${bookingId}__${createdAt}`),
      });

      const result = { bookingId, newBalance, courseTitle, availableSeats: availableSeats - 1 };
      if (idempotencyRef && spec) {
        writeIdempotentResult(transaction, idempotencyRef, spec.requestSignature, result);
      }
      return result;
    });
  };
}
