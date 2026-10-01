import type { Firestore, Query } from 'firebase-admin/firestore';
import {
  AdminPlannerOccupancyItemSchema,
  intervalsOverlap,
  type AdminPlannerOccupancyItem,
  type CanonicalReadScope,
  type ParticipantId,
  type TimeInterval,
  LIVE_CANONICAL_READ_SCOPE,
} from '@ski-academy/shared-domain';
import { parseBooking } from '../bookings/bookingStore';
import { parseCourseDay } from '../courses/courseStore';
import { parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { parseIfVisibleInReadScope } from './readModelScope';
import {
  instructorOccupancyWindow,
  isBookingVisibleForOccupancyScope,
  paginateWindowQuery,
} from './instructorOccupancyReadSupport';

const ACTIVE_ENROLLMENT_STATUSES = new Set(['pending', 'confirmed', 'pending_cancellation']);
const PLANNER_OCCUPANCY_LOOKBACK_SECONDS = 48 * 60 * 60;
const ENROLLMENT_SCAN_LIMIT = 50;

function localParts(
  intervalStart: { seconds: number },
  timeZone: string
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(intervalStart.seconds * 1_000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = values.hour === '24' ? '00' : values.hour;
  const date =
    values.hour === '24'
      ? new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1))
      : null;
  return {
    date: date
      ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
      : `${values.year}-${values.month}-${values.day}`,
    time: `${hour}:${values.minute}`,
  };
}

function durationMinutes(interval: TimeInterval): number {
  return Math.max(1, Math.round((interval.endsAt.seconds - interval.startsAt.seconds) / 60));
}

export interface LoadParticipantOccupancyInput {
  readonly participantId: ParticipantId;
  readonly window: TimeInterval;
  readonly readScope?: CanonicalReadScope;
}

export interface LoadParticipantOccupancyResult {
  readonly occupancy: AdminPlannerOccupancyItem[];
  readonly truncated: boolean;
}

export async function loadParticipantOccupancyItems(
  firestore: Firestore,
  input: LoadParticipantOccupancyInput
): Promise<LoadParticipantOccupancyResult> {
  const readScope = input.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  const rangeStart = Math.max(0, input.window.startsAt.seconds - PLANNER_OCCUPANCY_LOOKBACK_SECONDS);
  const rangeEnd = input.window.endsAt.seconds;

  const bookingQuery: Query = firestore
    .collection('bookings')
    .where('party.participantIds', 'array-contains', input.participantId)
    .where('occurrence.interval.startsAt.seconds', '>=', rangeStart)
    .where('occurrence.interval.startsAt.seconds', '<', rangeEnd)
    .orderBy('occurrence.interval.startsAt.seconds', 'asc');

  const bookingPage = await paginateWindowQuery(bookingQuery);
  let truncated = bookingPage.truncated;
  const occupancy: AdminPlannerOccupancyItem[] = [];

  const bookings = bookingPage.docs
    .map((document) => parseIfVisibleInReadScope(document.data(), parseBooking, readScope))
    .filter((booking): booking is NonNullable<typeof booking> => Boolean(booking))
    .filter(
      (booking) =>
        !booking.archival?.isDeleted &&
        isBookingVisibleForOccupancyScope(booking.lifecycle.status, 'active_capacity') &&
        intervalsOverlap(booking.occurrence.interval, input.window) &&
        booking.party.participantIds.includes(input.participantId)
    );

  for (const booking of bookings) {
    const local = localParts(booking.occurrence.interval.startsAt, booking.occurrence.timeZone);
    occupancy.push(
      AdminPlannerOccupancyItemSchema.parse({
        occupancyKind: 'lesson_booking',
        occupancyId: booking.bookingId,
        instructorId: booking.occurrence.instructorId,
        interval: booking.occurrence.interval,
        timeZone: booking.occurrence.timeZone,
        localDate: local.date,
        localTime: local.time,
        durationMinutes: durationMinutes(booking.occurrence.interval),
        displayTitle: 'Booked',
        lifecycleStatus: booking.lifecycle.status,
        revision: booking.revision,
        bookingId: booking.bookingId,
        participantId: input.participantId,
        participantIds: booking.party.participantIds,
      })
    );
  }

  const enrollmentSnapshot = await firestore
    .collection('course_enrollments')
    .where('participantId', '==', input.participantId)
    .limit(ENROLLMENT_SCAN_LIMIT)
    .get();

  const courseIds = new Set<string>();
  for (const document of enrollmentSnapshot.docs) {
    const enrollment = parseIfVisibleInReadScope(
      document.data(),
      parseCourseEnrollment,
      readScope
    );
    if (!enrollment) continue;
    if (!ACTIVE_ENROLLMENT_STATUSES.has(enrollment.lifecycle.status)) continue;
    courseIds.add(enrollment.courseId);
  }

  for (const courseId of courseIds) {
    const dayQuery: Query = firestore
      .collection(`courses/${courseId}/days`)
      .where('interval.startsAt.seconds', '>=', rangeStart)
      .where('interval.startsAt.seconds', '<', rangeEnd)
      .orderBy('interval.startsAt.seconds', 'asc');
    const dayPage = await paginateWindowQuery(dayQuery);
    truncated = truncated || dayPage.truncated;
    for (const document of dayPage.docs) {
      const day = parseIfVisibleInReadScope(document.data(), parseCourseDay, readScope);
      if (!day || !intervalsOverlap(day.interval, input.window)) continue;
      const instructorId = day.actualInstructorIds[0];
      if (!instructorId) continue;
      const local = localParts(day.interval.startsAt, day.timeZone);
      occupancy.push(
        AdminPlannerOccupancyItemSchema.parse({
          occupancyKind: 'course_day',
          occupancyId: day.courseDayId,
          instructorId,
          interval: day.interval,
          timeZone: day.timeZone,
          localDate: local.date,
          localTime: local.time,
          durationMinutes: durationMinutes(day.interval),
          displayTitle: 'Course day',
          revision: day.revision,
          courseId: day.courseId,
          courseDayId: day.courseDayId,
          participantId: input.participantId,
        })
      );
    }
  }

  return { occupancy, truncated };
}

export function participantOccupancyWindow(
  localDate: string,
  timeZone: string,
  windowDays = 1
): TimeInterval {
  return instructorOccupancyWindow(localDate, timeZone, windowDays);
}
