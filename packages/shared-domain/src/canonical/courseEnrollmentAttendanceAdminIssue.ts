import { z } from 'zod';
import {
  AccountIdSchema,
  AdminIssueIdSchema,
  AttendanceIdSchema,
  BookingIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  PaymentIdSchema,
  canonicalReference,
  type AdminIssueId,
  type AttendanceId,
  type CanonicalReference,
  type CourseDayId,
  type CourseEnrollmentId,
  type CourseId,
  type OccurrenceId,
  type ParticipantId,
} from './identifiers';
import { CanonicalRecordMetadataSchema } from './accountParticipantAccess';
import {
  ImmutableBookingAttributionSchema,
  isSyntheticCourseInstructorId,
  validateBookingAttribution,
  type ImmutableBookingAttribution,
} from './bookingOccurrenceProposalChange';
import { canonicalDeterministicHash, validateDeterministicIdentityInputs } from './deterministicIdentity';
import {
  AggregateRevisionSchema,
  CanonicalTimestampSchema,
  IanaTimeZoneSchema,
  KztMinorUnitsSchema,
  TimeIntervalSchema,
  compareCanonicalTimestamps,
  type CanonicalTimestamp,
} from './primitives';

const PersistedAggregateRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 1,
  'Persisted aggregate revision must be at least one'
);

const ProjectionRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 0,
  'Projection revision must be non-negative'
);

function addRecordChronologyIssue(
  record: { readonly createdAt: CanonicalTimestamp; readonly updatedAt: CanonicalTimestamp },
  context: z.RefinementCtx
): void {
  if (compareCanonicalTimestamps(record.updatedAt, record.createdAt) < 0) {
    context.addIssue({
      code: 'custom',
      path: ['updatedAt'],
      message: 'updatedAt must not precede createdAt',
    });
  }
}

function addEventChronologyIssue(
  eventAt: CanonicalTimestamp,
  path: (string | number)[],
  record: { readonly createdAt: CanonicalTimestamp; readonly updatedAt: CanonicalTimestamp },
  context: z.RefinementCtx
): void {
  if (
    compareCanonicalTimestamps(eventAt, record.createdAt) < 0 ||
    compareCanonicalTimestamps(eventAt, record.updatedAt) > 0
  ) {
    context.addIssue({
      code: 'custom',
      path,
      message: 'Lifecycle timestamp must fall between createdAt and updatedAt',
    });
  }
}

export const COURSE_SEAT_MIN = 1 as const;
export const COURSE_SEAT_MAX = 64 as const;
export const COURSE_DAY_MAX = 64 as const;

export const COURSE_SCHEDULE_PROJECTION_FIELDS = [
  'courseDayCount',
  'finalCourseDayEndsAt',
  'courseScheduleRevision',
] as const;

export const LEGACY_COURSE_SCHEDULE_FIELD_NAMES = [
  'dates',
  'date',
  'time',
  'duration',
  'durationHours',
  'courseEndsAt',
  'deliveryDates',
  'scheduleDates',
] as const;

export const WHOLE_COURSE_CANCELLATION_FIELD_NAMES = [
  'courseCancellationStatus',
  'wholeCourseCancelled',
  'wholeCourseCancellation',
  'cancelEntireCourse',
] as const;

export const LEGACY_COURSE_ENROLLMENT_BOOKING_FIELD_NAMES = [
  'bookingId',
  'party',
  'occurrence',
  'instructorId',
  'userId',
  'isGuest',
  'date',
  'time',
  'durationHours',
  'duration',
  'serviceParticipantIds',
  'syntheticInstructorId',
] as const;

export const CourseScheduleProjectionSchema = z
  .object({
    courseDayCount: z.number().finite().int().min(1).max(COURSE_DAY_MAX),
    finalCourseDayEndsAt: CanonicalTimestampSchema,
    courseScheduleRevision: PersistedAggregateRevisionSchema,
  })
  .strict();

export type CourseScheduleProjection = Readonly<z.output<typeof CourseScheduleProjectionSchema>>;

export const CourseCapacitySchema = z
  .object({
    totalSeats: z.number().finite().int().min(COURSE_SEAT_MIN).max(COURSE_SEAT_MAX),
    availableSeats: z.number().finite().int().min(0).max(COURSE_SEAT_MAX),
  })
  .strict()
  .superRefine((capacity, context) => {
    if (capacity.availableSeats > capacity.totalSeats) {
      context.addIssue({
        code: 'custom',
        path: ['availableSeats'],
        message: 'availableSeats must not exceed totalSeats',
      });
    }
  });

export type CourseCapacity = Readonly<z.output<typeof CourseCapacitySchema>>;

