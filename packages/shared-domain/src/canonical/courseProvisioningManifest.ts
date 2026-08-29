import { z } from 'zod';
import { CommandFingerprintSchema } from './commandFingerprint';
import { canonicalJsonStringify } from './canonicalJson';
import { canonicalDeterministicHash } from './deterministicIdentity';
import { CourseDayIdSchema, CourseIdSchema, InstructorIdSchema, type CourseDayId } from './identifiers';
import { isSyntheticCourseInstructorId } from './bookingOccurrenceProposalChange';
import { CourseCatalogContentInputSchema } from './courseCatalogContent';
import {
  COURSE_DAY_MAX,
  COURSE_SEAT_MAX,
  COURSE_SEAT_MIN,
} from './courseEnrollmentAttendanceAdminIssue';
import {
  IanaTimeZoneSchema,
  KztMinorUnitsSchema,
  compareCanonicalTimestamps,
  type CanonicalTimestamp,
  type IanaTimeZone,
  type TimeInterval,
} from './primitives';
import { resolveBookingScheduleFromCalendarInput } from './bookingCreation';
import { courseScheduleIsComplete, sortedCourseDays } from './courseEnrollmentCreation';
import { CourseSchema, type Course, type CourseDay } from './courseEnrollmentAttendanceAdminIssue';
import { normalizeFirestoreDocument } from './firestoreSerialization';

export const CourseProvisioningCapacityPolicySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('seed_full'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('explicit'),
      availableSeats: z.number().finite().int().min(0).max(COURSE_SEAT_MAX),
    })
    .strict(),
]);

export type CourseProvisioningCapacityPolicy = Readonly<
  z.output<typeof CourseProvisioningCapacityPolicySchema>
>;

export const CourseProvisioningManifestDaySchema = z
  .object({
    courseDayId: CourseDayIdSchema,
    dayOrder: z.number().finite().int().min(1).max(COURSE_DAY_MAX),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    localTime: z.string().regex(/^\d{2}:\d{2}$/),
    durationMinutes: z
      .number()
      .finite()
      .int()
      .min(15)
      .max(24 * 60),
    instructorId: InstructorIdSchema,
  })
  .strict();

export type CourseProvisioningManifestDay = Readonly<
  z.output<typeof CourseProvisioningManifestDaySchema>
>;

export const CourseProvisioningManifestSchema = z
  .object({
    courseId: CourseIdSchema,
    title: z.string().trim().min(1).max(200),
    price: KztMinorUnitsSchema,
    totalSeats: z.number().finite().int().min(COURSE_SEAT_MIN).max(COURSE_SEAT_MAX),
    capacityPolicy: CourseProvisioningCapacityPolicySchema,
    instructorRosterIds: z.array(InstructorIdSchema).min(1).max(16),
    timeZone: IanaTimeZoneSchema,
    days: z.array(CourseProvisioningManifestDaySchema).min(1).max(COURSE_DAY_MAX),
    presentation: CourseCatalogContentInputSchema.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    for (const [index, instructorId] of manifest.instructorRosterIds.entries()) {
      if (isSyntheticCourseInstructorId(instructorId)) {
        context.addIssue({
          code: 'custom',
          path: ['instructorRosterIds', index],
          message: 'Synthetic course Instructor IDs are not allowed on Course rosters',
        });
      }
    }

    const seenDayIds = new Set<string>();
    const seenOrders = new Set<number>();
    for (const [index, day] of manifest.days.entries()) {
      const dayId = day.courseDayId as string;
      if (seenDayIds.has(dayId)) {
        context.addIssue({
          code: 'custom',
          path: ['days', index, 'courseDayId'],
          message: 'Duplicate CourseDay identity in manifest',
        });
      } else {
        seenDayIds.add(dayId);
      }
      if (seenOrders.has(day.dayOrder)) {
        context.addIssue({
          code: 'custom',
          path: ['days', index, 'dayOrder'],
          message: 'Duplicate CourseDay order in manifest',
        });
      } else {
        seenOrders.add(day.dayOrder);
      }
      if (!manifest.instructorRosterIds.includes(day.instructorId)) {
        context.addIssue({
          code: 'custom',
          path: ['days', index, 'instructorId'],
          message: 'CourseDay instructor must be on the Course roster',
        });
      }
      if (isSyntheticCourseInstructorId(day.instructorId)) {
        context.addIssue({
          code: 'custom',
          path: ['days', index, 'instructorId'],
          message: 'Synthetic course Instructor IDs are not allowed on CourseDays',
        });
      }
    }

    const sortedDays = [...manifest.days].sort((left, right) => left.dayOrder - right.dayOrder);
    for (let index = 1; index < sortedDays.length; index += 1) {
      const previous = resolveManifestDayInterval(sortedDays[index - 1]!, manifest.timeZone);
      const current = resolveManifestDayInterval(sortedDays[index]!, manifest.timeZone);
      if (compareCanonicalTimestamps(current.interval.startsAt, previous.interval.startsAt) <= 0) {
        context.addIssue({
          code: 'custom',
          path: ['days'],
          message: 'CourseDay startsAt values must be strictly increasing',
        });
        break;
      }
    }
  });

export type CourseProvisioningManifest = Readonly<
  z.output<typeof CourseProvisioningManifestSchema>
>;

export interface DerivedCourseSchedulePlan {
  readonly courseDayCount: number;
  readonly startAt: CanonicalTimestamp;
  readonly finalCourseDayEndsAt: CanonicalTimestamp;
}

