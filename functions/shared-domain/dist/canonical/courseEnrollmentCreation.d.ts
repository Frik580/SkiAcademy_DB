import type { Course, CourseDay } from './courseEnrollmentAttendanceAdminIssue';
import type { CommandId, CourseEnrollmentId, OccurrenceId, ParticipantId } from './identifiers';
import { type CanonicalTimestamp, type TimeInterval } from './primitives';
/** Maximum guest Course enrollment reservation hold before course start. */
export declare const GUEST_COURSE_RESERVATION_TTL_MS: number;
export declare function resolveGuestCourseReservationExpiresAt(input: {
    readonly createdAt: CanonicalTimestamp;
    readonly courseStartsAt: CanonicalTimestamp;
}): CanonicalTimestamp;
export declare function isCourseEnrollmentAllowedBeforeStart(input: {
    readonly now: CanonicalTimestamp;
    readonly courseStartsAt: CanonicalTimestamp;
}): boolean;
export declare function assertUniqueEnrollmentParticipantIds(participantIds: readonly ParticipantId[]): void;
export declare function resolveEnrollmentIdsForCommand(input: {
    readonly commandId: CommandId;
    readonly participantIds: readonly ParticipantId[];
}): readonly CourseEnrollmentId[];
export declare function courseSeatClaimInterval(input: {
    readonly decidedAt: CanonicalTimestamp;
    readonly course: Course;
}): TimeInterval;
export declare function buildCourseSeatClaimIdentity(input: {
    readonly courseId: Course['courseId'];
    readonly enrollmentId: CourseEnrollmentId;
    readonly occurrenceId: OccurrenceId;
}): {
    identity: {
        strategyVersion: "claim:v1";
        claimKind: "instructor_booking_occurrence" | "participant_booking_occurrence" | "instructor_course_day" | "participant_course_day_enrollment" | "course_seat_pre_start" | "administrative_availability_block";
        resourceKind: "instructor" | "participant" | "course" | "administrative_block";
        resourceId: string;
        ownerKind: "booking" | "course_day" | "course_enrollment" | "administrative_block";
        ownerId: string;
        occurrenceId: import("./identifiers").CanonicalId<"occurrence">;
    };
    claimId: import("./identifiers").CanonicalId<"resource_claim">;
};
export declare function buildParticipantCourseDayEnrollmentClaimIdentity(input: {
    readonly participantId: ParticipantId;
    readonly enrollmentId: CourseEnrollmentId;
    readonly courseDay: CourseDay;
}): {
    identity: {
        strategyVersion: "claim:v1";
        claimKind: "instructor_booking_occurrence" | "participant_booking_occurrence" | "instructor_course_day" | "participant_course_day_enrollment" | "course_seat_pre_start" | "administrative_availability_block";
        resourceKind: "instructor" | "participant" | "course" | "administrative_block";
        resourceId: string;
        ownerKind: "booking" | "course_day" | "course_enrollment" | "administrative_block";
        ownerId: string;
        occurrenceId: import("./identifiers").CanonicalId<"occurrence">;
    };
    claimId: import("./identifiers").CanonicalId<"resource_claim">;
    occurrenceId: import("./identifiers").CanonicalId<"occurrence">;
};
export declare function sortedCourseDays(courseDays: readonly CourseDay[]): CourseDay[];
export declare function courseScheduleIsComplete(course: Course, courseDays: readonly CourseDay[]): boolean;