export const CourseSchema = z
  .object({
    courseId: CourseIdSchema,
    title: z.string().trim().min(1).max(200),
    price: KztMinorUnitsSchema,
    capacity: CourseCapacitySchema,
    instructorRosterIds: z.array(InstructorIdSchema).min(1).max(16),
    startAt: CanonicalTimestampSchema,
    scheduleProjection: CourseScheduleProjectionSchema,
    revision: PersistedAggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict()
  .superRefine((course, context) => {
    addRecordChronologyIssue(course, context);
    for (const [index, instructorId] of course.instructorRosterIds.entries()) {
      if (isSyntheticCourseInstructorId(instructorId)) {
        context.addIssue({
          code: 'custom',
          path: ['instructorRosterIds', index],
          message: 'Synthetic course Instructor IDs are not canonical on Courses',
        });
      }
    }
  });

export type Course = Readonly<z.output<typeof CourseSchema>>;

export const CourseDaySchema = z
  .object({
    courseId: CourseIdSchema,
    courseDayId: CourseDayIdSchema,
    dayOrder: z.number().finite().int().min(1).max(COURSE_SEAT_MAX),
    interval: TimeIntervalSchema,
    timeZone: IanaTimeZoneSchema,
    actualInstructorIds: z.array(InstructorIdSchema).min(1).max(8),
    revision: PersistedAggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict()
  .superRefine((courseDay, context) => {
    addRecordChronologyIssue(courseDay, context);
    for (const [index, instructorId] of courseDay.actualInstructorIds.entries()) {
      if (isSyntheticCourseInstructorId(instructorId)) {
        context.addIssue({
          code: 'custom',
          path: ['actualInstructorIds', index],
          message: 'Synthetic course Instructor IDs are not canonical on CourseDays',
        });
      }
    }
  });

export type CourseDay = Readonly<z.output<typeof CourseDaySchema>>;

declare const adminIssueDedupeKeyBrand: unique symbol;
export type AdminIssueDedupeKey = string & {
  readonly [adminIssueDedupeKeyBrand]: 'AdminIssueDedupeKey';
};

export const AdminIssueDedupeKeySchema = z
  .string()
  .min(1)
  .max(512)
  .transform((value) => value as AdminIssueDedupeKey);

export function validateStructuredCourseDays(
  courseDays: readonly CourseDay[],
  context: z.RefinementCtx,
  basePath: (string | number)[] = ['courseDays']
): void {
  const seenDayIds = new Set<string>();
  const seenOrders = new Set<number>();
  courseDays.forEach((courseDay, index) => {
    const dayId = courseDay.courseDayId as string;
    if (seenDayIds.has(dayId)) {
      context.addIssue({
        code: 'custom',
        path: [...basePath, index, 'courseDayId'],
        message: 'Duplicate CourseDay identity',
      });
    } else {
      seenDayIds.add(dayId);
    }
    if (seenOrders.has(courseDay.dayOrder)) {
      context.addIssue({
        code: 'custom',
        path: [...basePath, index, 'dayOrder'],
        message: 'Duplicate CourseDay order',
      });
    } else {
      seenOrders.add(courseDay.dayOrder);
    }
  });
}

export const COURSE_ENROLLMENT_LIFECYCLE_STATUSES = [
  'pending',
  'confirmed',
  'pending_cancellation',
  'cancelled',
  'withdrawn',
  'completed',
  'no_show',
] as const;
export type CourseEnrollmentLifecycleStatus =
  (typeof COURSE_ENROLLMENT_LIFECYCLE_STATUSES)[number];

export const COURSE_ENROLLMENT_CANCELLATION_REASON_CODES = [
  'reservation_expired',
  'guest_cancelled',
  'account_owner_cancelled',
  'administrator_cancelled',
  'incomplete_payment',
  'system_expired',
] as const;
export type CourseEnrollmentCancellationReasonCode =
  (typeof COURSE_ENROLLMENT_CANCELLATION_REASON_CODES)[number];

export const CourseEnrollmentLifecycleStatusSchema = z.enum(COURSE_ENROLLMENT_LIFECYCLE_STATUSES);
export const CourseEnrollmentCancellationReasonCodeSchema = z.enum(
  COURSE_ENROLLMENT_CANCELLATION_REASON_CODES
);

const CourseEnrollmentLifecycleSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('pending'),
      reservationExpiresAt: CanonicalTimestampSchema,
    })
    .strict(),
  z.object({ status: z.literal('confirmed') }).strict(),
  z
    .object({
      status: z.literal('pending_cancellation'),
      requestedAt: CanonicalTimestampSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('cancelled'),
      cancelledAt: CanonicalTimestampSchema,
      reasonCode: CourseEnrollmentCancellationReasonCodeSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('withdrawn'),
      withdrawnAt: CanonicalTimestampSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('completed'),
      completedAt: CanonicalTimestampSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('no_show'),
      noShowAt: CanonicalTimestampSchema,
    })
    .strict(),
]);