export function resolveManifestDayInterval(
  day: CourseProvisioningManifestDay,
  timeZone: IanaTimeZone
): { readonly interval: TimeInterval; readonly durationMinutes: number } {
  return resolveBookingScheduleFromCalendarInput(
    {
      localDate: day.localDate,
      localTime: day.localTime,
      durationMinutes: day.durationMinutes,
    },
    timeZone
  );
}

export function deriveSchedulePlanFromManifest(
  manifest: Pick<CourseProvisioningManifest, 'days' | 'timeZone'>
): DerivedCourseSchedulePlan {
  const sortedDays = [...manifest.days].sort((left, right) => left.dayOrder - right.dayOrder);
  const firstInterval = resolveManifestDayInterval(sortedDays[0]!, manifest.timeZone).interval;
  const lastInterval = resolveManifestDayInterval(
    sortedDays[sortedDays.length - 1]!,
    manifest.timeZone
  ).interval;
  return {
    courseDayCount: sortedDays.length,
    startAt: firstInterval.startsAt,
    finalCourseDayEndsAt: lastInterval.endsAt,
  };
}

export function resolveProvisionedAvailableSeats(input: {
  readonly totalSeats: number;
  readonly capacityPolicy: CourseProvisioningCapacityPolicy;
}): number {
  if (input.capacityPolicy.kind === 'explicit') {
    return input.capacityPolicy.availableSeats;
  }
  return input.totalSeats;
}

export function resolveProvisioningExpectedCourseDayIds(
  manifest: CourseProvisioningManifest
): readonly CourseDayId[] {
  return [...manifest.days]
    .sort((left, right) => left.dayOrder - right.dayOrder)
    .map((day) => day.courseDayId);
}

const COURSE_PROVISIONING_MANIFEST_FINGERPRINT_PREFIX = 'course-provisioning-manifest:v1' as const;

export function computeCourseProvisioningManifestFingerprint(
  manifest: CourseProvisioningManifest
): z.output<typeof CommandFingerprintSchema> {
  const operationalManifest = {
    courseId: manifest.courseId,
    title: manifest.title,
    price: manifest.price,
    totalSeats: manifest.totalSeats,
    capacityPolicy: manifest.capacityPolicy,
    instructorRosterIds: manifest.instructorRosterIds,
    timeZone: manifest.timeZone,
    days: [...manifest.days].sort((left, right) => left.dayOrder - right.dayOrder),
  };
  return CommandFingerprintSchema.parse(
    canonicalDeterministicHash([
      COURSE_PROVISIONING_MANIFEST_FINGERPRINT_PREFIX,
      canonicalJsonStringify(operationalManifest),
    ])
  );
}

export function isCourseOperationalForEnrollment(
  course: Course,
  courseDays: readonly CourseDay[]
): boolean {
  if (!courseScheduleIsComplete(course, courseDays)) {
    return false;
  }
  if (!verifyProvisionedCourseSchedule(course, courseDays)) {
    return false;
  }
  if (course.provisioningExpectedCourseDayIds) {
    const sortedActual = sortedCourseDays(courseDays).map((day) => day.courseDayId);
    const expected = course.provisioningExpectedCourseDayIds;
    if (sortedActual.length !== expected.length) {
      return false;
    }
    for (let index = 0; index < expected.length; index += 1) {
      if (sortedActual[index] !== expected[index]) {
        return false;
      }
    }
  }
  return true;
}

export function buildCourseAggregateFromManifest(input: {
  readonly manifest: CourseProvisioningManifest;
  readonly revision: number;
  readonly decidedAt: CanonicalTimestamp;
  readonly audit: Course['audit'] & { readonly createdByCommandId: string };
}): Course {
  const schedulePlan = deriveSchedulePlanFromManifest(input.manifest);
  const availableSeats = resolveProvisionedAvailableSeats({
    totalSeats: input.manifest.totalSeats,
    capacityPolicy: input.manifest.capacityPolicy,
  });
  return CourseSchema.parse({
    courseId: input.manifest.courseId,
    title: input.manifest.title,
    price: input.manifest.price,
    capacity: {
      totalSeats: input.manifest.totalSeats,
      availableSeats,
    },
    instructorRosterIds: input.manifest.instructorRosterIds,
    startAt: schedulePlan.startAt,
    scheduleProjection: {
      courseDayCount: schedulePlan.courseDayCount,
      finalCourseDayEndsAt: schedulePlan.finalCourseDayEndsAt,
      courseScheduleRevision: 1,
    },
    provisioningManifestFingerprint: computeCourseProvisioningManifestFingerprint(input.manifest),
    provisioningExpectedCourseDayIds: resolveProvisioningExpectedCourseDayIds(input.manifest),
    revision: input.revision,
    createdAt: input.decidedAt,
    updatedAt: input.decidedAt,
    audit: input.audit,
  });
}

export function verifyProvisionedCourseSchedule(
  course: Course,
  courseDays: readonly CourseDay[]
): boolean {
  if (!courseScheduleIsComplete(course, courseDays)) {
    return false;
  }
  const sortedDays = sortedCourseDays(courseDays);
  const firstDay = sortedDays[0];
  const lastDay = sortedDays[sortedDays.length - 1];
  if (!firstDay || !lastDay) {
    return false;
  }
  return (
    compareCanonicalTimestamps(course.startAt, firstDay.interval.startsAt) === 0 &&
    compareCanonicalTimestamps(
      course.scheduleProjection.finalCourseDayEndsAt,
      lastDay.interval.endsAt
    ) === 0
  );
}

export function legacyCourseDocumentFailsCanonicalParse(
  data: Record<string, unknown> | undefined
): boolean {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return true;
  return !CourseSchema.safeParse(normalized).success;
}
