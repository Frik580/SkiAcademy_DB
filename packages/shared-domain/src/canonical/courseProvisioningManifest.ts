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
  LEGACY_COURSE_SCHEDULE_FIELD_NAMES,
} from './courseEnrollmentAttendanceAdminIssue';
import { normalizeCanonicalTimestamp } from './firestoreSerialization';
import { readAggregateRevision } from './revisionConcurrency';
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

export function pickCanonicalCourseDocumentFields(
  data: Record<string, unknown> | undefined
): Record<string, unknown> {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) {
    return {};
  }
  const picked: Record<string, unknown> = {};
  for (const key of CANONICAL_COURSE_DOCUMENT_FIELD_NAMES) {
    if (key in normalized) {
      picked[key] = normalized[key];
    }
  }
  return picked;
}

/** Canonical operational fields readable from a hybrid course document (extra keys ignored). */
export function parseCanonicalCourseOperationalStateFromDocument(
  data: Record<string, unknown> | undefined
): Course | undefined {
  const picked = pickCanonicalCourseDocumentFields(data);
  const parsed = CourseSchema.safeParse(picked);
  return parsed.success ? parsed.data : undefined;
}

export interface CourseOperationalManifestCompatibilityIssue {
  readonly field: string;
  readonly reason: 'conflict' | 'missing' | 'invalid';
}

function instructorRosterIdsEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function courseDayIdsEqual(left: readonly CourseDayId[], right: readonly CourseDayId[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validatePersistedCourseOperationalStateAgainstManifest(
  persisted: Course,
  manifest: CourseProvisioningManifest
): readonly CourseOperationalManifestCompatibilityIssue[] {
  const issues: CourseOperationalManifestCompatibilityIssue[] = [];
  const schedulePlan = deriveSchedulePlanFromManifest(manifest);
  const expectedFingerprint = computeCourseProvisioningManifestFingerprint(manifest);
  const expectedCourseDayIds = resolveProvisioningExpectedCourseDayIds(manifest);

  if (persisted.courseId !== manifest.courseId) {
    issues.push({ field: 'courseId', reason: 'conflict' });
  }
  if (persisted.title !== manifest.title) {
    issues.push({ field: 'title', reason: 'conflict' });
  }
  if (persisted.price !== manifest.price) {
    issues.push({ field: 'price', reason: 'conflict' });
  }
  if (persisted.capacity.totalSeats !== manifest.totalSeats) {
    issues.push({ field: 'capacity.totalSeats', reason: 'conflict' });
  }
  if (!instructorRosterIdsEqual(persisted.instructorRosterIds, manifest.instructorRosterIds)) {
    issues.push({ field: 'instructorRosterIds', reason: 'conflict' });
  }
  if (compareCanonicalTimestamps(persisted.startAt, schedulePlan.startAt) !== 0) {
    issues.push({ field: 'startAt', reason: 'conflict' });
  }
  if (persisted.scheduleProjection.courseDayCount !== schedulePlan.courseDayCount) {
    issues.push({ field: 'scheduleProjection.courseDayCount', reason: 'conflict' });
  }
  if (
    compareCanonicalTimestamps(
      persisted.scheduleProjection.finalCourseDayEndsAt,
      schedulePlan.finalCourseDayEndsAt
    ) !== 0
  ) {
    issues.push({ field: 'scheduleProjection.finalCourseDayEndsAt', reason: 'conflict' });
  }
  if (
    persisted.provisioningManifestFingerprint &&
    persisted.provisioningManifestFingerprint !== expectedFingerprint
  ) {
    issues.push({ field: 'provisioningManifestFingerprint', reason: 'conflict' });
  }
  if (persisted.provisioningExpectedCourseDayIds) {
    if (!courseDayIdsEqual(persisted.provisioningExpectedCourseDayIds, expectedCourseDayIds)) {
      issues.push({ field: 'provisioningExpectedCourseDayIds', reason: 'conflict' });
    }
  }
  if (persisted.capacity.availableSeats > persisted.capacity.totalSeats) {
    issues.push({ field: 'capacity.availableSeats', reason: 'invalid' });
  }

  return issues;
}

/** Shape-only repair: preserve persisted canonical runtime state; manifest verifies identity/invariants. */
export function buildCourseAggregateFromShapeRepair(input: {
  readonly persistedOperational: Course;
  readonly manifest: CourseProvisioningManifest;
  readonly revision: number;
  readonly audit: Course['audit'] & { readonly createdByCommandId: string };
}): Course {
  const expectedFingerprint = computeCourseProvisioningManifestFingerprint(input.manifest);
  const expectedCourseDayIds = resolveProvisioningExpectedCourseDayIds(input.manifest);
  return CourseSchema.parse({
    courseId: input.persistedOperational.courseId,
    title: input.persistedOperational.title,
    price: input.persistedOperational.price,
    capacity: {
      totalSeats: input.persistedOperational.capacity.totalSeats,
      availableSeats: input.persistedOperational.capacity.availableSeats,
    },
    instructorRosterIds: input.persistedOperational.instructorRosterIds,
    startAt: input.persistedOperational.startAt,
    scheduleProjection: {
      courseDayCount: input.persistedOperational.scheduleProjection.courseDayCount,
      finalCourseDayEndsAt: input.persistedOperational.scheduleProjection.finalCourseDayEndsAt,
      courseScheduleRevision: input.persistedOperational.scheduleProjection.courseScheduleRevision,
    },
    provisioningManifestFingerprint:
      input.persistedOperational.provisioningManifestFingerprint ?? expectedFingerprint,
    provisioningExpectedCourseDayIds:
      input.persistedOperational.provisioningExpectedCourseDayIds ?? expectedCourseDayIds,
    revision: input.revision,
    createdAt: input.persistedOperational.createdAt,
    updatedAt: input.persistedOperational.updatedAt,
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

/** Top-level `/courses/{courseId}` keys allowed by strict CourseSchema. */
export const CANONICAL_COURSE_DOCUMENT_FIELD_NAMES = [
  'courseId',
  'title',
  'price',
  'capacity',
  'instructorRosterIds',
  'startAt',
  'scheduleProjection',
  'provisioningManifestFingerprint',
  'provisioningExpectedCourseDayIds',
  'revision',
  'createdAt',
  'updatedAt',
  'audit',
] as const;

/** Legacy/admin presentation keys that belong in `course_catalog_content`. */
export const PRESENTATION_COURSE_DOCUMENT_FIELD_NAMES = [
  'duration',
  'description',
  'dates',
  'bgImageUrl',
  'isHidden',
  'order',
  'titleRu',
  'shortDescription',
  'shortDescriptionRu',
  'detailedDescription',
  'detailedDescriptionRu',
  'badge',
  'badgeRu',
  'level',
  'levelLabel',
  'videoUrl',
  'benefits',
  'benefitsRu',
  'program',
  'programRu',
  'faq',
  'faqRu',
  'galleryPhotos',
] as const;

/** Legacy operational keys that must not remain on canonical Course documents. */
export const LEGACY_OPERATIONAL_COURSE_DOCUMENT_FIELD_NAMES = [
  'id',
  'instructorIds',
  'totalSeats',
  'availableSeats',
  'priceKZT',
  ...LEGACY_COURSE_SCHEDULE_FIELD_NAMES,
] as const;

export type CourseDocumentExtraKeyClassification =
  | 'presentation'
  | 'legacy_operational'
  | 'unknown';

export function classifyCourseDocumentExtraKey(key: string): CourseDocumentExtraKeyClassification {
  if ((PRESENTATION_COURSE_DOCUMENT_FIELD_NAMES as readonly string[]).includes(key)) {
    return 'presentation';
  }
  if ((LEGACY_OPERATIONAL_COURSE_DOCUMENT_FIELD_NAMES as readonly string[]).includes(key)) {
    return 'legacy_operational';
  }
  return 'unknown';
}

export function courseDocumentExtraKeys(
  data: Record<string, unknown> | undefined
): readonly string[] {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return [];
  const allowed = new Set<string>(CANONICAL_COURSE_DOCUMENT_FIELD_NAMES);
  return Object.keys(normalized).filter((key) => !allowed.has(key));
}

export function courseDocumentHasExtraKeys(data: Record<string, unknown> | undefined): boolean {
  return courseDocumentExtraKeys(data).length > 0;
}

/** True when the persisted document must be delete+replaced to reach strict CourseSchema shape. */
export function courseDocumentRequiresShapeReplacement(
  data: Record<string, unknown> | undefined
): boolean {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return false;
  if (legacyCourseDocumentFailsCanonicalParse(normalized)) {
    return true;
  }
  return courseDocumentHasExtraKeys(normalized);
}

export function isCanonicalCourseProtectedFromLegacyAdminWrites(
  data: Record<string, unknown> | undefined
): boolean {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return false;
  if (CourseSchema.safeParse(normalized).success) {
    return true;
  }
  const fingerprint = normalized.provisioningManifestFingerprint;
  return typeof fingerprint === 'string' && fingerprint.trim().length > 0;
}

export function readPersistedCourseProvisioningFingerprint(
  data: Record<string, unknown> | undefined
): string | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const fingerprint = normalized.provisioningManifestFingerprint;
  return typeof fingerprint === 'string' && fingerprint.trim().length > 0 ? fingerprint : undefined;
}

export function readPersistedCourseCreatedAt(
  data: Record<string, unknown> | undefined
): CanonicalTimestamp | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  return normalizeCanonicalTimestamp(normalized.createdAt);
}

export function readPersistedCourseAuditCreatedByCommandId(
  data: Record<string, unknown> | undefined
): string | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const audit = normalized.audit;
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    return undefined;
  }
  const createdByCommandId = (audit as Record<string, unknown>).createdByCommandId;
  return typeof createdByCommandId === 'string' && createdByCommandId.trim().length > 0
    ? createdByCommandId
    : undefined;
}

export function readPersistedCourseRevision(
  data: Record<string, unknown> | undefined
): number | undefined {
  return readAggregateRevision(normalizeFirestoreDocument(data));
}

export interface CourseDocumentShapeRepairPlan {
  readonly courseId: string;
  readonly beforeKeys: readonly string[];
  readonly retainedKeys: readonly string[];
  readonly extraKeys: readonly string[];
  readonly classifiedExtraKeys: Readonly<
    Record<CourseDocumentExtraKeyClassification, readonly string[]>
  >;
  readonly keysMovedToCatalogContent: readonly string[];
  readonly keysRemoved: readonly string[];
  readonly catalogContentKeys: readonly string[];
  readonly passesStrictCourseSchemaAfterRepair: boolean;
}

export function buildCourseDocumentShapeRepairPlan(input: {
  readonly courseId: string;
  readonly courseDocument: Record<string, unknown> | undefined;
  readonly catalogContentDocument?: Record<string, unknown> | undefined;
  readonly repairedCourseDocument: Record<string, unknown>;
}): CourseDocumentShapeRepairPlan {
  const normalizedCourse = normalizeFirestoreDocument(input.courseDocument) ?? {};
  const beforeKeys = Object.keys(normalizedCourse);
  const extraKeys = courseDocumentExtraKeys(normalizedCourse);
  const classifiedExtraKeys: Record<CourseDocumentExtraKeyClassification, string[]> = {
    presentation: [],
    legacy_operational: [],
    unknown: [],
  };
  for (const key of extraKeys) {
    classifiedExtraKeys[classifyCourseDocumentExtraKey(key)].push(key);
  }

  const catalogKeys = new Set(
    Object.keys(normalizeFirestoreDocument(input.catalogContentDocument) ?? {})
  );
  const keysMovedToCatalogContent = classifiedExtraKeys.presentation.filter((key) =>
    catalogKeys.has(key)
  );
  const keysRemoved = [
    ...classifiedExtraKeys.legacy_operational,
    ...classifiedExtraKeys.presentation.filter((key) => !catalogKeys.has(key)),
    ...classifiedExtraKeys.unknown,
  ];

  const retainedKeys = Object.keys(
    normalizeFirestoreDocument(input.repairedCourseDocument) ?? {}
  );

  return {
    courseId: input.courseId,
    beforeKeys,
    retainedKeys,
    extraKeys,
    classifiedExtraKeys,
    keysMovedToCatalogContent,
    keysRemoved,
    catalogContentKeys: [...catalogKeys],
    passesStrictCourseSchemaAfterRepair: CourseSchema.safeParse(
      normalizeFirestoreDocument(input.repairedCourseDocument)
    ).success,
  };
}
