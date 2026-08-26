"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminIssueSchema = exports.AdminIssueDedupeIdentityInputSchema = exports.AdminIssueSubjectRefSchema = exports.AdminIssueReconciliationScopeSchema = exports.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION = exports.AdminIssueSeveritySchema = exports.ADMIN_ISSUE_SEVERITIES = exports.AdminIssueLifecycleStatusSchema = exports.ADMIN_ISSUE_LIFECYCLE_STATUSES = exports.AdminIssueKindSchema = exports.ADMIN_ISSUE_KINDS = exports.UnknownAttendanceStatusShapeSchema = exports.AttendanceSchema = exports.CourseDayAttendanceIdentityInputSchema = exports.BookingAttendanceIdentityInputSchema = exports.ATTENDANCE_IDENTITY_STRATEGY_VERSION = exports.AttendanceSubjectRefSchema = exports.CourseEnrollmentAttendanceSubjectRefSchema = exports.BookingAttendanceSubjectRefSchema = exports.AttendanceRecorderSchema = exports.AttendanceSubjectKindSchema = exports.ATTENDANCE_SUBJECT_KINDS = exports.AttendanceStatusSchema = exports.ATTENDANCE_STATUSES = exports.LegacyCourseEnrollmentBookingShapeSchema = exports.WholeCourseCancellationShapeSchema = exports.LegacyCourseScheduleShapeSchema = exports.StructuredCourseDeliverySchema = exports.CourseEnrollmentSchema = exports.CourseEnrollmentAttendanceSummarySchema = exports.CourseEnrollmentCancellationReasonCodeSchema = exports.CourseEnrollmentLifecycleStatusSchema = exports.COURSE_ENROLLMENT_CANCELLATION_REASON_CODES = exports.COURSE_ENROLLMENT_LIFECYCLE_STATUSES = exports.AdminIssueDedupeKeySchema = exports.CourseDaySchema = exports.CourseSchema = exports.CourseCapacitySchema = exports.CourseScheduleProjectionSchema = exports.LEGACY_COURSE_ENROLLMENT_BOOKING_FIELD_NAMES = exports.WHOLE_COURSE_CANCELLATION_FIELD_NAMES = exports.LEGACY_COURSE_SCHEDULE_FIELD_NAMES = exports.COURSE_SCHEDULE_PROJECTION_FIELDS = exports.COURSE_DAY_MAX = exports.COURSE_SEAT_MAX = exports.COURSE_SEAT_MIN = void 0;
exports.validateStructuredCourseDays = validateStructuredCourseDays;
exports.validateCourseEnrollmentAttendanceSummary = validateCourseEnrollmentAttendanceSummary;
exports.attendanceSummaryIsDerivedProjection = attendanceSummaryIsDerivedProjection;
exports.validateCourseEnrollmentOriginLifecycleConsistency = validateCourseEnrollmentOriginLifecycleConsistency;
exports.courseEnrollmentBelongsToExactlyOneParticipant = courseEnrollmentBelongsToExactlyOneParticipant;
exports.enrollmentIdIsOpaqueAndNotDerivedFromParticipantCoursePair = enrollmentIdIsOpaqueAndNotDerivedFromParticipantCoursePair;
exports.containsLegacyCourseScheduleFields = containsLegacyCourseScheduleFields;
exports.containsWholeCourseCancellationFields = containsWholeCourseCancellationFields;
exports.containsCourseEnrollmentBookingShapeFields = containsCourseEnrollmentBookingShapeFields;
exports.bookingAttendanceIdentityKey = bookingAttendanceIdentityKey;
exports.courseDayAttendanceIdentityKey = courseDayAttendanceIdentityKey;
exports.attendanceIdFromBookingIdentity = attendanceIdFromBookingIdentity;
exports.attendanceIdFromCourseDayIdentity = attendanceIdFromCourseDayIdentity;
exports.missingAttendanceIsDocumentAbsence = missingAttendanceIsDocumentAbsence;
exports.adminIssueDedupeIdentityFromRecord = adminIssueDedupeIdentityFromRecord;
exports.adminIssueDedupeKeyFromIdentity = adminIssueDedupeKeyFromIdentity;
exports.adminIssueIdFromDedupeKey = adminIssueIdFromDedupeKey;
exports.adminIssueLifecycleIsOperationalState = adminIssueLifecycleIsOperationalState;
exports.attendanceIsFactualEvidence = attendanceIsFactualEvidence;
exports.adminIssueSubjectReference = adminIssueSubjectReference;
const zod_1 = require("zod");
const identifiers_1 = require("./identifiers");
const accountParticipantAccess_1 = require("./accountParticipantAccess");
const bookingOccurrenceProposalChange_1 = require("./bookingOccurrenceProposalChange");
const deterministicIdentity_1 = require("./deterministicIdentity");
const primitives_1 = require("./primitives");
const PersistedAggregateRevisionSchema = primitives_1.AggregateRevisionSchema.refine((revision) => revision >= 1, 'Persisted aggregate revision must be at least one');
const ProjectionRevisionSchema = primitives_1.AggregateRevisionSchema.refine((revision) => revision >= 0, 'Projection revision must be non-negative');
function addRecordChronologyIssue(record, context) {
    if ((0, primitives_1.compareCanonicalTimestamps)(record.updatedAt, record.createdAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['updatedAt'],
            message: 'updatedAt must not precede createdAt',
        });
    }
}
function addEventChronologyIssue(eventAt, path, record, context) {
    if ((0, primitives_1.compareCanonicalTimestamps)(eventAt, record.createdAt) < 0 ||
        (0, primitives_1.compareCanonicalTimestamps)(eventAt, record.updatedAt) > 0) {
        context.addIssue({
            code: 'custom',
            path,
            message: 'Lifecycle timestamp must fall between createdAt and updatedAt',
        });
    }
}
exports.COURSE_SEAT_MIN = 1;
exports.COURSE_SEAT_MAX = 64;
exports.COURSE_DAY_MAX = 64;
exports.COURSE_SCHEDULE_PROJECTION_FIELDS = [
    'courseDayCount',
    'finalCourseDayEndsAt',
    'courseScheduleRevision',
];
exports.LEGACY_COURSE_SCHEDULE_FIELD_NAMES = [
    'dates',
    'date',
    'time',
    'duration',
    'durationHours',
    'courseEndsAt',
    'deliveryDates',
    'scheduleDates',
];
exports.WHOLE_COURSE_CANCELLATION_FIELD_NAMES = [
    'courseCancellationStatus',
    'wholeCourseCancelled',
    'wholeCourseCancellation',
    'cancelEntireCourse',
];
exports.LEGACY_COURSE_ENROLLMENT_BOOKING_FIELD_NAMES = [
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
];
exports.CourseScheduleProjectionSchema = zod_1.z
    .object({
    courseDayCount: zod_1.z.number().finite().int().min(1).max(exports.COURSE_DAY_MAX),
    finalCourseDayEndsAt: primitives_1.CanonicalTimestampSchema,
    courseScheduleRevision: PersistedAggregateRevisionSchema,
})
    .strict();