export type CourseEnrollmentLifecycle = Readonly<z.output<typeof CourseEnrollmentLifecycleSchema>>;

export const CourseEnrollmentAttendanceSummarySchema = z
  .object({
    recordedDayCount: z.number().finite().int().nonnegative(),
    presentDayCount: z.number().finite().int().nonnegative(),
    absentDayCount: z.number().finite().int().nonnegative(),
    projectionRevision: ProjectionRevisionSchema,
  })
  .strict()
  .describe(
    'Rebuildable transactional projection derived from canonical CourseDay Attendance documents; not source of truth'
  );

export type CourseEnrollmentAttendanceSummary = Readonly<
  z.output<typeof CourseEnrollmentAttendanceSummarySchema>
>;

export function validateCourseEnrollmentAttendanceSummary(
  summary: CourseEnrollmentAttendanceSummary,
  courseDayCount: number,
  context: z.RefinementCtx,
  basePath: (string | number)[] = ['attendanceSummary']
): void {
  const add = (path: string, message: string) => {
    context.addIssue({ code: 'custom', path: [...basePath, path], message });
  };

  if (summary.recordedDayCount !== summary.presentDayCount + summary.absentDayCount) {
    add(
      'recordedDayCount',
      'recordedDayCount must equal presentDayCount + absentDayCount'
    );
  }
  if (summary.recordedDayCount > courseDayCount) {
    add('recordedDayCount', 'recordedDayCount must not exceed canonical courseDayCount');
  }
  if (summary.presentDayCount > courseDayCount) {
    add('presentDayCount', 'presentDayCount must not exceed canonical courseDayCount');
  }
  if (summary.absentDayCount > courseDayCount) {
    add('absentDayCount', 'absentDayCount must not exceed canonical courseDayCount');
  }
}

export function attendanceSummaryIsDerivedProjection(
  summary: CourseEnrollmentAttendanceSummary | undefined
): boolean {
  return summary === undefined || CourseEnrollmentAttendanceSummarySchema.safeParse(summary).success;
}

