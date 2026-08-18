import { callFunction, toFunctionsClientError } from '../../lib/functions/functionsClient';

export interface EnrollInCourseResult {
  bookingId: string;
  newBalance: number;
  courseTitle: string;
  availableSeats: number;
}

export async function enrollInCourseViaCallable(
  courseId: string,
  language: 'en' | 'ru'
): Promise<EnrollInCourseResult> {
  try {
    return await callFunction<{ courseId: string; language: 'en' | 'ru' }, EnrollInCourseResult>(
      'enrollInCourse',
      { courseId, language },
      { idempotencyKey: `course_${courseId}` }
    );
  } catch (error) {
    const normalizedError = toFunctionsClientError(error);
    if (normalizedError.code === 'functions/already-exists') throw new Error('ALREADY_ENROLLED');
    if (normalizedError.code === 'functions/failed-precondition') {
      if (normalizedError.message.includes('COURSE_FULL')) throw new Error('COURSE_FULL');
      if (normalizedError.message.includes('INSUFFICIENT_FUNDS'))
        throw new Error('INSUFFICIENT_FUNDS');
    }
    throw normalizedError;
  }
}
