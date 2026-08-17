import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../infrastructure/firebase';

export interface EnrollInCourseResult {
  bookingId: string;
  newBalance: number;
  courseTitle: string;
  availableSeats: number;
}

const enrollInCourse = httpsCallable<
  { courseId: string; language: 'en' | 'ru' },
  EnrollInCourseResult
>(functions, 'enrollInCourse');

export async function enrollInCourseViaCallable(
  courseId: string,
  language: 'en' | 'ru'
): Promise<EnrollInCourseResult> {
  try {
    const { data } = await enrollInCourse({ courseId, language });
    return data;
  } catch (error) {
    if (error instanceof FirebaseError) {
      if (error.code === 'functions/already-exists') throw new Error('ALREADY_ENROLLED');
      if (error.code === 'functions/failed-precondition') {
        if (error.message.includes('COURSE_FULL')) throw new Error('COURSE_FULL');
        if (error.message.includes('INSUFFICIENT_FUNDS')) throw new Error('INSUFFICIENT_FUNDS');
      }
    }
    throw error;
  }
}
