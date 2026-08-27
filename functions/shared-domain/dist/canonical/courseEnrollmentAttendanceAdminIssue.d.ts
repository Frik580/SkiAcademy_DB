import { z } from 'zod';
import { type AdminIssueId, type AttendanceId, type CanonicalReference, type CourseDayId, type CourseEnrollmentId, type CourseId, type OccurrenceId, type ParticipantId } from './identifiers';
import { type ImmutableBookingAttribution } from './bookingOccurrenceProposalChange';
declare const PersistedAggregateRevisionSchema: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
export declare const COURSE_SEAT_MIN: 1;
export declare const COURSE_SEAT_MAX: 64;
export declare const COURSE_DAY_MAX: 64;
export declare const COURSE_SCHEDULE_PROJECTION_FIELDS: readonly ["courseDayCount", "finalCourseDayEndsAt", "courseScheduleRevision"];
export declare const LEGACY_COURSE_SCHEDULE_FIELD_NAMES: readonly ["dates", "date", "time", "duration", "durationHours", "courseEndsAt", "deliveryDates", "scheduleDates"];
export declare const WHOLE_COURSE_CANCELLATION_FIELD_NAMES: readonly ["courseCancellationStatus", "wholeCourseCancelled", "wholeCourseCancellation", "cancelEntireCourse"];
export declare const LEGACY_COURSE_ENROLLMENT_BOOKING_FIELD_NAMES: readonly ["bookingId", "party", "occurrence", "instructorId", "userId", "isGuest", "date", "time", "durationHours", "duration", "serviceParticipantIds", "syntheticInstructorId"];
export declare const CourseScheduleProjectionSchema: z.ZodObject<{
    courseDayCount: z.ZodNumber;
    finalCourseDayEndsAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    courseScheduleRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
}, z.core.$strict>;
export type CourseScheduleProjection = Readonly<z.output<typeof CourseScheduleProjectionSchema>>;
export declare const CourseCapacitySchema: z.ZodObject<{
    totalSeats: z.ZodNumber;
    availableSeats: z.ZodNumber;
}, z.core.$strict>;
export type CourseCapacity = Readonly<z.output<typeof CourseCapacitySchema>>;
export declare const CourseSchema: z.ZodObject<{
    courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
    title: z.ZodString;
    price: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").KztMinorUnits, number>>;
    capacity: z.ZodObject<{
        totalSeats: z.ZodNumber;
        availableSeats: z.ZodNumber;
    }, z.core.$strict>;
    instructorRosterIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>>;
    startAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    scheduleProjection: z.ZodObject<{
        courseDayCount: z.ZodNumber;
        finalCourseDayEndsAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        courseScheduleRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    }, z.core.$strict>;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type Course = Readonly<z.output<typeof CourseSchema>>;
export declare const CourseDaySchema: z.ZodObject<{
    courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
    courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_day">, string>>;
    dayOrder: z.ZodNumber;
    interval: z.ZodObject<{
        startsAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        endsAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>;
    timeZone: z.ZodString;
    actualInstructorIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>>;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type CourseDay = Readonly<z.output<typeof CourseDaySchema>>;
declare const adminIssueDedupeKeyBrand: unique symbol;
export type AdminIssueDedupeKey = string & {
    readonly [adminIssueDedupeKeyBrand]: 'AdminIssueDedupeKey';
};
export declare const AdminIssueDedupeKeySchema: z.ZodPipe<z.ZodString, z.ZodTransform<AdminIssueDedupeKey, string>>;
export declare function validateStructuredCourseDays(courseDays: readonly CourseDay[], context: z.RefinementCtx, basePath?: (string | number)[]): void;
export declare const COURSE_ENROLLMENT_LIFECYCLE_STATUSES: readonly ["pending", "confirmed", "pending_cancellation", "cancelled", "withdrawn", "completed", "no_show"];
export type CourseEnrollmentLifecycleStatus = (typeof COURSE_ENROLLMENT_LIFECYCLE_STATUSES)[number];
export declare const COURSE_ENROLLMENT_CANCELLATION_REASON_CODES: readonly ["reservation_expired", "guest_cancelled", "account_owner_cancelled", "administrator_cancelled", "incomplete_payment", "system_expired"];
export type CourseEnrollmentCancellationReasonCode = (typeof COURSE_ENROLLMENT_CANCELLATION_REASON_CODES)[number];
export declare const CourseEnrollmentLifecycleStatusSchema: z.ZodEnum<{
    pending: "pending";
    confirmed: "confirmed";
    cancelled: "cancelled";
    completed: "completed";
    pending_cancellation: "pending_cancellation";
    no_show: "no_show";
    withdrawn: "withdrawn";
}>;
export declare const CourseEnrollmentCancellationReasonCodeSchema: z.ZodEnum<{
    reservation_expired: "reservation_expired";
    guest_cancelled: "guest_cancelled";
    account_owner_cancelled: "account_owner_cancelled";
    administrator_cancelled: "administrator_cancelled";
    incomplete_payment: "incomplete_payment";
    system_expired: "system_expired";
}>;
declare const CourseEnrollmentLifecycleSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    status: z.ZodLiteral<"pending">;
    reservationExpiresAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"confirmed">;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"pending_cancellation">;
    requestedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"cancelled">;
    cancelledAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    reasonCode: z.ZodEnum<{
        reservation_expired: "reservation_expired";
        guest_cancelled: "guest_cancelled";
        account_owner_cancelled: "account_owner_cancelled";
        administrator_cancelled: "administrator_cancelled";
        incomplete_payment: "incomplete_payment";
        system_expired: "system_expired";
    }>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"withdrawn">;
    withdrawnAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"completed">;
    completedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"no_show">;
    noShowAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>], "status">;
export type CourseEnrollmentLifecycle = Readonly<z.output<typeof CourseEnrollmentLifecycleSchema>>;
export declare const CourseEnrollmentAttendanceSummarySchema: z.ZodObject<{
    recordedDayCount: z.ZodNumber;
    presentDayCount: z.ZodNumber;
    absentDayCount: z.ZodNumber;
    projectionRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
}, z.core.$strict>;
export type CourseEnrollmentAttendanceSummary = Readonly<z.output<typeof CourseEnrollmentAttendanceSummarySchema>>;
export declare function validateCourseEnrollmentAttendanceSummary(summary: CourseEnrollmentAttendanceSummary, courseDayCount: number, context: z.RefinementCtx, basePath?: (string | number)[]): void;
export declare function attendanceSummaryIsDerivedProjection(summary: CourseEnrollmentAttendanceSummary | undefined): boolean;
export declare const CourseEnrollmentSchema: z.ZodObject<{
    enrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
    originalCourseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
    attribution: z.ZodObject<{
        bookingOrigin: z.ZodEnum<{
            admin: "admin";
            account: "account";
            instructor: "instructor";
            guest: "guest";
        }>;
        bookedBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"account">;
            accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"guest">;
            guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"guest_subject">, string>>;
        }, z.core.$strict>], "kind">;
    }, z.core.$strict>;
    lifecycle: z.ZodDiscriminatedUnion<[z.ZodObject<{
        status: z.ZodLiteral<"pending">;
        reservationExpiresAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"confirmed">;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"pending_cancellation">;
        requestedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"cancelled">;
        cancelledAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        reasonCode: z.ZodEnum<{
            reservation_expired: "reservation_expired";
            guest_cancelled: "guest_cancelled";
            account_owner_cancelled: "account_owner_cancelled";
            administrator_cancelled: "administrator_cancelled";
            incomplete_payment: "incomplete_payment";
            system_expired: "system_expired";
        }>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"withdrawn">;
        withdrawnAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"completed">;
        completedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"no_show">;
        noShowAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>], "status">;
    paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"payment">, string>>;
    payerAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>>;
    attendanceSummary: z.ZodOptional<z.ZodObject<{
        recordedDayCount: z.ZodNumber;
        presentDayCount: z.ZodNumber;
        absentDayCount: z.ZodNumber;
        projectionRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    }, z.core.$strict>>;
    guestAccountLink: z.ZodOptional<z.ZodObject<{
        linkedAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        linkedParticipantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
        credentialNonce: z.ZodString;
        linkedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>>;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type CourseEnrollment = Readonly<z.output<typeof CourseEnrollmentSchema>>;
export declare const StructuredCourseDeliverySchema: z.ZodObject<{
    course: z.ZodObject<{
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
        title: z.ZodString;
        price: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").KztMinorUnits, number>>;
        capacity: z.ZodObject<{
            totalSeats: z.ZodNumber;
            availableSeats: z.ZodNumber;
        }, z.core.$strict>;
        instructorRosterIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>>;
        startAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        scheduleProjection: z.ZodObject<{
            courseDayCount: z.ZodNumber;
            finalCourseDayEndsAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
            courseScheduleRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        }, z.core.$strict>;
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        audit: z.ZodObject<{
            createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
        }, z.core.$strict>;
    }, z.core.$strict>;
    courseDays: z.ZodArray<z.ZodObject<{
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
        courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_day">, string>>;
        dayOrder: z.ZodNumber;
        interval: z.ZodObject<{
            startsAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
            endsAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>;
        timeZone: z.ZodString;
        actualInstructorIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>>;
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        audit: z.ZodObject<{
            createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
        }, z.core.$strict>;
    }, z.core.$strict>>;
    enrollment: z.ZodOptional<z.ZodObject<{
        enrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
        originalCourseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
        attribution: z.ZodObject<{
            bookingOrigin: z.ZodEnum<{
                admin: "admin";
                account: "account";
                instructor: "instructor";
                guest: "guest";
            }>;
            bookedBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"account">;
                accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"guest">;
                guestSubjectId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"guest_subject">, string>>;
            }, z.core.$strict>], "kind">;
        }, z.core.$strict>;
        lifecycle: z.ZodDiscriminatedUnion<[z.ZodObject<{
            status: z.ZodLiteral<"pending">;
            reservationExpiresAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            status: z.ZodLiteral<"confirmed">;
        }, z.core.$strict>, z.ZodObject<{
            status: z.ZodLiteral<"pending_cancellation">;
            requestedAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            status: z.ZodLiteral<"cancelled">;
            cancelledAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
            reasonCode: z.ZodEnum<{
                reservation_expired: "reservation_expired";
                guest_cancelled: "guest_cancelled";
                account_owner_cancelled: "account_owner_cancelled";
                administrator_cancelled: "administrator_cancelled";
                incomplete_payment: "incomplete_payment";
                system_expired: "system_expired";
            }>;
        }, z.core.$strict>, z.ZodObject<{
            status: z.ZodLiteral<"withdrawn">;
            withdrawnAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            status: z.ZodLiteral<"completed">;
            completedAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>, z.ZodObject<{
            status: z.ZodLiteral<"no_show">;
            noShowAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>], "status">;
        paymentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"payment">, string>>;
        payerAccountId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>>;
        attendanceSummary: z.ZodOptional<z.ZodObject<{
            recordedDayCount: z.ZodNumber;
            presentDayCount: z.ZodNumber;
            absentDayCount: z.ZodNumber;
            projectionRevision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        }, z.core.$strict>>;
        guestAccountLink: z.ZodOptional<z.ZodObject<{
            linkedAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
            linkedParticipantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
            credentialNonce: z.ZodString;
            linkedAt: z.ZodObject<{
                seconds: z.ZodNumber;
                nanoseconds: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strict>>;
        revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
        createdAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        updatedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        audit: z.ZodObject<{
            createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
            correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
        }, z.core.$strict>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type StructuredCourseDelivery = Readonly<z.output<typeof StructuredCourseDeliverySchema>>;
export declare function validateCourseEnrollmentOriginLifecycleConsistency(attribution: Readonly<{
    bookingOrigin: ImmutableBookingAttribution['bookingOrigin'];
}>, lifecycle: Readonly<{
    status: CourseEnrollmentLifecycleStatus;
}>, context: z.RefinementCtx): void;
export declare function courseEnrollmentBelongsToExactlyOneParticipant(enrollment: Pick<CourseEnrollment, 'participantId'>): boolean;
export declare function enrollmentIdIsOpaqueAndNotDerivedFromParticipantCoursePair(enrollmentId: CourseEnrollmentId, participantId: ParticipantId, courseId: CourseId): boolean;
export declare function containsLegacyCourseScheduleFields(input: unknown): boolean;
export declare function containsWholeCourseCancellationFields(input: unknown): boolean;
export declare function containsCourseEnrollmentBookingShapeFields(input: unknown): boolean;
export declare const LegacyCourseScheduleShapeSchema: z.ZodObject<{
    dates: z.ZodOptional<z.ZodUnknown>;
    date: z.ZodOptional<z.ZodUnknown>;
    time: z.ZodOptional<z.ZodUnknown>;
    duration: z.ZodOptional<z.ZodUnknown>;
    durationHours: z.ZodOptional<z.ZodUnknown>;
    courseEndsAt: z.ZodOptional<z.ZodUnknown>;
    deliveryDates: z.ZodOptional<z.ZodUnknown>;
    scheduleDates: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strict>;
export declare const WholeCourseCancellationShapeSchema: z.ZodObject<{
    courseCancellationStatus: z.ZodOptional<z.ZodUnknown>;
    wholeCourseCancelled: z.ZodOptional<z.ZodUnknown>;
    wholeCourseCancellation: z.ZodOptional<z.ZodUnknown>;
    cancelEntireCourse: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strict>;
export declare const LegacyCourseEnrollmentBookingShapeSchema: z.ZodObject<{
    bookingId: z.ZodOptional<z.ZodUnknown>;
    party: z.ZodOptional<z.ZodUnknown>;
    occurrence: z.ZodOptional<z.ZodUnknown>;
    instructorId: z.ZodOptional<z.ZodUnknown>;
    userId: z.ZodOptional<z.ZodUnknown>;
    isGuest: z.ZodOptional<z.ZodUnknown>;
    date: z.ZodOptional<z.ZodUnknown>;
    time: z.ZodOptional<z.ZodUnknown>;
    durationHours: z.ZodOptional<z.ZodUnknown>;
    duration: z.ZodOptional<z.ZodUnknown>;
    serviceParticipantIds: z.ZodOptional<z.ZodUnknown>;
    syntheticInstructorId: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strict>;
export declare const ATTENDANCE_STATUSES: readonly ["present", "absent"];
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export declare const AttendanceStatusSchema: z.ZodEnum<{
    present: "present";
    absent: "absent";
}>;
export declare const ATTENDANCE_SUBJECT_KINDS: readonly ["booking", "course_enrollment"];
export type AttendanceSubjectKind = (typeof ATTENDANCE_SUBJECT_KINDS)[number];
export declare const AttendanceSubjectKindSchema: z.ZodEnum<{
    booking: "booking";
    course_enrollment: "course_enrollment";
}>;
export declare const AttendanceRecorderSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"instructor">;
    instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
}, z.core.$strict>, z.ZodObject<{
    kind: z.ZodLiteral<"administrator">;
    accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
}, z.core.$strict>], "kind">;
export type AttendanceRecorder = Readonly<z.output<typeof AttendanceRecorderSchema>>;
export declare const BookingAttendanceSubjectRefSchema: z.ZodObject<{
    subjectKind: z.ZodLiteral<"booking">;
    bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
    occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
}, z.core.$strict>;
export declare const CourseEnrollmentAttendanceSubjectRefSchema: z.ZodObject<{
    subjectKind: z.ZodLiteral<"course_enrollment">;
    enrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
    courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
    courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_day">, string>>;
    occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
}, z.core.$strict>;
export declare const AttendanceSubjectRefSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    subjectKind: z.ZodLiteral<"booking">;
    bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
    occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
}, z.core.$strict>, z.ZodObject<{
    subjectKind: z.ZodLiteral<"course_enrollment">;
    enrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
    courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
    courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_day">, string>>;
    occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
}, z.core.$strict>], "subjectKind">;
export type AttendanceSubjectRef = Readonly<z.output<typeof AttendanceSubjectRefSchema>>;
export declare const ATTENDANCE_IDENTITY_STRATEGY_VERSION: "attendance:v1";
export declare function bookingAttendanceIdentityKey(input: {
    occurrenceId: OccurrenceId;
    participantId: ParticipantId;
}): string;
export declare function courseDayAttendanceIdentityKey(input: {
    enrollmentId: CourseEnrollmentId;
    courseDayId: CourseDayId;
}): string;
export declare const BookingAttendanceIdentityInputSchema: z.ZodObject<{
    strategyVersion: z.ZodLiteral<"attendance:v1">;
    subjectKind: z.ZodLiteral<"booking">;
    occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
    participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
}, z.core.$strict>;
export declare const CourseDayAttendanceIdentityInputSchema: z.ZodObject<{
    strategyVersion: z.ZodLiteral<"attendance:v1">;
    subjectKind: z.ZodLiteral<"course_enrollment">;
    enrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
    courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_day">, string>>;
}, z.core.$strict>;
export type BookingAttendanceIdentityInput = z.output<typeof BookingAttendanceIdentityInputSchema>;
export type CourseDayAttendanceIdentityInput = z.output<typeof CourseDayAttendanceIdentityInputSchema>;
export declare function attendanceIdFromBookingIdentity(input: BookingAttendanceIdentityInput): AttendanceId;
export declare function attendanceIdFromCourseDayIdentity(input: CourseDayAttendanceIdentityInput): AttendanceId;
export declare const AttendanceSchema: z.ZodObject<{
    attendanceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"attendance">, string>>;
    subject: z.ZodDiscriminatedUnion<[z.ZodObject<{
        subjectKind: z.ZodLiteral<"booking">;
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
        occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        subjectKind: z.ZodLiteral<"course_enrollment">;
        enrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
        courseId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course">, string>>;
        courseDayId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_day">, string>>;
        occurrenceId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>;
        participantId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>;
    }, z.core.$strict>], "subjectKind">;
    attendanceStatus: z.ZodEnum<{
        present: "present";
        absent: "absent";
    }>;
    recordedBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"instructor">;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"administrator">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>], "kind">;
    recordedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    lastChangedBy: z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"instructor">;
        instructorId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"instructor">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        kind: z.ZodLiteral<"administrator">;
        accountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>], "kind">;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    causationId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>>;
}, z.core.$strict>;
export type Attendance = Readonly<z.output<typeof AttendanceSchema>>;
export declare const UnknownAttendanceStatusShapeSchema: z.ZodObject<{
    attendanceStatus: z.ZodLiteral<"unknown">;
}, z.core.$strict>;
export declare function missingAttendanceIsDocumentAbsence(): true;
export declare const ADMIN_ISSUE_KINDS: readonly ["missing_attendance", "payment_required_at_start", "unresolved_pending_cancellation", "attendance_payment_conflict", "resource_reconciliation_mismatch", "financial_reconciliation_mismatch", "outcome_correction_required"];
export type AdminIssueKind = (typeof ADMIN_ISSUE_KINDS)[number];
export declare const AdminIssueKindSchema: z.ZodEnum<{
    missing_attendance: "missing_attendance";
    payment_required_at_start: "payment_required_at_start";
    unresolved_pending_cancellation: "unresolved_pending_cancellation";
    attendance_payment_conflict: "attendance_payment_conflict";
    resource_reconciliation_mismatch: "resource_reconciliation_mismatch";
    financial_reconciliation_mismatch: "financial_reconciliation_mismatch";
    outcome_correction_required: "outcome_correction_required";
}>;
export declare const ADMIN_ISSUE_LIFECYCLE_STATUSES: readonly ["open", "resolved", "dismissed"];
export type AdminIssueLifecycleStatus = (typeof ADMIN_ISSUE_LIFECYCLE_STATUSES)[number];
export declare const AdminIssueLifecycleStatusSchema: z.ZodEnum<{
    open: "open";
    resolved: "resolved";
    dismissed: "dismissed";
}>;
export declare const ADMIN_ISSUE_SEVERITIES: readonly ["normal", "urgent", "critical"];
export type AdminIssueSeverity = (typeof ADMIN_ISSUE_SEVERITIES)[number];
export declare const AdminIssueSeveritySchema: z.ZodEnum<{
    normal: "normal";
    urgent: "urgent";
    critical: "critical";
}>;
export declare const ADMIN_ISSUE_DEDUPE_STRATEGY_VERSION: "issue:v1";
export declare const AdminIssueReconciliationScopeSchema: z.ZodString;
export declare const AdminIssueSubjectRefSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    subjectKind: z.ZodLiteral<"booking">;
    bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
}, z.core.$strict>, z.ZodObject<{
    subjectKind: z.ZodLiteral<"course_enrollment">;
    enrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
}, z.core.$strict>], "subjectKind">;
export type AdminIssueSubjectRef = Readonly<z.output<typeof AdminIssueSubjectRefSchema>>;
export declare const AdminIssueDedupeIdentityInputSchema: z.ZodObject<{
    strategyVersion: z.ZodLiteral<"issue:v1">;
    kind: z.ZodEnum<{
        missing_attendance: "missing_attendance";
        payment_required_at_start: "payment_required_at_start";
        unresolved_pending_cancellation: "unresolved_pending_cancellation";
        attendance_payment_conflict: "attendance_payment_conflict";
        resource_reconciliation_mismatch: "resource_reconciliation_mismatch";
        financial_reconciliation_mismatch: "financial_reconciliation_mismatch";
        outcome_correction_required: "outcome_correction_required";
    }>;
    subjectKind: z.ZodEnum<{
        booking: "booking";
        course_enrollment: "course_enrollment";
    }>;
    subjectId: z.ZodUnion<readonly [z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>, z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>]>;
    occurrenceId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>>;
    participantId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>>;
    courseDayId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_day">, string>>>;
    scheduleRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>>;
    reconciliationScope: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export type AdminIssueDedupeIdentityInput = z.output<typeof AdminIssueDedupeIdentityInputSchema>;
export declare function adminIssueDedupeIdentityFromRecord(issue: Readonly<{
    kind: AdminIssueKind;
    subjectRef: AdminIssueSubjectRef;
    occurrenceId?: OccurrenceId;
    participantId?: ParticipantId;
    courseDayId?: CourseDayId;
    scheduleRevision?: z.output<typeof PersistedAggregateRevisionSchema>;
    reconciliationScope?: z.output<typeof AdminIssueReconciliationScopeSchema>;
}>): AdminIssueDedupeIdentityInput;
export declare function adminIssueDedupeKeyFromIdentity(input: AdminIssueDedupeIdentityInput): AdminIssueDedupeKey;
export declare function adminIssueIdFromDedupeKey(dedupeKey: AdminIssueDedupeKey): AdminIssueId;
declare const AdminIssueLifecycleSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    status: z.ZodLiteral<"open">;
    openedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    lastDetectedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    reopenedAt: z.ZodOptional<z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"resolved">;
    openedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    lastDetectedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    reopenedAt: z.ZodOptional<z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>>;
    resolvedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    resolution: z.ZodObject<{
        reason: z.ZodString;
        resolvedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>;
}, z.core.$strict>, z.ZodObject<{
    status: z.ZodLiteral<"dismissed">;
    openedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    lastDetectedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    reopenedAt: z.ZodOptional<z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>>;
    resolvedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    resolution: z.ZodObject<{
        reason: z.ZodString;
        resolvedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
    }, z.core.$strict>;
}, z.core.$strict>], "status">;
export type AdminIssueLifecycle = Readonly<z.output<typeof AdminIssueLifecycleSchema>>;
export declare const AdminIssueSchema: z.ZodObject<{
    issueId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"admin_issue">, string>>;
    kind: z.ZodEnum<{
        missing_attendance: "missing_attendance";
        payment_required_at_start: "payment_required_at_start";
        unresolved_pending_cancellation: "unresolved_pending_cancellation";
        attendance_payment_conflict: "attendance_payment_conflict";
        resource_reconciliation_mismatch: "resource_reconciliation_mismatch";
        financial_reconciliation_mismatch: "financial_reconciliation_mismatch";
        outcome_correction_required: "outcome_correction_required";
    }>;
    subjectRef: z.ZodDiscriminatedUnion<[z.ZodObject<{
        subjectKind: z.ZodLiteral<"booking">;
        bookingId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"booking">, string>>;
    }, z.core.$strict>, z.ZodObject<{
        subjectKind: z.ZodLiteral<"course_enrollment">;
        enrollmentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_enrollment">, string>>;
    }, z.core.$strict>], "subjectKind">;
    occurrenceId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"occurrence">, string>>>;
    participantId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"participant">, string>>>;
    courseDayId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"course_day">, string>>>;
    scheduleRevision: z.ZodOptional<z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>>;
    reconciliationScope: z.ZodOptional<z.ZodString>;
    lifecycle: z.ZodDiscriminatedUnion<[z.ZodObject<{
        status: z.ZodLiteral<"open">;
        openedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        lastDetectedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        reopenedAt: z.ZodOptional<z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"resolved">;
        openedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        lastDetectedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        reopenedAt: z.ZodOptional<z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>>;
        resolvedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        resolution: z.ZodObject<{
            reason: z.ZodString;
            resolvedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        }, z.core.$strict>;
    }, z.core.$strict>, z.ZodObject<{
        status: z.ZodLiteral<"dismissed">;
        openedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        lastDetectedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        reopenedAt: z.ZodOptional<z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>>;
        resolvedAt: z.ZodObject<{
            seconds: z.ZodNumber;
            nanoseconds: z.ZodNumber;
        }, z.core.$strict>;
        resolution: z.ZodObject<{
            reason: z.ZodString;
            resolvedByAccountId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>;
        }, z.core.$strict>;
    }, z.core.$strict>], "status">;
    severity: z.ZodEnum<{
        normal: "normal";
        urgent: "urgent";
        critical: "critical";
    }>;
    blocksOutcome: z.ZodBoolean;
    blocksDelivery: z.ZodBoolean;
    dedupeKey: z.ZodPipe<z.ZodString, z.ZodTransform<AdminIssueDedupeKey, string>>;
    assignedTo: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"account">, string>>>;
    revision: z.ZodPipe<z.ZodNumber, z.ZodTransform<import("./primitives").AggregateRevision, number>>;
    correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    causationId: z.ZodOptional<z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>>;
    createdAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    updatedAt: z.ZodObject<{
        seconds: z.ZodNumber;
        nanoseconds: z.ZodNumber;
    }, z.core.$strict>;
    audit: z.ZodObject<{
        createdByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        lastChangedByCommandId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"command">, string>>;
        correlationId: z.ZodPipe<z.ZodString, z.ZodTransform<import("./identifiers").CanonicalId<"correlation">, string>>;
    }, z.core.$strict>;
}, z.core.$strict>;
export type AdminIssue = Readonly<z.output<typeof AdminIssueSchema>>;
export declare function adminIssueLifecycleIsOperationalState(issue: Pick<AdminIssue, 'lifecycle'>): boolean;
export declare function attendanceIsFactualEvidence(attendance: Pick<Attendance, 'attendanceStatus'>): boolean;
export declare function adminIssueSubjectReference(subjectRef: AdminIssueSubjectRef): CanonicalReference;
export {};