export const CourseEnrollmentSchema = z
  .object({
    enrollmentId: CourseEnrollmentIdSchema,
    participantId: ParticipantIdSchema,
    courseId: CourseIdSchema,
    originalCourseId: CourseIdSchema,
    attribution: ImmutableBookingAttributionSchema,
    lifecycle: CourseEnrollmentLifecycleSchema,
    paymentId: PaymentIdSchema,
    payerAccountId: AccountIdSchema.optional(),
    attendanceSummary: CourseEnrollmentAttendanceSummarySchema.optional(),
    revision: PersistedAggregateRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict()
  .superRefine((enrollment, context) => {
    addRecordChronologyIssue(enrollment, context);
    validateBookingAttribution(enrollment.attribution, context);
    validateCourseEnrollmentOriginLifecycleConsistency(
      enrollment.attribution,
      enrollment.lifecycle,
      context
    );

    if (enrollment.lifecycle.status === 'pending') {
      if (
        compareCanonicalTimestamps(
          enrollment.lifecycle.reservationExpiresAt,
          enrollment.createdAt
        ) < 0
      ) {
        context.addIssue({
          code: 'custom',
          path: ['lifecycle', 'reservationExpiresAt'],
          message: 'reservationExpiresAt must not precede createdAt',
        });
      }
    }
    if (enrollment.lifecycle.status === 'pending_cancellation') {
      addEventChronologyIssue(
        enrollment.lifecycle.requestedAt,
        ['lifecycle', 'requestedAt'],
        enrollment,
        context
      );
    }
    if (enrollment.lifecycle.status === 'cancelled') {
      addEventChronologyIssue(
        enrollment.lifecycle.cancelledAt,
        ['lifecycle', 'cancelledAt'],
        enrollment,
        context
      );
    }
    if (enrollment.lifecycle.status === 'withdrawn') {
      addEventChronologyIssue(
        enrollment.lifecycle.withdrawnAt,
        ['lifecycle', 'withdrawnAt'],
        enrollment,
        context
      );
    }
    if (enrollment.lifecycle.status === 'completed') {
      addEventChronologyIssue(
        enrollment.lifecycle.completedAt,
        ['lifecycle', 'completedAt'],
        enrollment,
        context
      );
    }
    if (enrollment.lifecycle.status === 'no_show') {
      addEventChronologyIssue(
        enrollment.lifecycle.noShowAt,
        ['lifecycle', 'noShowAt'],
        enrollment,
        context
      );
    }
    if (enrollment.attendanceSummary) {
      validateCourseEnrollmentAttendanceSummary(
        enrollment.attendanceSummary,
        Number.POSITIVE_INFINITY,
        context
      );
    }
  });

export type CourseEnrollment = Readonly<z.output<typeof CourseEnrollmentSchema>>;

export const StructuredCourseDeliverySchema = z
  .object({
    course: CourseSchema,
    courseDays: z.array(CourseDaySchema).min(1).max(COURSE_DAY_MAX),
    enrollment: CourseEnrollmentSchema.optional(),
  })
  .strict()
  .superRefine((delivery, context) => {
    validateStructuredCourseDays(delivery.courseDays, context);
    if (delivery.courseDays.some((courseDay) => courseDay.courseId !== delivery.course.courseId)) {
      context.addIssue({
        code: 'custom',
        path: ['courseDays'],
        message: 'Every CourseDay must belong to the parent Course',
      });
    }
    if (delivery.course.scheduleProjection.courseDayCount !== delivery.courseDays.length) {
      context.addIssue({
        code: 'custom',
        path: ['course', 'scheduleProjection', 'courseDayCount'],
        message: 'courseDayCount must match canonical CourseDay records',
      });
    }
    if (delivery.enrollment?.attendanceSummary) {
      validateCourseEnrollmentAttendanceSummary(
        delivery.enrollment.attendanceSummary,
        delivery.course.scheduleProjection.courseDayCount,
        context,
        ['enrollment', 'attendanceSummary']
      );
      if (delivery.enrollment.courseId !== delivery.course.courseId) {
        context.addIssue({
          code: 'custom',
          path: ['enrollment', 'courseId'],
          message: 'CourseEnrollment must reference the delivery Course',
        });
      }
    }
  });

export type StructuredCourseDelivery = Readonly<z.output<typeof StructuredCourseDeliverySchema>>;

export function validateCourseEnrollmentOriginLifecycleConsistency(
  attribution: Readonly<{ bookingOrigin: ImmutableBookingAttribution['bookingOrigin'] }>,
  lifecycle: Readonly<{ status: CourseEnrollmentLifecycleStatus }>,
  context: z.RefinementCtx
): void {
  if (lifecycle.status === 'pending' && attribution.bookingOrigin !== 'guest') {
    context.addIssue({
      code: 'custom',
      path: ['lifecycle', 'status'],
      message: 'Only guest-origin CourseEnrollments may be pending',
    });
  }
  if (lifecycle.status === 'withdrawn' && attribution.bookingOrigin === 'guest') {
    context.addIssue({
      code: 'custom',
      path: ['lifecycle', 'status'],
      message: 'Guest-origin CourseEnrollments cannot become withdrawn',
    });
  }
}

export function courseEnrollmentBelongsToExactlyOneParticipant(
  enrollment: Pick<CourseEnrollment, 'participantId'>
): boolean {
  return ParticipantIdSchema.safeParse(enrollment.participantId).success;
}

export function enrollmentIdIsOpaqueAndNotDerivedFromParticipantCoursePair(
  enrollmentId: CourseEnrollmentId,
  participantId: ParticipantId,
  courseId: CourseId
): boolean {
  const enrollmentKey = enrollmentId as string;
  const derivedPairKey = `${participantId}_${courseId}`;
  const derivedBookingStyleKey = `booking_course_${participantId}_${courseId}`;
  return enrollmentKey !== derivedPairKey && enrollmentKey !== derivedBookingStyleKey;
}

export function containsLegacyCourseScheduleFields(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const record = input as Record<string, unknown>;
  return LEGACY_COURSE_SCHEDULE_FIELD_NAMES.some((field) => record[field] !== undefined);
}

export function containsWholeCourseCancellationFields(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const record = input as Record<string, unknown>;
  return WHOLE_COURSE_CANCELLATION_FIELD_NAMES.some((field) => record[field] !== undefined);
}

export function containsCourseEnrollmentBookingShapeFields(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const record = input as Record<string, unknown>;
  if (typeof record.instructorId === 'string' && isSyntheticCourseInstructorId(record.instructorId)) {
    return true;
  }
  return LEGACY_COURSE_ENROLLMENT_BOOKING_FIELD_NAMES.some((field) => record[field] !== undefined);
}

export const LegacyCourseScheduleShapeSchema = z
  .object({
    dates: z.unknown().optional(),
    date: z.unknown().optional(),
    time: z.unknown().optional(),
    duration: z.unknown().optional(),
    durationHours: z.unknown().optional(),
    courseEndsAt: z.unknown().optional(),
    deliveryDates: z.unknown().optional(),
    scheduleDates: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const field of LEGACY_COURSE_SCHEDULE_FIELD_NAMES) {
      if (value[field] !== undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Legacy free-form Course schedule fields are not canonical',
        });
      }
    }
  });

