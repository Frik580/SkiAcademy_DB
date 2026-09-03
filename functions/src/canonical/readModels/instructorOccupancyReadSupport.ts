import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  AdministrativeAvailabilityBlockSchema,
  AdminPlannerOccupancyItemSchema,
  ADMIN_PLANNER_READ_MODEL_PAGE_SIZE_MAX,
  IanaTimeZoneSchema,
  TimeIntervalSchema,
  intervalsOverlap,
  localCalendarInputToUtcDate,
  timestampFromDate,
  type AdminPlannerOccupancyItem,
  type InstructorId,
  type TimeInterval,
} from '@ski-academy/shared-domain';
import { parseBooking } from '../bookings/bookingStore';
import { parseCourse, parseCourseDay } from '../courses/courseStore';
import { parseAdministrativeAvailabilityBlock } from '../availability/administrativeAvailabilityBlockStore';

const ACTIVE_BOOKING_STATUSES = new Set(['pending', 'confirmed', 'pending_cancellation']);
const PLANNER_QUERY_PAGE_SIZE = 300;
const PLANNER_QUERY_SCAN_CAP = 2_000;
const PLANNER_OCCUPANCY_LOOKBACK_SECONDS = 48 * 60 * 60;

export function instructorOccupancyWindow(
  localDate: string,
  timeZone: string,
  windowDays = 1
): TimeInterval {
  const start = localCalendarInputToUtcDate(
    { localDate, localTime: '00:00', durationMinutes: 60 },
    IanaTimeZoneSchema.parse(timeZone)
  );
  const end = new Date(start.getTime() + windowDays * 24 * 60 * 60 * 1000);
  return TimeIntervalSchema.parse({
    startsAt: timestampFromDate(start),
    endsAt: timestampFromDate(end),
  });
}

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
    hour12: false,
  }).formatToParts(new Date(intervalStart.seconds * 1_000));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour === '24' ? '00' : values.hour}:${values.minute}`,
  };
}

function durationMinutes(interval: TimeInterval): number {
  return Math.max(1, Math.round((interval.endsAt.seconds - interval.startsAt.seconds) / 60));
}

async function paginateWindowQuery(
  baseQuery: Query,
  scanCap = PLANNER_QUERY_SCAN_CAP
): Promise<{ docs: QueryDocumentSnapshot[]; truncated: boolean }> {
  const docs: QueryDocumentSnapshot[] = [];
  let query: Query = baseQuery.limit(PLANNER_QUERY_PAGE_SIZE);
  for (;;) {
    const snapshot = await query.get();
    docs.push(...snapshot.docs);
    if (snapshot.docs.length < PLANNER_QUERY_PAGE_SIZE) {
      return { docs, truncated: false };
    }
    if (docs.length >= scanCap) {
      return { docs, truncated: true };
    }
    const last = snapshot.docs[snapshot.docs.length - 1];
    if (!last) {
      return { docs, truncated: false };
    }
    query = baseQuery.startAfter(last).limit(PLANNER_QUERY_PAGE_SIZE);
  }
}

export interface LoadInstructorOccupancyInput {
  readonly window: TimeInterval;
  readonly instructorId?: InstructorId;
}

export interface LoadInstructorOccupancyResult {
  readonly occupancy: AdminPlannerOccupancyItem[];
  readonly truncated: boolean;
}

export async function loadInstructorOccupancyItems(
  firestore: Firestore,
  input: LoadInstructorOccupancyInput
): Promise<LoadInstructorOccupancyResult> {
  const rangeStart = Math.max(0, input.window.startsAt.seconds - PLANNER_OCCUPANCY_LOOKBACK_SECONDS);
  const rangeEnd = input.window.endsAt.seconds;

  let bookingQuery: Query = firestore
    .collection('bookings')
    .where('occurrence.interval.startsAt.seconds', '>=', rangeStart)
    .where('occurrence.interval.startsAt.seconds', '<', rangeEnd)
    .orderBy('occurrence.interval.startsAt.seconds', 'asc');
  if (input.instructorId) {
    bookingQuery = bookingQuery.where('occurrence.instructorId', '==', input.instructorId);
  }

  let blockQuery: Query = firestore
    .collection('administrative_availability_blocks')
    .where('interval.startsAt.seconds', '>=', rangeStart)
    .where('interval.startsAt.seconds', '<', rangeEnd)
    .orderBy('interval.startsAt.seconds', 'asc');
  if (input.instructorId) {
    blockQuery = blockQuery.where('instructorId', '==', input.instructorId);
  }

  const dayQuery: Query = firestore
    .collectionGroup('days')
    .where('interval.startsAt.seconds', '>=', rangeStart)
    .where('interval.startsAt.seconds', '<', rangeEnd)
    .orderBy('interval.startsAt.seconds', 'asc');

  const [bookingPage, blockPage, dayPage] = await Promise.all([
    paginateWindowQuery(bookingQuery),
    paginateWindowQuery(blockQuery),
    paginateWindowQuery(dayQuery),
  ]);

  let truncated = bookingPage.truncated || blockPage.truncated || dayPage.truncated;
  const occupancy: AdminPlannerOccupancyItem[] = [];

  const bookings = bookingPage.docs
    .map((document) => parseBooking(document.data() as Record<string, unknown>))
    .filter((booking): booking is NonNullable<typeof booking> => Boolean(booking))
    .filter(
      (booking) =>
        !booking.archival?.isDeleted &&
        ACTIVE_BOOKING_STATUSES.has(booking.lifecycle.status) &&
        intervalsOverlap(booking.occurrence.interval, input.window) &&
        (!input.instructorId || booking.occurrence.instructorId === input.instructorId)
    );

  const participantNames = new Map<string, string>();
  await Promise.all(
    [...new Set(bookings.flatMap((booking) => booking.party.participantIds))].map(
      async (participantId) => {
        const snapshot = await firestore.collection('participants').doc(participantId).get();
        const data = snapshot.data() as Record<string, unknown> | undefined;
        const displayName = typeof data?.displayName === 'string' ? data.displayName.trim() : '';
        if (displayName) participantNames.set(participantId, displayName);
      }
    )
  );

  for (const booking of bookings) {
    const local = localParts(booking.occurrence.interval.startsAt, booking.occurrence.timeZone);
    const primaryParticipantId = booking.party.participantIds[0];
    occupancy.push({
      occupancyKind: 'lesson_booking',
      occupancyId: booking.bookingId,
      instructorId: booking.occurrence.instructorId,
      interval: booking.occurrence.interval,
      timeZone: booking.occurrence.timeZone,
      localDate: local.date,
      localTime: local.time,
      durationMinutes: durationMinutes(booking.occurrence.interval),
      displayTitle:
        (primaryParticipantId ? participantNames.get(primaryParticipantId) : undefined) ??
        primaryParticipantId ??
        booking.bookingId,
      lifecycleStatus: booking.lifecycle.status,
      revision: booking.revision,
      bookingId: booking.bookingId,
      participantId: primaryParticipantId,
      ...(booking.payerAccountId ? { payerAccountId: booking.payerAccountId } : {}),
      ...(booking.difficulty !== undefined ? { difficulty: booking.difficulty } : {}),
      ...(booking.notes ? { notes: booking.notes } : {}),
      isGuest: booking.attribution.bookingOrigin === 'guest',
    });
  }

  for (const document of blockPage.docs) {
    const block = parseAdministrativeAvailabilityBlock(document.data() as Record<string, unknown>);
    if (!block || block.lifecycle !== 'active') continue;
    if (input.instructorId && block.instructorId !== input.instructorId) continue;
    if (!intervalsOverlap(block.interval, input.window)) continue;
    const parsed = AdministrativeAvailabilityBlockSchema.safeParse(block);
    if (!parsed.success) continue;
    const local = localParts(block.interval.startsAt, block.timeZone);
    occupancy.push({
      occupancyKind: 'availability_block',
      occupancyId: block.blockId,
      instructorId: block.instructorId,
      interval: block.interval,
      timeZone: block.timeZone,
      localDate: local.date,
      localTime: local.time,
      durationMinutes: durationMinutes(block.interval),
      displayTitle:
        block.kind === 'day_off' ? 'Day off' : block.kind === 'break' ? 'Break' : 'Unavailable',
      revision: block.revision,
      blockId: block.blockId,
      blockKind: block.kind,
      ...(block.notes ? { notes: block.notes } : {}),
    });
  }

  const courseIds = new Set<string>();
  const overlappingDays: {
    readonly day: NonNullable<ReturnType<typeof parseCourseDay>>;
  }[] = [];
  for (const document of dayPage.docs) {
    const day = parseCourseDay(document.data() as Record<string, unknown>);
    if (!day) continue;
    if (!intervalsOverlap(day.interval, input.window)) continue;
    if (input.instructorId && !day.actualInstructorIds.includes(input.instructorId)) continue;
    courseIds.add(day.courseId);
    overlappingDays.push({ day });
  }

  const courseTitles = new Map<
    string,
    {
      title: string;
      revision: NonNullable<ReturnType<typeof parseCourse>>['revision'];
      archived: boolean;
    }
  >();
  await Promise.all(
    [...courseIds].map(async (courseId) => {
      const courseDocument = await firestore.collection('courses').doc(courseId).get();
      const course = parseCourse(courseDocument.data() as Record<string, unknown> | undefined);
      if (!course) return;
      courseTitles.set(course.courseId, {
        title: course.title,
        revision: course.revision,
        archived: course.lifecycle === 'archived',
      });
    })
  );

  for (const { day } of overlappingDays) {
    const course = courseTitles.get(day.courseId);
    if (!course || course.archived) continue;
    const local = localParts(day.interval.startsAt, day.timeZone);
    for (const instructorId of day.actualInstructorIds) {
      if (input.instructorId && instructorId !== input.instructorId) continue;
      occupancy.push({
        occupancyKind: 'course_day',
        occupancyId: `${day.courseDayId}:${instructorId}`,
        instructorId,
        interval: day.interval,
        timeZone: day.timeZone,
        localDate: local.date,
        localTime: local.time,
        durationMinutes: durationMinutes(day.interval),
        displayTitle: course.title,
        revision: day.revision,
        courseId: day.courseId,
        courseDayId: day.courseDayId,
        courseRevision: course.revision,
      });
    }
  }

  occupancy.sort((left, right) => left.interval.startsAt.seconds - right.interval.startsAt.seconds);
  if (occupancy.length > ADMIN_PLANNER_READ_MODEL_PAGE_SIZE_MAX) {
    truncated = true;
  }

  return {
    occupancy: occupancy.slice(0, ADMIN_PLANNER_READ_MODEL_PAGE_SIZE_MAX),
    truncated,
  };
}

export function sanitizePublicInstructorOccupancy(
  occupancy: readonly AdminPlannerOccupancyItem[]
): AdminPlannerOccupancyItem[] {
  return occupancy.map((item) => {
    if (item.occupancyKind === 'lesson_booking') {
      return AdminPlannerOccupancyItemSchema.parse({
        ...item,
        displayTitle: 'Booked',
        participantId: undefined,
        payerAccountId: undefined,
        isGuest: undefined,
        difficulty: undefined,
        notes: undefined,
      });
    }
    if (item.occupancyKind === 'availability_block') {
      return AdminPlannerOccupancyItemSchema.parse({
        ...item,
        notes: undefined,
      });
    }
    return item;
  });
}
