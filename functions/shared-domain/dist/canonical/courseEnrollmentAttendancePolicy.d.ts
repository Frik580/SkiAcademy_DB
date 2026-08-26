import { type AdminIssue, type Attendance, type AttendanceStatus, type Course, type CourseDay, type CourseEnrollment, type CourseEnrollmentAttendanceSummary } from './courseEnrollmentAttendanceAdminIssue';
import { BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS, instructorMayCorrectAttendance } from './bookingAttendancePolicy';
import type { CourseDayId, CourseEnrollmentId, InstructorId, OccurrenceId, ParticipantId } from './identifiers';
import { type CanonicalTimestamp } from './primitives';
export { BOOKING_INSTRUCTOR_ATTENDANCE_WINDOW_MS as COURSE_DAY_INSTRUCTOR_ATTENDANCE_WINDOW_MS };
export type CourseEnrollmentOutcomeEligibilityDecision = 'not_yet_eligible' | 'eligible';
export type CourseEnrollmentAttendanceSufficiencyOutcome = 'completed' | 'no_show' | 'missing_attendance';
export type CourseEnrollmentOutcomeCalculatorDecision = {
    readonly outcome: 'not_yet_eligible';
} | {
    readonly outcome: 'blocked_pending_cancellation';
} | {
    readonly outcome: 'blocked_terminal_lifecycle';
} | {
    readonly outcome: 'blocked_outcome_issue';
    readonly issueKind: AdminIssue['kind'];
} | {
    readonly outcome: 'resolve';
    readonly lifecycle: 'completed' | 'no_show';
} | {
    readonly outcome: 'unresolved';
    readonly issueKind: 'missing_attendance';
    readonly missingCourseDayIds: readonly CourseDayId[];
};
export declare function courseDayInstructorAttendanceWindowEnd(endsAt: CanonicalTimestamp): CanonicalTimestamp;
export declare function evaluateCourseEnrollmentOutcomeEligibility(input: {
    readonly now: CanonicalTimestamp;
    readonly finalCourseDayEndsAt: CanonicalTimestamp;
}): CourseEnrollmentOutcomeEligibilityDecision;
export declare function evaluateCourseEnrollmentAutomationEligibility(input: {
    readonly now: CanonicalTimestamp;
    readonly finalCourseDayEndsAt: CanonicalTimestamp;
}): CourseEnrollmentOutcomeEligibilityDecision;
export declare function deriveCourseEnrollmentAttendanceSufficiency(input: {
    readonly courseDayCount: number;
    readonly attendanceSummary: CourseEnrollmentAttendanceSummary | undefined;
}): CourseEnrollmentAttendanceSufficiencyOutcome;
export declare function missingCourseDayAttendanceIssueIdentity(input: {
    readonly enrollmentId: CourseEnrollmentId;
    readonly courseDayId: CourseDayId;
    readonly participantId: ParticipantId;
    readonly occurrenceId: OccurrenceId;
}): import('./courseEnrollmentAttendanceAdminIssue').AdminIssueDedupeIdentityInput;
export declare function courseDayOccurrenceId(courseDay: CourseDay): OccurrenceId;
export declare function findCourseDayForEnrollment(courseDays: readonly CourseDay[], courseDayId: CourseDayId, courseId: Course['courseId']): CourseDay | undefined;
export declare function instructorAssignedToCourseDay(courseDay: CourseDay, instructorId: InstructorId): boolean;
export declare function applyAttendanceSummaryDelta(input: {
    readonly existing: CourseEnrollmentAttendanceSummary | undefined;
    readonly previousStatus: AttendanceStatus | undefined;
    readonly nextStatus: AttendanceStatus;
}): CourseEnrollmentAttendanceSummary;
export declare function courseDayAttendanceMatchesCurrentOccurrence(attendance: Attendance, courseDay: CourseDay): boolean;
export declare function buildCourseEnrollmentAttendanceSummaryFromCurrentEvidence(input: {
    readonly courseDays: readonly CourseDay[];
    readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
}): CourseEnrollmentAttendanceSummary;
export declare function resolveMissingCourseDayIds(input: {
    readonly courseDays: readonly CourseDay[];
    readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
}): readonly CourseDayId[];
export declare function evaluateCourseEnrollmentOutcomeCalculator(input: {
    readonly now: CanonicalTimestamp;
    readonly enrollment: CourseEnrollment;
    readonly course: Course;
    readonly courseDays: readonly CourseDay[];
    readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
    readonly openAdminIssues: readonly AdminIssue[];
    readonly automationOnly: boolean;
}): CourseEnrollmentOutcomeCalculatorDecision;
export declare function attendanceCorrectionWouldContradictTerminalOutcome(input: {
    readonly enrollment: CourseEnrollment;
    readonly nextStatus: AttendanceStatus;
}): boolean;
export declare function assertCourseDayInstructorAttendanceWindow(input: {
    readonly now: CanonicalTimestamp;
    readonly courseDay: CourseDay;
}): 'before_start' | 'in_window' | 'after_instructor_window';
export { instructorMayCorrectAttendance };