export const WholeCourseCancellationShapeSchema = z
  .object({
    courseCancellationStatus: z.unknown().optional(),
    wholeCourseCancelled: z.unknown().optional(),
    wholeCourseCancellation: z.unknown().optional(),
    cancelEntireCourse: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const field of WHOLE_COURSE_CANCELLATION_FIELD_NAMES) {
      if (value[field] !== undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Whole-Course cancellation fields are out of scope for canonical Courses',
        });
      }
    }
  });

export const LegacyCourseEnrollmentBookingShapeSchema = z
  .object({
    bookingId: z.unknown().optional(),
    party: z.unknown().optional(),
    occurrence: z.unknown().optional(),
    instructorId: z.unknown().optional(),
    userId: z.unknown().optional(),
    isGuest: z.unknown().optional(),
    date: z.unknown().optional(),
    time: z.unknown().optional(),
    durationHours: z.unknown().optional(),
    duration: z.unknown().optional(),
    serviceParticipantIds: z.unknown().optional(),
    syntheticInstructorId: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (typeof value.instructorId === 'string' && isSyntheticCourseInstructorId(value.instructorId)) {
      context.addIssue({
        code: 'custom',
        path: ['instructorId'],
        message: 'CourseEnrollment must not use synthetic course Instructor IDs',
      });
    }
    for (const field of LEGACY_COURSE_ENROLLMENT_BOOKING_FIELD_NAMES) {
      if (value[field] !== undefined) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'CourseEnrollment must not use Booking-shaped fields',
        });
      }
    }
  });

export const ATTENDANCE_STATUSES = ['present', 'absent'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export const AttendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);

export const ATTENDANCE_SUBJECT_KINDS = ['booking', 'course_enrollment'] as const;
export type AttendanceSubjectKind = (typeof ATTENDANCE_SUBJECT_KINDS)[number];
export const AttendanceSubjectKindSchema = z.enum(ATTENDANCE_SUBJECT_KINDS);

export const AttendanceRecorderSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('instructor'), instructorId: InstructorIdSchema }).strict(),
  z.object({ kind: z.literal('administrator'), accountId: AccountIdSchema }).strict(),
]);

export type AttendanceRecorder = Readonly<z.output<typeof AttendanceRecorderSchema>>;

export const BookingAttendanceSubjectRefSchema = z
  .object({
    subjectKind: z.literal('booking'),
    bookingId: BookingIdSchema,
    occurrenceId: OccurrenceIdSchema,
    participantId: ParticipantIdSchema,
  })
  .strict();

export const CourseEnrollmentAttendanceSubjectRefSchema = z
  .object({
    subjectKind: z.literal('course_enrollment'),
    enrollmentId: CourseEnrollmentIdSchema,
    courseId: CourseIdSchema,
    courseDayId: CourseDayIdSchema,
    participantId: ParticipantIdSchema,
  })
  .strict();

export const AttendanceSubjectRefSchema = z.discriminatedUnion('subjectKind', [
  BookingAttendanceSubjectRefSchema,
  CourseEnrollmentAttendanceSubjectRefSchema,
]);

export type AttendanceSubjectRef = Readonly<z.output<typeof AttendanceSubjectRefSchema>>;

export const ATTENDANCE_IDENTITY_STRATEGY_VERSION = 'attendance:v1' as const;

export function bookingAttendanceIdentityKey(input: {
  occurrenceId: OccurrenceId;
  participantId: ParticipantId;
}): string {
  return `${ATTENDANCE_IDENTITY_STRATEGY_VERSION}:booking:${input.occurrenceId}:${input.participantId}`;
}

export function courseDayAttendanceIdentityKey(input: {
  enrollmentId: CourseEnrollmentId;
  courseDayId: CourseDayId;
}): string {
  return `${ATTENDANCE_IDENTITY_STRATEGY_VERSION}:course-day:${input.enrollmentId}:${input.courseDayId}`;
}

export const BookingAttendanceIdentityInputSchema = z
  .object({
    strategyVersion: z.literal(ATTENDANCE_IDENTITY_STRATEGY_VERSION),
    subjectKind: z.literal('booking'),
    occurrenceId: OccurrenceIdSchema,
    participantId: ParticipantIdSchema,
  })
  .strict()
  .superRefine((input, context) => {
    validateDeterministicIdentityInputs(
      {
        occurrenceId: input.occurrenceId,
        participantId: input.participantId,
      },
      context
    );
  });