exports.CourseCapacitySchema = zod_1.z
    .object({
    totalSeats: zod_1.z.number().finite().int().min(exports.COURSE_SEAT_MIN).max(exports.COURSE_SEAT_MAX),
    availableSeats: zod_1.z.number().finite().int().min(0).max(exports.COURSE_SEAT_MAX),
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
exports.CourseSchema = zod_1.z
    .object({
    courseId: identifiers_1.CourseIdSchema,
    title: zod_1.z.string().trim().min(1).max(200),
    price: primitives_1.KztMinorUnitsSchema,
    capacity: exports.CourseCapacitySchema,
    instructorRosterIds: zod_1.z.array(identifiers_1.InstructorIdSchema).min(1).max(16),
    startAt: primitives_1.CanonicalTimestampSchema,
    scheduleProjection: exports.CourseScheduleProjectionSchema,
    revision: PersistedAggregateRevisionSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
    audit: accountParticipantAccess_1.CanonicalRecordMetadataSchema.shape.audit,
})
    .strict()
    .superRefine((course, context) => {
    addRecordChronologyIssue(course, context);
    for (const [index, instructorId] of course.instructorRosterIds.entries()) {
        if ((0, bookingOccurrenceProposalChange_1.isSyntheticCourseInstructorId)(instructorId)) {
            context.addIssue({
                code: 'custom',
                path: ['instructorRosterIds', index],
                message: 'Synthetic course Instructor IDs are not canonical on Courses',
            });
        }
    }
});
exports.CourseDaySchema = zod_1.z
    .object({
    courseId: identifiers_1.CourseIdSchema,
    courseDayId: identifiers_1.CourseDayIdSchema,
    dayOrder: zod_1.z.number().finite().int().min(1).max(exports.COURSE_SEAT_MAX),
    interval: primitives_1.TimeIntervalSchema,
    timeZone: primitives_1.IanaTimeZoneSchema,
    actualInstructorIds: zod_1.z.array(identifiers_1.InstructorIdSchema).min(1).max(8),
    revision: PersistedAggregateRevisionSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
    audit: accountParticipantAccess_1.CanonicalRecordMetadataSchema.shape.audit,
})
    .strict()
    .superRefine((courseDay, context) => {
    addRecordChronologyIssue(courseDay, context);
    for (const [index, instructorId] of courseDay.actualInstructorIds.entries()) {
        if ((0, bookingOccurrenceProposalChange_1.isSyntheticCourseInstructorId)(instructorId)) {
            context.addIssue({
                code: 'custom',
                path: ['actualInstructorIds', index],
                message: 'Synthetic course Instructor IDs are not canonical on CourseDays',
            });
        }
    }
});
exports.AdminIssueDedupeKeySchema = zod_1.z
    .string()
    .min(1)
    .max(512)
    .transform((value) => value);
function validateStructuredCourseDays(courseDays, context, basePath = ['courseDays']) {
    const seenDayIds = new Set();
    const seenOrders = new Set();
    courseDays.forEach((courseDay, index) => {
        const dayId = courseDay.courseDayId;
        if (seenDayIds.has(dayId)) {
            context.addIssue({
                code: 'custom',
                path: [...basePath, index, 'courseDayId'],
                message: 'Duplicate CourseDay identity',
            });
        }
        else {
            seenDayIds.add(dayId);
        }
        if (seenOrders.has(courseDay.dayOrder)) {
            context.addIssue({
                code: 'custom',
                path: [...basePath, index, 'dayOrder'],
                message: 'Duplicate CourseDay order',
            });
        }
        else {
            seenOrders.add(courseDay.dayOrder);
        }
    });
}
exports.COURSE_ENROLLMENT_LIFECYCLE_STATUSES = [
    'pending',
    'confirmed',
    'pending_cancellation',
    'cancelled',
    'withdrawn',
    'completed',
    'no_show',
];
exports.COURSE_ENROLLMENT_CANCELLATION_REASON_CODES = [
    'reservation_expired',
    'guest_cancelled',
    'account_owner_cancelled',
    'administrator_cancelled',
    'incomplete_payment',
    'system_expired',
];
exports.CourseEnrollmentLifecycleStatusSchema = zod_1.z.enum(exports.COURSE_ENROLLMENT_LIFECYCLE_STATUSES);
exports.CourseEnrollmentCancellationReasonCodeSchema = zod_1.z.enum(exports.COURSE_ENROLLMENT_CANCELLATION_REASON_CODES);
const CourseEnrollmentLifecycleSchema = zod_1.z.discriminatedUnion('status', [
    zod_1.z
        .object({
        status: zod_1.z.literal('pending'),
        reservationExpiresAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
    zod_1.z.object({ status: zod_1.z.literal('confirmed') }).strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('pending_cancellation'),
        requestedAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('cancelled'),
        cancelledAt: primitives_1.CanonicalTimestampSchema,
        reasonCode: exports.CourseEnrollmentCancellationReasonCodeSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('withdrawn'),
        withdrawnAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('completed'),
        completedAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('no_show'),
        noShowAt: primitives_1.CanonicalTimestampSchema,
    })
        .strict(),
]);
exports.CourseEnrollmentAttendanceSummarySchema = zod_1.z
    .object({
    recordedDayCount: zod_1.z.number().finite().int().nonnegative(),
    presentDayCount: zod_1.z.number().finite().int().nonnegative(),
    absentDayCount: zod_1.z.number().finite().int().nonnegative(),
    projectionRevision: ProjectionRevisionSchema,
})
    .strict()
    .describe('Rebuildable transactional projection derived from canonical CourseDay Attendance documents; not source of truth');
function validateCourseEnrollmentAttendanceSummary(summary, courseDayCount, context, basePath = ['attendanceSummary']) {
    const add = (path, message) => {
        context.addIssue({ code: 'custom', path: [...basePath, path], message });
    };
    if (summary.recordedDayCount !== summary.presentDayCount + summary.absentDayCount) {
        add('recordedDayCount', 'recordedDayCount must equal presentDayCount + absentDayCount');
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
function attendanceSummaryIsDerivedProjection(summary) {
    return summary === undefined || exports.CourseEnrollmentAttendanceSummarySchema.safeParse(summary).success;
}
exports.CourseEnrollmentSchema = zod_1.z
    .object({
    enrollmentId: identifiers_1.CourseEnrollmentIdSchema,
    participantId: identifiers_1.ParticipantIdSchema,
    courseId: identifiers_1.CourseIdSchema,
    originalCourseId: identifiers_1.CourseIdSchema,
    attribution: bookingOccurrenceProposalChange_1.ImmutableBookingAttributionSchema,
    lifecycle: CourseEnrollmentLifecycleSchema,
    paymentId: identifiers_1.PaymentIdSchema,
    payerAccountId: identifiers_1.AccountIdSchema.optional(),
    attendanceSummary: exports.CourseEnrollmentAttendanceSummarySchema.optional(),
    revision: PersistedAggregateRevisionSchema,
    createdAt: primitives_1.CanonicalTimestampSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
    audit: accountParticipantAccess_1.CanonicalRecordMetadataSchema.shape.audit,
})
    .strict()
    .superRefine((enrollment, context) => {
    addRecordChronologyIssue(enrollment, context);
    (0, bookingOccurrenceProposalChange_1.validateBookingAttribution)(enrollment.attribution, context);
    validateCourseEnrollmentOriginLifecycleConsistency(enrollment.attribution, enrollment.lifecycle, context);
    if (enrollment.lifecycle.status === 'pending') {
        if ((0, primitives_1.compareCanonicalTimestamps)(enrollment.lifecycle.reservationExpiresAt, enrollment.createdAt) < 0) {
            context.addIssue({
                code: 'custom',
                path: ['lifecycle', 'reservationExpiresAt'],
                message: 'reservationExpiresAt must not precede createdAt',
            });
        }
    }
    if (enrollment.lifecycle.status === 'pending_cancellation') {
        addEventChronologyIssue(enrollment.lifecycle.requestedAt, ['lifecycle', 'requestedAt'], enrollment, context);
    }
    if (enrollment.lifecycle.status === 'cancelled') {
        addEventChronologyIssue(enrollment.lifecycle.cancelledAt, ['lifecycle', 'cancelledAt'], enrollment, context);
    }
    if (enrollment.lifecycle.status === 'withdrawn') {
        addEventChronologyIssue(enrollment.lifecycle.withdrawnAt, ['lifecycle', 'withdrawnAt'], enrollment, context);
    }
    if (enrollment.lifecycle.status === 'completed') {
        addEventChronologyIssue(enrollment.lifecycle.completedAt, ['lifecycle', 'completedAt'], enrollment, context);
    }
    if (enrollment.lifecycle.status === 'no_show') {
        addEventChronologyIssue(enrollment.lifecycle.noShowAt, ['lifecycle', 'noShowAt'], enrollment, context);
    }
    if (enrollment.attendanceSummary) {
        validateCourseEnrollmentAttendanceSummary(enrollment.attendanceSummary, Number.POSITIVE_INFINITY, context);
    }
});
exports.StructuredCourseDeliverySchema = zod_1.z
    .object({
    course: exports.CourseSchema,
    courseDays: zod_1.z.array(exports.CourseDaySchema).min(1).max(exports.COURSE_DAY_MAX),
    enrollment: exports.CourseEnrollmentSchema.optional(),
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
        validateCourseEnrollmentAttendanceSummary(delivery.enrollment.attendanceSummary, delivery.course.scheduleProjection.courseDayCount, context, ['enrollment', 'attendanceSummary']);
        if (delivery.enrollment.courseId !== delivery.course.courseId) {
            context.addIssue({
                code: 'custom',
                path: ['enrollment', 'courseId'],
                message: 'CourseEnrollment must reference the delivery Course',
            });
        }
    }
});
function validateCourseEnrollmentOriginLifecycleConsistency(attribution, lifecycle, context) {
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
function courseEnrollmentBelongsToExactlyOneParticipant(enrollment) {
    return identifiers_1.ParticipantIdSchema.safeParse(enrollment.participantId).success;
}
function enrollmentIdIsOpaqueAndNotDerivedFromParticipantCoursePair(enrollmentId, participantId, courseId) {
    const enrollmentKey = enrollmentId;
    const derivedPairKey = `${participantId}_${courseId}`;
    const derivedBookingStyleKey = `booking_course_${participantId}_${courseId}`;
    return enrollmentKey !== derivedPairKey && enrollmentKey !== derivedBookingStyleKey;
}
function containsLegacyCourseScheduleFields(input) {
    if (!input || typeof input !== 'object')
        return false;
    const record = input;
    return exports.LEGACY_COURSE_SCHEDULE_FIELD_NAMES.some((field) => record[field] !== undefined);
}
function containsWholeCourseCancellationFields(input) {
    if (!input || typeof input !== 'object')
        return false;
    const record = input;
    return exports.WHOLE_COURSE_CANCELLATION_FIELD_NAMES.some((field) => record[field] !== undefined);
}
function containsCourseEnrollmentBookingShapeFields(input) {
    if (!input || typeof input !== 'object')
        return false;
    const record = input;
    if (typeof record.instructorId === 'string' && (0, bookingOccurrenceProposalChange_1.isSyntheticCourseInstructorId)(record.instructorId)) {
        return true;
    }
    return exports.LEGACY_COURSE_ENROLLMENT_BOOKING_FIELD_NAMES.some((field) => record[field] !== undefined);
}
exports.LegacyCourseScheduleShapeSchema = zod_1.z
    .object({
    dates: zod_1.z.unknown().optional(),
    date: zod_1.z.unknown().optional(),
    time: zod_1.z.unknown().optional(),
    duration: zod_1.z.unknown().optional(),
    durationHours: zod_1.z.unknown().optional(),
    courseEndsAt: zod_1.z.unknown().optional(),
    deliveryDates: zod_1.z.unknown().optional(),
    scheduleDates: zod_1.z.unknown().optional(),
})
    .strict()
    .superRefine((value, context) => {
    for (const field of exports.LEGACY_COURSE_SCHEDULE_FIELD_NAMES) {
        if (value[field] !== undefined) {
            context.addIssue({
                code: 'custom',
                path: [field],
                message: 'Legacy free-form Course schedule fields are not canonical',
            });
        }
    }
});
exports.WholeCourseCancellationShapeSchema = zod_1.z
    .object({
    courseCancellationStatus: zod_1.z.unknown().optional(),
    wholeCourseCancelled: zod_1.z.unknown().optional(),
    wholeCourseCancellation: zod_1.z.unknown().optional(),
    cancelEntireCourse: zod_1.z.unknown().optional(),
})
    .strict()
    .superRefine((value, context) => {
    for (const field of exports.WHOLE_COURSE_CANCELLATION_FIELD_NAMES) {
        if (value[field] !== undefined) {
            context.addIssue({
                code: 'custom',
                path: [field],
                message: 'Whole-Course cancellation fields are out of scope for canonical Courses',
            });
        }
    }
});
exports.LegacyCourseEnrollmentBookingShapeSchema = zod_1.z
    .object({
    bookingId: zod_1.z.unknown().optional(),
    party: zod_1.z.unknown().optional(),
    occurrence: zod_1.z.unknown().optional(),
    instructorId: zod_1.z.unknown().optional(),
    userId: zod_1.z.unknown().optional(),
    isGuest: zod_1.z.unknown().optional(),
    date: zod_1.z.unknown().optional(),
    time: zod_1.z.unknown().optional(),
    durationHours: zod_1.z.unknown().optional(),
    duration: zod_1.z.unknown().optional(),
    serviceParticipantIds: zod_1.z.unknown().optional(),
    syntheticInstructorId: zod_1.z.unknown().optional(),
})
    .strict()
    .superRefine((value, context) => {
    if (typeof value.instructorId === 'string' && (0, bookingOccurrenceProposalChange_1.isSyntheticCourseInstructorId)(value.instructorId)) {
        context.addIssue({
            code: 'custom',
            path: ['instructorId'],
            message: 'CourseEnrollment must not use synthetic course Instructor IDs',
        });
    }
    for (const field of exports.LEGACY_COURSE_ENROLLMENT_BOOKING_FIELD_NAMES) {
        if (value[field] !== undefined) {
            context.addIssue({
                code: 'custom',
                path: [field],
                message: 'CourseEnrollment must not use Booking-shaped fields',
            });
        }
    }
});
exports.ATTENDANCE_STATUSES = ['present', 'absent'];
exports.AttendanceStatusSchema = zod_1.z.enum(exports.ATTENDANCE_STATUSES);
exports.ATTENDANCE_SUBJECT_KINDS = ['booking', 'course_enrollment'];
exports.AttendanceSubjectKindSchema = zod_1.z.enum(exports.ATTENDANCE_SUBJECT_KINDS);
exports.AttendanceRecorderSchema = zod_1.z.discriminatedUnion('kind', [
    zod_1.z.object({ kind: zod_1.z.literal('instructor'), instructorId: identifiers_1.InstructorIdSchema }).strict(),
    zod_1.z.object({ kind: zod_1.z.literal('administrator'), accountId: identifiers_1.AccountIdSchema }).strict(),
]);
exports.BookingAttendanceSubjectRefSchema = zod_1.z
    .object({
    subjectKind: zod_1.z.literal('booking'),
    bookingId: identifiers_1.BookingIdSchema,
    occurrenceId: identifiers_1.OccurrenceIdSchema,
    participantId: identifiers_1.ParticipantIdSchema,
})
    .strict();
exports.CourseEnrollmentAttendanceSubjectRefSchema = zod_1.z
    .object({
    subjectKind: zod_1.z.literal('course_enrollment'),
    enrollmentId: identifiers_1.CourseEnrollmentIdSchema,
    courseId: identifiers_1.CourseIdSchema,
    courseDayId: identifiers_1.CourseDayIdSchema,
    occurrenceId: identifiers_1.OccurrenceIdSchema,
    participantId: identifiers_1.ParticipantIdSchema,
})
    .strict();
exports.AttendanceSubjectRefSchema = zod_1.z.discriminatedUnion('subjectKind', [
    exports.BookingAttendanceSubjectRefSchema,
    exports.CourseEnrollmentAttendanceSubjectRefSchema,
]);
exports.ATTENDANCE_IDENTITY_STRATEGY_VERSION = 'attendance:v1';
function bookingAttendanceIdentityKey(input) {
    return `${exports.ATTENDANCE_IDENTITY_STRATEGY_VERSION}:booking:${input.occurrenceId}:${input.participantId}`;
}
function courseDayAttendanceIdentityKey(input) {
    return `${exports.ATTENDANCE_IDENTITY_STRATEGY_VERSION}:course-day:${input.enrollmentId}:${input.courseDayId}`;
}
exports.BookingAttendanceIdentityInputSchema = zod_1.z
    .object({
    strategyVersion: zod_1.z.literal(exports.ATTENDANCE_IDENTITY_STRATEGY_VERSION),
    subjectKind: zod_1.z.literal('booking'),
    occurrenceId: identifiers_1.OccurrenceIdSchema,
    participantId: identifiers_1.ParticipantIdSchema,
})
    .strict()
    .superRefine((input, context) => {
    (0, deterministicIdentity_1.validateDeterministicIdentityInputs)({
        occurrenceId: input.occurrenceId,
        participantId: input.participantId,
    }, context);
});
exports.CourseDayAttendanceIdentityInputSchema = zod_1.z
    .object({
    strategyVersion: zod_1.z.literal(exports.ATTENDANCE_IDENTITY_STRATEGY_VERSION),
    subjectKind: zod_1.z.literal('course_enrollment'),
    enrollmentId: identifiers_1.CourseEnrollmentIdSchema,
    courseDayId: identifiers_1.CourseDayIdSchema,
})
    .strict()
    .superRefine((input, context) => {
    (0, deterministicIdentity_1.validateDeterministicIdentityInputs)({
        enrollmentId: input.enrollmentId,
        courseDayId: input.courseDayId,
    }, context);
});
function attendanceIdFromBookingIdentity(input) {
    const parsed = exports.BookingAttendanceIdentityInputSchema.parse(input);
    return identifiers_1.AttendanceIdSchema.parse((0, deterministicIdentity_1.canonicalDeterministicHash)([
        parsed.strategyVersion,
        'booking',
        parsed.occurrenceId,
        parsed.participantId,
    ]));
}
function attendanceIdFromCourseDayIdentity(input) {
    const parsed = exports.CourseDayAttendanceIdentityInputSchema.parse(input);
    return identifiers_1.AttendanceIdSchema.parse((0, deterministicIdentity_1.canonicalDeterministicHash)([
        parsed.strategyVersion,
        'course-day',
        parsed.enrollmentId,
        parsed.courseDayId,
    ]));
}
exports.AttendanceSchema = zod_1.z
    .object({
    attendanceId: identifiers_1.AttendanceIdSchema,
    subject: exports.AttendanceSubjectRefSchema,
    attendanceStatus: exports.AttendanceStatusSchema,
    recordedBy: exports.AttendanceRecorderSchema,
    recordedAt: primitives_1.CanonicalTimestampSchema,
    lastChangedBy: exports.AttendanceRecorderSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
    revision: PersistedAggregateRevisionSchema,
    correlationId: identifiers_1.CorrelationIdSchema,
    causationId: identifiers_1.CommandIdSchema.optional(),
})
    .strict()
    .superRefine((attendance, context) => {
    if ((0, primitives_1.compareCanonicalTimestamps)(attendance.updatedAt, attendance.recordedAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['updatedAt'],
            message: 'updatedAt must not precede recordedAt',
        });
    }
    const subject = attendance.subject;
    if (subject.subjectKind === 'booking') {
        const expectedId = attendanceIdFromBookingIdentity({
            strategyVersion: exports.ATTENDANCE_IDENTITY_STRATEGY_VERSION,
            subjectKind: 'booking',
            occurrenceId: subject.occurrenceId,
            participantId: subject.participantId,
        });
        if (attendance.attendanceId !== expectedId) {
            context.addIssue({
                code: 'custom',
                path: ['attendanceId'],
                message: 'attendanceId must match the deterministic Booking Attendance identity',
            });
        }
    }
    else {
        const expectedId = attendanceIdFromCourseDayIdentity({
            strategyVersion: exports.ATTENDANCE_IDENTITY_STRATEGY_VERSION,
            subjectKind: 'course_enrollment',
            enrollmentId: subject.enrollmentId,
            courseDayId: subject.courseDayId,
        });
        if (attendance.attendanceId !== expectedId) {
            context.addIssue({
                code: 'custom',
                path: ['attendanceId'],
                message: 'attendanceId must match the deterministic CourseDay Attendance identity',
            });
        }
    }
});
exports.UnknownAttendanceStatusShapeSchema = zod_1.z
    .object({
    attendanceStatus: zod_1.z.literal('unknown'),
})
    .strict()
    .superRefine((_value, context) => {
    context.addIssue({
        code: 'custom',
        path: ['attendanceStatus'],
        message: 'Explicit unknown Attendance status is forbidden; missing documents mean unknown',
    });
});
function missingAttendanceIsDocumentAbsence() {
    return true;
}
exports.ADMIN_ISSUE_KINDS = [
    'missing_attendance',
    'payment_required_at_start',
    'unresolved_pending_cancellation',
    'attendance_payment_conflict',
    'resource_reconciliation_mismatch',
    'financial_reconciliation_mismatch',
    'outcome_correction_required',
];
exports.AdminIssueKindSchema = zod_1.z.enum(exports.ADMIN_ISSUE_KINDS);
exports.ADMIN_ISSUE_LIFECYCLE_STATUSES = ['open', 'resolved', 'dismissed'];
exports.AdminIssueLifecycleStatusSchema = zod_1.z.enum(exports.ADMIN_ISSUE_LIFECYCLE_STATUSES);
exports.ADMIN_ISSUE_SEVERITIES = ['normal', 'urgent', 'critical'];
exports.AdminIssueSeveritySchema = zod_1.z.enum(exports.ADMIN_ISSUE_SEVERITIES);
exports.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION = 'issue:v1';
const ADMIN_ISSUE_RECONCILIATION_SCOPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
exports.AdminIssueReconciliationScopeSchema = zod_1.z
    .string()
    .min(1)
    .max(128)
    .regex(ADMIN_ISSUE_RECONCILIATION_SCOPE_PATTERN, 'Reconciliation scope must be an opaque identifier');
exports.AdminIssueSubjectRefSchema = zod_1.z.discriminatedUnion('subjectKind', [
    zod_1.z.object({ subjectKind: zod_1.z.literal('booking'), bookingId: identifiers_1.BookingIdSchema }).strict(),
    zod_1.z
        .object({ subjectKind: zod_1.z.literal('course_enrollment'), enrollmentId: identifiers_1.CourseEnrollmentIdSchema })
        .strict(),
]);
exports.AdminIssueDedupeIdentityInputSchema = zod_1.z
    .object({
    strategyVersion: zod_1.z.literal(exports.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION),
    kind: exports.AdminIssueKindSchema,
    subjectKind: zod_1.z.enum(['booking', 'course_enrollment']),
    subjectId: zod_1.z.union([identifiers_1.BookingIdSchema, identifiers_1.CourseEnrollmentIdSchema]),
    occurrenceId: identifiers_1.OccurrenceIdSchema.optional(),
    participantId: identifiers_1.ParticipantIdSchema.optional(),
    courseDayId: identifiers_1.CourseDayIdSchema.optional(),
    scheduleRevision: PersistedAggregateRevisionSchema.optional(),
    reconciliationScope: exports.AdminIssueReconciliationScopeSchema.optional(),
})
    .strict()
    .superRefine((input, context) => {
    (0, deterministicIdentity_1.validateDeterministicIdentityInputs)({
        kind: input.kind,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        occurrenceId: input.occurrenceId ?? '',
        participantId: input.participantId ?? '',
        courseDayId: input.courseDayId ?? '',
        scheduleRevision: input.scheduleRevision === undefined ? '' : String(input.scheduleRevision),
        reconciliationScope: input.reconciliationScope ?? '',
    }, context);
    if (input.subjectKind === 'booking' && !identifiers_1.BookingIdSchema.safeParse(input.subjectId).success) {
        context.addIssue({
            code: 'custom',
            path: ['subjectId'],
            message: 'Booking AdminIssue subjectId must be a BookingId',
        });
    }
    if (input.subjectKind === 'course_enrollment' &&
        !identifiers_1.CourseEnrollmentIdSchema.safeParse(input.subjectId).success) {
        context.addIssue({
            code: 'custom',
            path: ['subjectId'],
            message: 'CourseEnrollment AdminIssue subjectId must be a CourseEnrollmentId',
        });
    }
});
function adminIssueDedupeIdentityFromRecord(issue) {
    return {
        strategyVersion: exports.ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION,
        kind: issue.kind,
        subjectKind: issue.subjectRef.subjectKind,
        subjectId: issue.subjectRef.subjectKind === 'booking'
            ? issue.subjectRef.bookingId
            : issue.subjectRef.enrollmentId,
        occurrenceId: issue.occurrenceId,
        participantId: issue.participantId,
        courseDayId: issue.courseDayId,
        scheduleRevision: issue.scheduleRevision,
        reconciliationScope: issue.reconciliationScope,
    };
}
function adminIssueDedupeKeyFromIdentity(input) {
    const parsed = exports.AdminIssueDedupeIdentityInputSchema.parse(input);
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
    return parts.join(':');
}
function adminIssueIdFromDedupeKey(dedupeKey) {
    return identifiers_1.AdminIssueIdSchema.parse((0, deterministicIdentity_1.canonicalDeterministicHash)(['admin-issue:v1', dedupeKey]));
}
const AdminIssueResolutionSchema = zod_1.z
    .object({
    reason: zod_1.z.string().trim().min(1).max(2_000),
    resolvedByAccountId: identifiers_1.AccountIdSchema,
})
    .strict();
const AdminIssueLifecycleSchema = zod_1.z.discriminatedUnion('status', [
    zod_1.z
        .object({
        status: zod_1.z.literal('open'),
        openedAt: primitives_1.CanonicalTimestampSchema,
        lastDetectedAt: primitives_1.CanonicalTimestampSchema,
        reopenedAt: primitives_1.CanonicalTimestampSchema.optional(),
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('resolved'),
        openedAt: primitives_1.CanonicalTimestampSchema,
        lastDetectedAt: primitives_1.CanonicalTimestampSchema,
        reopenedAt: primitives_1.CanonicalTimestampSchema.optional(),
        resolvedAt: primitives_1.CanonicalTimestampSchema,
        resolution: AdminIssueResolutionSchema,
    })
        .strict(),
    zod_1.z
        .object({
        status: zod_1.z.literal('dismissed'),
        openedAt: primitives_1.CanonicalTimestampSchema,
        lastDetectedAt: primitives_1.CanonicalTimestampSchema,
        reopenedAt: primitives_1.CanonicalTimestampSchema.optional(),
        resolvedAt: primitives_1.CanonicalTimestampSchema,
        resolution: AdminIssueResolutionSchema,
    })
        .strict(),
]);
exports.AdminIssueSchema = zod_1.z
    .object({
    issueId: identifiers_1.AdminIssueIdSchema,
    kind: exports.AdminIssueKindSchema,
    subjectRef: exports.AdminIssueSubjectRefSchema,
    occurrenceId: identifiers_1.OccurrenceIdSchema.optional(),
    participantId: identifiers_1.ParticipantIdSchema.optional(),
    courseDayId: identifiers_1.CourseDayIdSchema.optional(),
    scheduleRevision: PersistedAggregateRevisionSchema.optional(),
    reconciliationScope: exports.AdminIssueReconciliationScopeSchema.optional(),
    lifecycle: AdminIssueLifecycleSchema,
    severity: exports.AdminIssueSeveritySchema,
    blocksOutcome: zod_1.z.boolean(),
    blocksDelivery: zod_1.z.boolean(),
    dedupeKey: exports.AdminIssueDedupeKeySchema,
    assignedTo: identifiers_1.AccountIdSchema.optional(),
    revision: PersistedAggregateRevisionSchema,
    correlationId: identifiers_1.CorrelationIdSchema,
    causationId: identifiers_1.CommandIdSchema.optional(),
    createdAt: primitives_1.CanonicalTimestampSchema,
    updatedAt: primitives_1.CanonicalTimestampSchema,
    audit: accountParticipantAccess_1.CanonicalRecordMetadataSchema.shape.audit,
})
    .strict()
    .superRefine((issue, context) => {
    addRecordChronologyIssue(issue, context);
    const expectedDedupeKey = adminIssueDedupeKeyFromIdentity(adminIssueDedupeIdentityFromRecord(issue));
    if (issue.dedupeKey !== expectedDedupeKey) {
        context.addIssue({
            code: 'custom',
            path: ['dedupeKey'],
            message: 'dedupeKey must match deterministic AdminIssue identity inputs',
        });
    }
    const expectedIssueId = adminIssueIdFromDedupeKey(expectedDedupeKey);
    if (issue.issueId !== expectedIssueId) {
        context.addIssue({
            code: 'custom',
            path: ['issueId'],
            message: 'issueId must be derived from dedupeKey',
        });
    }
    const lifecycle = issue.lifecycle;
    if ((0, primitives_1.compareCanonicalTimestamps)(lifecycle.lastDetectedAt, lifecycle.openedAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['lifecycle', 'lastDetectedAt'],
            message: 'lastDetectedAt must not precede openedAt',
        });
    }
    if (lifecycle.reopenedAt !== undefined &&
        (0, primitives_1.compareCanonicalTimestamps)(lifecycle.reopenedAt, lifecycle.openedAt) < 0) {
        context.addIssue({
            code: 'custom',
            path: ['lifecycle', 'reopenedAt'],
            message: 'reopenedAt must not precede openedAt',
        });
    }
    if (lifecycle.status === 'resolved' || lifecycle.status === 'dismissed') {
        if ((0, primitives_1.compareCanonicalTimestamps)(lifecycle.resolvedAt, lifecycle.lastDetectedAt) < 0) {
            context.addIssue({
                code: 'custom',
                path: ['lifecycle', 'resolvedAt'],
                message: 'resolvedAt must not precede lastDetectedAt',
            });
        }
    }
});
function adminIssueLifecycleIsOperationalState(issue) {
    return exports.AdminIssueLifecycleStatusSchema.safeParse(issue.lifecycle.status).success;
}
function attendanceIsFactualEvidence(attendance) {
    return exports.AttendanceStatusSchema.safeParse(attendance.attendanceStatus).success;
}
function adminIssueSubjectReference(subjectRef) {
    return subjectRef.subjectKind === 'booking'
        ? (0, identifiers_1.canonicalReference)('booking', subjectRef.bookingId)
        : (0, identifiers_1.canonicalReference)('course_enrollment', subjectRef.enrollmentId);
}
