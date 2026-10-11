import { createRequire } from 'node:module';
import { canonicalTimestampToEpochMs } from '../packages/shared-domain/src/canonical/bookingCancellationPolicy';
import type { E2ERuntimeConfig } from './global-setup';
import {
  attemptAuthenticatedCancellation,
  attemptAuthenticatedCourseEnrollmentCancellation,
} from './callable-client';

const requireFunctions = createRequire(`${process.cwd()}/functions/package.json`);
const { BookingSchema, CourseEnrollmentSchema, CourseDaySchema } = requireFunctions(
  '@ski-academy/shared-domain'
) as typeof import('@ski-academy/shared-domain');

export interface ExpectedNextSession {
  id: string;
  kind: 'lesson' | 'course_day';
  title?: string;
  date: string;
  time: string;
  bookingId?: string;
  courseId?: string;
  courseDayId?: string;
  enrollmentIds: string[];
  participantIds: string[];
  sourceRecord: unknown;
}

const resortDate = (date: Date, timeZone = 'Asia/Almaty') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(date);
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join('-');
};

// Independent oracle from canonical emulator records, not the application's deduplication result.
export async function expectedNextSessions(
  db: import('firebase-admin/firestore').Firestore,
  runtime: E2ERuntimeConfig,
  now: number
): Promise<ExpectedNextSession[]> {
  const today = resortDate(new Date(now));
  const lastDay = new Date(`${today}T12:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() + 6);
  const lastDate = lastDay.toISOString().slice(0, 10);
  const inWindow = (
    interval: {
      startsAt: { seconds: number; nanoseconds: number };
      endsAt: { seconds: number; nanoseconds: number };
    },
    timeZone = 'Asia/Almaty'
  ) => {
    const date = resortDate(new Date(canonicalTimestampToEpochMs(interval.startsAt)), timeZone);
    return date >= today && date <= lastDate && canonicalTimestampToEpochMs(interval.endsAt) >= now;
  };
  const describe = (
    interval: {
      startsAt: { seconds: number; nanoseconds: number };
      endsAt: { seconds: number; nanoseconds: number };
    },
    timeZone = 'Asia/Almaty'
  ) => {
    const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
    return {
      date: resortDate(new Date(canonicalTimestampToEpochMs(interval.startsAt)), timeZone),
      time: `${time.format(new Date(canonicalTimestampToEpochMs(interval.startsAt)))}–${time.format(new Date(canonicalTimestampToEpochMs(interval.endsAt)))}`,
    };
  };
  const bookings = await db
    .collection('bookings')
    .where('payerAccountId', '==', runtime.studentUid)
    .get();
  const expected: ExpectedNextSession[] = bookings.docs
    .map((doc) => BookingSchema.parse(doc.data()))
    .filter(
      (booking) =>
        ['pending', 'confirmed'].includes(booking.lifecycle.status) &&
        inWindow(booking.occurrence.interval, booking.occurrence.timeZone)
    )
    .map((booking) => ({
      id: `lesson:${booking.bookingId}`,
      kind: 'lesson',
      bookingId: booking.bookingId,
      ...describe(booking.occurrence.interval, booking.occurrence.timeZone),
      enrollmentIds: [],
      participantIds: [...booking.party.participantIds],
      sourceRecord: booking,
    }));
  const enrollmentDocs = await db
    .collection('course_enrollments')
    .where('participantId', 'in', [runtime.studentParticipantId, runtime.studentChildParticipantId])
    .get();
  const enrollments = enrollmentDocs.docs
    .map((doc) => CourseEnrollmentSchema.parse(doc.data()))
    .filter((enrollment) =>
      ['pending', 'confirmed', 'pending_cancellation'].includes(enrollment.lifecycle.status)
    );
  for (const courseId of new Set(enrollments.map((enrollment) => enrollment.courseId))) {
    const members = enrollments.filter((enrollment) => enrollment.courseId === courseId);
    const course = await db.doc(`courses/${courseId}`).get();
    const days = await db.collection(`courses/${courseId}/days`).get();
    for (const day of days.docs
      .map((doc) => CourseDaySchema.parse(doc.data()))
      .filter((day) => inWindow(day.interval))) {
      expected.push({
        id: `course_day:${courseId}:${day.courseDayId}`,
        kind: 'course_day',
        courseId,
        courseDayId: day.courseDayId,
        title: course.data()?.title,
        ...describe(day.interval),
        enrollmentIds: members.map((enrollment) => enrollment.enrollmentId),
        participantIds: members.map((enrollment) => enrollment.participantId),
        sourceRecord: { course: course.data(), day, enrollments: members },
      });
    }
  }
  return expected;
}

// Cancel only this attempt's owned records through server commands; retain canonical audit evidence.
export async function cleanupNextSessionAttempt(
  db: import('firebase-admin/firestore').Firestore,
  runtime: E2ERuntimeConfig,
  courseId: string,
  bookingId?: string
): Promise<void> {
  const results = [];
  if (bookingId) {
    const booking = BookingSchema.parse((await db.doc(`bookings/${bookingId}`).get()).data());
    if (booking.lifecycle.status === 'confirmed') {
      results.push(
        await attemptAuthenticatedCancellation({
          email: runtime.studentEmail,
          password: runtime.studentPassword,
          bookingId,
          expectedRevision: booking.revision,
          exercisedCapability: 'parent_guardian',
        })
      );
    }
  }
  const enrollments = await db
    .collection('course_enrollments')
    .where('courseId', '==', courseId)
    .get();
  for (const doc of enrollments.docs) {
    const enrollment = CourseEnrollmentSchema.parse(doc.data());
    if (
      ![runtime.studentParticipantId, runtime.studentChildParticipantId].includes(
        enrollment.participantId
      )
    ) {
      throw new Error('Refusing to clean a course enrollment owned by another Participant.');
    }
    if (enrollment.lifecycle.status === 'confirmed') {
      results.push(
        await attemptAuthenticatedCourseEnrollmentCancellation({
          email: runtime.studentEmail,
          password: runtime.studentPassword,
          enrollmentId: enrollment.enrollmentId,
          expectedRevision: enrollment.revision,
          exercisedCapability:
            enrollment.participantId === runtime.studentParticipantId
              ? 'account_owner'
              : 'parent_guardian',
        })
      );
    }
  }
  if (results.some((result) => !result.ok || result.resultStatus !== 'success')) {
    throw new Error(`Next Session fixture cancellation failed: ${JSON.stringify(results)}`);
  }
}