export const CourseDayAttendanceIdentityInputSchema = z
  .object({
    strategyVersion: z.literal(ATTENDANCE_IDENTITY_STRATEGY_VERSION),
    subjectKind: z.literal('course_enrollment'),
    enrollmentId: CourseEnrollmentIdSchema,
    courseDayId: CourseDayIdSchema,
  })
  .strict()
  .superRefine((input, context) => {
    validateDeterministicIdentityInputs(
      {
        enrollmentId: input.enrollmentId,
        courseDayId: input.courseDayId,
      },
      context
    );
  });

export type BookingAttendanceIdentityInput = z.output<typeof BookingAttendanceIdentityInputSchema>;
export type CourseDayAttendanceIdentityInput = z.output<
  typeof CourseDayAttendanceIdentityInputSchema
>;

export function attendanceIdFromBookingIdentity(input: BookingAttendanceIdentityInput): AttendanceId {
  const parsed = BookingAttendanceIdentityInputSchema.parse(input);
  return AttendanceIdSchema.parse(
    canonicalDeterministicHash([
      parsed.strategyVersion,
      'booking',
      parsed.occurrenceId,
      parsed.participantId,
    ])
  );
}

export function attendanceIdFromCourseDayIdentity(
  input: CourseDayAttendanceIdentityInput
): AttendanceId {
  const parsed = CourseDayAttendanceIdentityInputSchema.parse(input);
  return AttendanceIdSchema.parse(
    canonicalDeterministicHash([
      parsed.strategyVersion,
      'course-day',
      parsed.enrollmentId,
      parsed.courseDayId,
    ])
  );
}

export const AttendanceSchema = z
  .object({
    attendanceId: AttendanceIdSchema,
    subject: AttendanceSubjectRefSchema,
    attendanceStatus: AttendanceStatusSchema,
    recordedBy: AttendanceRecorderSchema,
    recordedAt: CanonicalTimestampSchema,
    lastChangedBy: AttendanceRecorderSchema,
    updatedAt: CanonicalTimestampSchema,
    revision: PersistedAggregateRevisionSchema,
    correlationId: CorrelationIdSchema,
    causationId: CommandIdSchema.optional(),
  })
  .strict()
  .superRefine((attendance, context) => {
    if (compareCanonicalTimestamps(attendance.updatedAt, attendance.recordedAt) < 0) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'updatedAt must not precede recordedAt',
      });
    }

    const subject = attendance.subject;
    if (subject.subjectKind === 'booking') {
      const expectedId = attendanceIdFromBookingIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'booking',
        occurrenceId: subject.occurrenceId,
        participantId: subject.participantId,
      });
      if ((attendance.attendanceId as string) !== (expectedId as string)) {
        context.addIssue({
          code: 'custom',
          path: ['attendanceId'],
          message: 'attendanceId must match the deterministic Booking Attendance identity',
        });
      }
    } else {
      const expectedId = attendanceIdFromCourseDayIdentity({
        strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
        subjectKind: 'course_enrollment',
        enrollmentId: subject.enrollmentId,
        courseDayId: subject.courseDayId,
      });
      if ((attendance.attendanceId as string) !== (expectedId as string)) {
        context.addIssue({
          code: 'custom',
          path: ['attendanceId'],
          message: 'attendanceId must match the deterministic CourseDay Attendance identity',
        });
      }
    }
  });

export type Attendance = Readonly<z.output<typeof AttendanceSchema>>;

export const UnknownAttendanceStatusShapeSchema = z
  .object({
    attendanceStatus: z.literal('unknown'),
  })
  .strict()
  .superRefine((_value, context) => {
    context.addIssue({
      code: 'custom',
      path: ['attendanceStatus'],
      message: 'Explicit unknown Attendance status is forbidden; missing documents mean unknown',
    });
  });

export function missingAttendanceIsDocumentAbsence(): true {
  return true;
}

export const ADMIN_ISSUE_KINDS = [
  'missing_attendance',
  'payment_required_at_start',
  'unresolved_pending_cancellation',
  'attendance_payment_conflict',
  'resource_reconciliation_mismatch',
  'financial_reconciliation_mismatch',
  'outcome_correction_required',
] as const;
export type AdminIssueKind = (typeof ADMIN_ISSUE_KINDS)[number];
export const AdminIssueKindSchema = z.enum(ADMIN_ISSUE_KINDS);

export const ADMIN_ISSUE_LIFECYCLE_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type AdminIssueLifecycleStatus = (typeof ADMIN_ISSUE_LIFECYCLE_STATUSES)[number];
export const AdminIssueLifecycleStatusSchema = z.enum(ADMIN_ISSUE_LIFECYCLE_STATUSES);

export const ADMIN_ISSUE_SEVERITIES = ['normal', 'urgent', 'critical'] as const;
export type AdminIssueSeverity = (typeof ADMIN_ISSUE_SEVERITIES)[number];
export const AdminIssueSeveritySchema = z.enum(ADMIN_ISSUE_SEVERITIES);

