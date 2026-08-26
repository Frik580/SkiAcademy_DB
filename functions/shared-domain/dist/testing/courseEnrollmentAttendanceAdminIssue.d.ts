export declare const canonicalCourseDeliveryFixtures: Readonly<{
    course: {
        courseId: import("../canonical/identifiers").CanonicalId<"course">;
        title: string;
        price: import("../canonical/primitives").KztMinorUnits;
        capacity: {
            totalSeats: number;
            availableSeats: number;
        };
        instructorRosterIds: import("../canonical/identifiers").CanonicalId<"instructor">[];
        startAt: {
            seconds: number;
            nanoseconds: number;
        };
        scheduleProjection: {
            courseDayCount: number;
            finalCourseDayEndsAt: {
                seconds: number;
                nanoseconds: number;
            };
            courseScheduleRevision: import("../canonical/primitives").AggregateRevision;
        };
        revision: import("../canonical/primitives").AggregateRevision;
        createdAt: {
            seconds: number;
            nanoseconds: number;
        };
        updatedAt: {
            seconds: number;
            nanoseconds: number;
        };
        audit: {
            createdByCommandId: import("../canonical/identifiers").CanonicalId<"command">;
            lastChangedByCommandId: import("../canonical/identifiers").CanonicalId<"command">;
            correlationId: import("../canonical/identifiers").CanonicalId<"correlation">;
        };
    };
    courseDays: readonly [{
        courseId: import("../canonical/identifiers").CanonicalId<"course">;
        courseDayId: import("../canonical/identifiers").CanonicalId<"course_day">;
        dayOrder: number;
        interval: {
            startsAt: {
                seconds: number;
                nanoseconds: number;
            };
            endsAt: {
                seconds: number;
                nanoseconds: number;
            };
        };
        timeZone: string;
        actualInstructorIds: import("../canonical/identifiers").CanonicalId<"instructor">[];
        revision: import("../canonical/primitives").AggregateRevision;
        createdAt: {
            seconds: number;
            nanoseconds: number;
        };
        updatedAt: {
            seconds: number;
            nanoseconds: number;
        };
        audit: {
            createdByCommandId: import("../canonical/identifiers").CanonicalId<"command">;
            lastChangedByCommandId: import("../canonical/identifiers").CanonicalId<"command">;
            correlationId: import("../canonical/identifiers").CanonicalId<"correlation">;
        };
    }, {
        courseId: import("../canonical/identifiers").CanonicalId<"course">;
        courseDayId: import("../canonical/identifiers").CanonicalId<"course_day">;
        dayOrder: number;
        interval: {
            startsAt: {
                seconds: number;
                nanoseconds: number;
            };
            endsAt: {
                seconds: number;
                nanoseconds: number;
            };
        };
        timeZone: string;
        actualInstructorIds: import("../canonical/identifiers").CanonicalId<"instructor">[];
        revision: import("../canonical/primitives").AggregateRevision;
        createdAt: {
            seconds: number;
            nanoseconds: number;
        };
        updatedAt: {
            seconds: number;
            nanoseconds: number;
        };
        audit: {
            createdByCommandId: import("../canonical/identifiers").CanonicalId<"command">;
            lastChangedByCommandId: import("../canonical/identifiers").CanonicalId<"command">;
            correlationId: import("../canonical/identifiers").CanonicalId<"correlation">;
        };
    }];
    confirmedEnrollment: {
        enrollmentId: import("../canonical/identifiers").CanonicalId<"course_enrollment">;
        participantId: import("../canonical/identifiers").CanonicalId<"participant">;
        courseId: import("../canonical/identifiers").CanonicalId<"course">;
        originalCourseId: import("../canonical/identifiers").CanonicalId<"course">;
        attribution: {
            bookingOrigin: "admin" | "account" | "instructor" | "guest";
            bookedBy: {
                kind: "account";
                accountId: import("../canonical/identifiers").CanonicalId<"account">;
            } | {
                kind: "guest";
                guestSubjectId: import("../canonical/identifiers").CanonicalId<"guest_subject">;
            };
        };
        lifecycle: {
            status: "pending";
            reservationExpiresAt: {
                seconds: number;
                nanoseconds: number;
            };
        } | {
            status: "confirmed";
        } | {
            status: "pending_cancellation";
            requestedAt: {
                seconds: number;
                nanoseconds: number;
            };
        } | {
            status: "cancelled";
            cancelledAt: {
                seconds: number;
                nanoseconds: number;
            };
            reasonCode: "reservation_expired" | "guest_cancelled" | "account_owner_cancelled" | "administrator_cancelled" | "incomplete_payment" | "system_expired";
        } | {
            status: "withdrawn";
            withdrawnAt: {
                seconds: number;
                nanoseconds: number;
            };
        } | {
            status: "completed";
            completedAt: {
                seconds: number;
                nanoseconds: number;
            };
        } | {
            status: "no_show";
            noShowAt: {
                seconds: number;
                nanoseconds: number;
            };
        };
        paymentId: import("../canonical/identifiers").CanonicalId<"payment">;
        revision: import("../canonical/primitives").AggregateRevision;
        createdAt: {
            seconds: number;
            nanoseconds: number;
        };
        updatedAt: {
            seconds: number;
            nanoseconds: number;
        };
        audit: {
            createdByCommandId: import("../canonical/identifiers").CanonicalId<"command">;
            lastChangedByCommandId: import("../canonical/identifiers").CanonicalId<"command">;
            correlationId: import("../canonical/identifiers").CanonicalId<"correlation">;
        };
        payerAccountId?: import("../canonical/identifiers").CanonicalId<"account"> | undefined;
        attendanceSummary?: {
            recordedDayCount: number;
            presentDayCount: number;
            absentDayCount: number;
            projectionRevision: import("../canonical/primitives").AggregateRevision;
        } | undefined;
    };
    guestPendingEnrollment: {
        enrollmentId: import("../canonical/identifiers").CanonicalId<"course_enrollment">;
        participantId: import("../canonical/identifiers").CanonicalId<"participant">;
        courseId: import("../canonical/identifiers").CanonicalId<"course">;
        originalCourseId: import("../canonical/identifiers").CanonicalId<"course">;
        attribution: {
            bookingOrigin: "admin" | "account" | "instructor" | "guest";
            bookedBy: {
                kind: "account";
                accountId: import("../canonical/identifiers").CanonicalId<"account">;
            } | {
                kind: "guest";
                guestSubjectId: import("../canonical/identifiers").CanonicalId<"guest_subject">;
            };
        };
        lifecycle: {
            status: "pending";
            reservationExpiresAt: {
                seconds: number;
                nanoseconds: number;
            };
        } | {
            status: "confirmed";
        } | {
            status: "pending_cancellation";
            requestedAt: {
                seconds: number;
                nanoseconds: number;
            };
        } | {
            status: "cancelled";
            cancelledAt: {
                seconds: number;
                nanoseconds: number;
            };
            reasonCode: "reservation_expired" | "guest_cancelled" | "account_owner_cancelled" | "administrator_cancelled" | "incomplete_payment" | "system_expired";
        } | {
            status: "withdrawn";
            withdrawnAt: {
                seconds: number;
                nanoseconds: number;
            };
        } | {
            status: "completed";
            completedAt: {
                seconds: number;
                nanoseconds: number;
            };
        } | {
            status: "no_show";
            noShowAt: {
                seconds: number;
                nanoseconds: number;
            };
        };
        paymentId: import("../canonical/identifiers").CanonicalId<"payment">;
        revision: import("../canonical/primitives").AggregateRevision;
        createdAt: {
            seconds: number;
            nanoseconds: number;
        };
        updatedAt: {
            seconds: number;
            nanoseconds: number;
        };
        audit: {
            createdByCommandId: import("../canonical/identifiers").CanonicalId<"command">;
            lastChangedByCommandId: import("../canonical/identifiers").CanonicalId<"command">;
            correlationId: import("../canonical/identifiers").CanonicalId<"correlation">;
        };
        payerAccountId?: import("../canonical/identifiers").CanonicalId<"account"> | undefined;
        attendanceSummary?: {
            recordedDayCount: number;
            presentDayCount: number;
            absentDayCount: number;
            projectionRevision: import("../canonical/primitives").AggregateRevision;
        } | undefined;
    };
    presentBookingAttendance: {
        attendanceId: import("../canonical/identifiers").CanonicalId<"attendance">;
        subject: {
            subjectKind: "booking";
            bookingId: import("../canonical/identifiers").CanonicalId<"booking">;
            occurrenceId: import("../canonical/identifiers").CanonicalId<"occurrence">;
            participantId: import("../canonical/identifiers").CanonicalId<"participant">;
        } | {
            subjectKind: "course_enrollment";
            enrollmentId: import("../canonical/identifiers").CanonicalId<"course_enrollment">;
            courseId: import("../canonical/identifiers").CanonicalId<"course">;
            courseDayId: import("../canonical/identifiers").CanonicalId<"course_day">;
            occurrenceId: import("../canonical/identifiers").CanonicalId<"occurrence">;
            participantId: import("../canonical/identifiers").CanonicalId<"participant">;
        };
        attendanceStatus: "present" | "absent";
        recordedBy: {
            kind: "instructor";
            instructorId: import("../canonical/identifiers").CanonicalId<"instructor">;
        } | {
            kind: "administrator";
            accountId: import("../canonical/identifiers").CanonicalId<"account">;
        };
        recordedAt: {
            seconds: number;
            nanoseconds: number;
        };
        lastChangedBy: {
            kind: "instructor";
            instructorId: import("../canonical/identifiers").CanonicalId<"instructor">;
        } | {
            kind: "administrator";
            accountId: import("../canonical/identifiers").CanonicalId<"account">;
        };
        updatedAt: {
            seconds: number;
            nanoseconds: number;
        };
        revision: import("../canonical/primitives").AggregateRevision;
        correlationId: import("../canonical/identifiers").CanonicalId<"correlation">;
        causationId?: import("../canonical/identifiers").CanonicalId<"command"> | undefined;
    };
    presentCourseDayAttendance: {
        attendanceId: import("../canonical/identifiers").CanonicalId<"attendance">;
        subject: {
            subjectKind: "booking";
            bookingId: import("../canonical/identifiers").CanonicalId<"booking">;
            occurrenceId: import("../canonical/identifiers").CanonicalId<"occurrence">;
            participantId: import("../canonical/identifiers").CanonicalId<"participant">;
        } | {
            subjectKind: "course_enrollment";
            enrollmentId: import("../canonical/identifiers").CanonicalId<"course_enrollment">;
            courseId: import("../canonical/identifiers").CanonicalId<"course">;
            courseDayId: import("../canonical/identifiers").CanonicalId<"course_day">;
            occurrenceId: import("../canonical/identifiers").CanonicalId<"occurrence">;
            participantId: import("../canonical/identifiers").CanonicalId<"participant">;
        };
        attendanceStatus: "present" | "absent";
        recordedBy: {
            kind: "instructor";
            instructorId: import("../canonical/identifiers").CanonicalId<"instructor">;
        } | {
            kind: "administrator";
            accountId: import("../canonical/identifiers").CanonicalId<"account">;
        };
        recordedAt: {
            seconds: number;
            nanoseconds: number;
        };
        lastChangedBy: {
            kind: "instructor";
            instructorId: import("../canonical/identifiers").CanonicalId<"instructor">;
        } | {
            kind: "administrator";
            accountId: import("../canonical/identifiers").CanonicalId<"account">;
        };
        updatedAt: {
            seconds: number;
            nanoseconds: number;
        };
        revision: import("../canonical/primitives").AggregateRevision;
        correlationId: import("../canonical/identifiers").CanonicalId<"correlation">;
        causationId?: import("../canonical/identifiers").CanonicalId<"command"> | undefined;
    };
    openAdminIssue: {
        issueId: import("../canonical/identifiers").CanonicalId<"admin_issue">;
        kind: "missing_attendance" | "payment_required_at_start" | "unresolved_pending_cancellation" | "attendance_payment_conflict" | "resource_reconciliation_mismatch" | "financial_reconciliation_mismatch" | "outcome_correction_required";
        subjectRef: {
            subjectKind: "booking";
            bookingId: import("../canonical/identifiers").CanonicalId<"booking">;
        } | {
            subjectKind: "course_enrollment";
            enrollmentId: import("../canonical/identifiers").CanonicalId<"course_enrollment">;
        };
        lifecycle: {
            status: "open";
            openedAt: {
                seconds: number;
                nanoseconds: number;
            };
            lastDetectedAt: {
                seconds: number;
                nanoseconds: number;
            };
            reopenedAt?: {
                seconds: number;
                nanoseconds: number;
            } | undefined;
        } | {
            status: "resolved";
            openedAt: {
                seconds: number;
                nanoseconds: number;
            };
            lastDetectedAt: {
                seconds: number;
                nanoseconds: number;
            };
            resolvedAt: {
                seconds: number;
                nanoseconds: number;
            };
            resolution: {
                reason: string;
                resolvedByAccountId: import("../canonical/identifiers").CanonicalId<"account">;
            };
            reopenedAt?: {
                seconds: number;
                nanoseconds: number;
            } | undefined;
        } | {
            status: "dismissed";
            openedAt: {
                seconds: number;
                nanoseconds: number;
            };
            lastDetectedAt: {
                seconds: number;
                nanoseconds: number;
            };
            resolvedAt: {
                seconds: number;
                nanoseconds: number;
            };
            resolution: {
                reason: string;
                resolvedByAccountId: import("../canonical/identifiers").CanonicalId<"account">;
            };
            reopenedAt?: {
                seconds: number;
                nanoseconds: number;
            } | undefined;
        };
        severity: "normal" | "urgent" | "critical";
        blocksOutcome: boolean;
        blocksDelivery: boolean;
        dedupeKey: import("../canonical/courseEnrollmentAttendanceAdminIssue").AdminIssueDedupeKey;
        revision: import("../canonical/primitives").AggregateRevision;
        correlationId: import("../canonical/identifiers").CanonicalId<"correlation">;
        createdAt: {
            seconds: number;
            nanoseconds: number;
        };
        updatedAt: {
            seconds: number;
            nanoseconds: number;
        };
        audit: {
            createdByCommandId: import("../canonical/identifiers").CanonicalId<"command">;
            lastChangedByCommandId: import("../canonical/identifiers").CanonicalId<"command">;
            correlationId: import("../canonical/identifiers").CanonicalId<"correlation">;
        };
        occurrenceId?: import("../canonical/identifiers").CanonicalId<"occurrence"> | undefined;
        participantId?: import("../canonical/identifiers").CanonicalId<"participant"> | undefined;
        courseDayId?: import("../canonical/identifiers").CanonicalId<"course_day"> | undefined;
        scheduleRevision?: import("../canonical/primitives").AggregateRevision | undefined;
        reconciliationScope?: string | undefined;
        assignedTo?: import("../canonical/identifiers").CanonicalId<"account"> | undefined;
        causationId?: import("../canonical/identifiers").CanonicalId<"command"> | undefined;
    };
    dedupeKey: import("../canonical/courseEnrollmentAttendanceAdminIssue").AdminIssueDedupeKey;
}>;