export const ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION = 'issue:v1' as const;

const ADMIN_ISSUE_RECONCILIATION_SCOPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

export const AdminIssueReconciliationScopeSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    ADMIN_ISSUE_RECONCILIATION_SCOPE_PATTERN,
    'Reconciliation scope must be an opaque identifier'
  );

export const AdminIssueSubjectRefSchema = z.discriminatedUnion('subjectKind', [
  z.object({ subjectKind: z.literal('booking'), bookingId: BookingIdSchema }).strict(),
  z
    .object({ subjectKind: z.literal('course_enrollment'), enrollmentId: CourseEnrollmentIdSchema })
    .strict(),
]);

export type AdminIssueSubjectRef = Readonly<z.output<typeof AdminIssueSubjectRefSchema>>;

export const AdminIssueDedupeIdentityInputSchema = z
  .object({
    strategyVersion: z.literal(ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION),
    kind: AdminIssueKindSchema,
    subjectKind: z.enum(['booking', 'course_enrollment']),
    subjectId: z.union([BookingIdSchema, CourseEnrollmentIdSchema]),
    occurrenceId: OccurrenceIdSchema.optional(),
    participantId: ParticipantIdSchema.optional(),
    courseDayId: CourseDayIdSchema.optional(),
    scheduleRevision: PersistedAggregateRevisionSchema.optional(),
    reconciliationScope: AdminIssueReconciliationScopeSchema.optional(),
  })
  .strict()
  .superRefine((input, context) => {
    validateDeterministicIdentityInputs(
      {
        kind: input.kind,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        occurrenceId: input.occurrenceId ?? '',
        participantId: input.participantId ?? '',
        courseDayId: input.courseDayId ?? '',
        scheduleRevision: input.scheduleRevision === undefined ? '' : String(input.scheduleRevision),
        reconciliationScope: input.reconciliationScope ?? '',
      },
      context
    );

    if (input.subjectKind === 'booking' && !BookingIdSchema.safeParse(input.subjectId).success) {
      context.addIssue({
        code: 'custom',
        path: ['subjectId'],
        message: 'Booking AdminIssue subjectId must be a BookingId',
      });
    }
    if (
      input.subjectKind === 'course_enrollment' &&
      !CourseEnrollmentIdSchema.safeParse(input.subjectId).success
    ) {
      context.addIssue({
        code: 'custom',
        path: ['subjectId'],
        message: 'CourseEnrollment AdminIssue subjectId must be a CourseEnrollmentId',
      });
    }
  });

export type AdminIssueDedupeIdentityInput = z.output<typeof AdminIssueDedupeIdentityInputSchema>;

export function adminIssueDedupeIdentityFromRecord(
  issue: Readonly<{
    kind: AdminIssueKind;
    subjectRef: AdminIssueSubjectRef;
    occurrenceId?: OccurrenceId;
    participantId?: ParticipantId;
    courseDayId?: CourseDayId;
    scheduleRevision?: z.output<typeof PersistedAggregateRevisionSchema>;
    reconciliationScope?: z.output<typeof AdminIssueReconciliationScopeSchema>;
  }>
): AdminIssueDedupeIdentityInput {
  return {
    strategyVersion: ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
    kind: issue.kind,
    subjectKind: issue.subjectRef.subjectKind,
    subjectId:
      issue.subjectRef.subjectKind === 'booking'
        ? issue.subjectRef.bookingId
        : issue.subjectRef.enrollmentId,
    occurrenceId: issue.occurrenceId,
    participantId: issue.participantId,
    courseDayId: issue.courseDayId,
    scheduleRevision: issue.scheduleRevision,
    reconciliationScope: issue.reconciliationScope,
  };
}

export function adminIssueDedupeKeyFromIdentity(
  input: AdminIssueDedupeIdentityInput
): AdminIssueDedupeKey {
  const parsed = AdminIssueDedupeIdentityInputSchema.parse(input);
  const parts = [
    parsed.strategyVersion,
    parsed.kind,
    parsed.subjectKind,
    parsed.subjectId,
    parsed.occurrenceId ?? '',
    parsed.participantId ?? '',
    parsed.courseDayId ?? '',
    parsed.scheduleRevision === undefined ? '' : String(parsed.scheduleRevision),
    parsed.reconciliationScope ?? '',
  ];
  return parts.join(':') as AdminIssueDedupeKey;
}

export function adminIssueIdFromDedupeKey(dedupeKey: AdminIssueDedupeKey): AdminIssueId {
  return AdminIssueIdSchema.parse(canonicalDeterministicHash(['admin-issue:v1', dedupeKey]));
}

const AdminIssueResolutionSchema = z
  .object({
    reason: z.string().trim().min(1).max(2_000),
    resolvedByAccountId: AccountIdSchema,
  })
  .strict();

const AdminIssueLifecycleSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('open'),
      openedAt: CanonicalTimestampSchema,
      lastDetectedAt: CanonicalTimestampSchema,
      reopenedAt: CanonicalTimestampSchema.optional(),
    })
    .strict(),
  z
    .object({
      status: z.literal('resolved'),
      openedAt: CanonicalTimestampSchema,
      lastDetectedAt: CanonicalTimestampSchema,
      reopenedAt: CanonicalTimestampSchema.optional(),
      resolvedAt: CanonicalTimestampSchema,
      resolution: AdminIssueResolutionSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('dismissed'),
      openedAt: CanonicalTimestampSchema,
      lastDetectedAt: CanonicalTimestampSchema,
      reopenedAt: CanonicalTimestampSchema.optional(),
      resolvedAt: CanonicalTimestampSchema,
      resolution: AdminIssueResolutionSchema,
    })
    .strict(),
]);

export type AdminIssueLifecycle = Readonly<z.output<typeof AdminIssueLifecycleSchema>>;

export const AdminIssueSchema = z
  .object({
    issueId: AdminIssueIdSchema,
    kind: AdminIssueKindSchema,
    subjectRef: AdminIssueSubjectRefSchema,
    occurrenceId: OccurrenceIdSchema.optional(),
    participantId: ParticipantIdSchema.optional(),
    courseDayId: CourseDayIdSchema.optional(),
    scheduleRevision: PersistedAggregateRevisionSchema.optional(),
    reconciliationScope: AdminIssueReconciliationScopeSchema.optional(),
    lifecycle: AdminIssueLifecycleSchema,
    severity: AdminIssueSeveritySchema,
    blocksOutcome: z.boolean(),
    blocksDelivery: z.boolean(),
    dedupeKey: AdminIssueDedupeKeySchema,
    assignedTo: AccountIdSchema.optional(),
    revision: PersistedAggregateRevisionSchema,
    correlationId: CorrelationIdSchema,
    causationId: CommandIdSchema.optional(),
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict()
  .superRefine((issue, context) => {
    addRecordChronologyIssue(issue, context);

    const expectedDedupeKey = adminIssueDedupeKeyFromIdentity(
      adminIssueDedupeIdentityFromRecord(issue)
    );
    if (issue.dedupeKey !== expectedDedupeKey) {
      context.addIssue({
        code: 'custom',
        path: ['dedupeKey'],
        message: 'dedupeKey must match deterministic AdminIssue identity inputs',
      });
    }

    const expectedIssueId = adminIssueIdFromDedupeKey(expectedDedupeKey);
    if ((issue.issueId as string) !== (expectedIssueId as string)) {
      context.addIssue({
        code: 'custom',
        path: ['issueId'],
        message: 'issueId must be derived from dedupeKey',
      });
    }

    const lifecycle = issue.lifecycle;
    if (compareCanonicalTimestamps(lifecycle.lastDetectedAt, lifecycle.openedAt) < 0) {
      context.addIssue({
        code: 'custom',
        path: ['lifecycle', 'lastDetectedAt'],
        message: 'lastDetectedAt must not precede openedAt',
      });
    }
    if (
      lifecycle.reopenedAt !== undefined &&
      compareCanonicalTimestamps(lifecycle.reopenedAt, lifecycle.openedAt) < 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['lifecycle', 'reopenedAt'],
        message: 'reopenedAt must not precede openedAt',
      });
    }
    if (lifecycle.status === 'resolved' || lifecycle.status === 'dismissed') {
      if (compareCanonicalTimestamps(lifecycle.resolvedAt, lifecycle.lastDetectedAt) < 0) {
        context.addIssue({
          code: 'custom',
          path: ['lifecycle', 'resolvedAt'],
          message: 'resolvedAt must not precede lastDetectedAt',
        });
      }
    }
  });

export type AdminIssue = Readonly<z.output<typeof AdminIssueSchema>>;

export function adminIssueLifecycleIsOperationalState(
  issue: Pick<AdminIssue, 'lifecycle'>
): boolean {
  return AdminIssueLifecycleStatusSchema.safeParse(issue.lifecycle.status).success;
}

export function attendanceIsFactualEvidence(attendance: Pick<Attendance, 'attendanceStatus'>): boolean {
  return AttendanceStatusSchema.safeParse(attendance.attendanceStatus).success;
}

export function adminIssueSubjectReference(
  subjectRef: AdminIssueSubjectRef
): CanonicalReference {
  return subjectRef.subjectKind === 'booking'
    ? canonicalReference('booking', subjectRef.bookingId)
    : canonicalReference('course_enrollment', subjectRef.enrollmentId);
}
