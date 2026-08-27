import { type AdminIssue, type AdminIssueDedupeIdentityInput, type Attendance, type Course, type CourseDay, type CourseEnrollment } from './courseEnrollmentAttendanceAdminIssue';
import type { CourseDayId } from './identifiers';
import { type CourseEnrollmentOutcomeCalculatorDecision } from './courseEnrollmentAttendancePolicy';
import { type Payment } from './paymentWallet';
import type { CourseEnrollmentId } from './identifiers';
import type { CanonicalTimestamp } from './primitives';
export declare const COURSE_ENROLLMENT_RESOURCE_RECONCILIATION_SCOPE: "course_enrollment_resources";
export type CourseEnrollmentReconciliationIssueKind = 'payment_required_at_start' | 'attendance_payment_conflict' | 'missing_attendance';
export interface CourseEnrollmentReconciliationIssueResolution {
    readonly kind: CourseEnrollmentReconciliationIssueKind;
    readonly identity: AdminIssueDedupeIdentityInput;
    readonly reason: string;
}
export type CourseEnrollmentReconciliationDecision = {
    readonly outcome: 'no_repair_terminal_lifecycle';
    readonly openResourceReconciliationMismatch: boolean;
} | {
    readonly outcome: 'no_repair_pending_cancellation';
} | {
    readonly outcome: 'repair';
    readonly issueResolutions: readonly CourseEnrollmentReconciliationIssueResolution[];
    readonly outcomeDecision: CourseEnrollmentOutcomeCalculatorDecision;
    readonly openResourceReconciliationMismatch: boolean;
};
export declare function courseEnrollmentResourceReconciliationMismatchIdentity(input: {
    readonly enrollmentId: CourseEnrollmentId;
}): AdminIssueDedupeIdentityInput;
export declare function shouldResolveStalePaymentRequiredAtStartIssue(input: {
    readonly enrollment: CourseEnrollment;
    readonly course: Course;
    readonly payment: Payment;
    readonly issue: AdminIssue;
}): boolean;
export declare function shouldResolveStaleAttendancePaymentConflictIssue(input: {
    readonly enrollment: CourseEnrollment;
    readonly course: Course;
    readonly payment: Payment;
    readonly issue: AdminIssue;
    readonly paymentRequiredAtStartStillOpen: boolean;
    readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
}): boolean;
export declare function shouldResolveStaleMissingAttendanceIssue(input: {
    readonly enrollment: CourseEnrollment;
    readonly course: Course;
    readonly issue: AdminIssue;
    readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
    readonly courseDays: readonly CourseDay[];
}): boolean;
export declare function evaluateCourseEnrollmentReconciliation(input: {
    readonly now: CanonicalTimestamp;
    readonly enrollment: CourseEnrollment;
    readonly course: Course;
    readonly courseDays: readonly CourseDay[];
    readonly payment: Payment;
    readonly attendancesByCourseDayId: ReadonlyMap<CourseDayId, Attendance>;
    readonly openAdminIssues: readonly AdminIssue[];
    readonly automationOnly: boolean;
    readonly terminalEnrollmentHasActiveResourceGuard?: boolean;
}): CourseEnrollmentReconciliationDecision;
export declare function courseEnrollmentReconciliationHasMutations(input: {
    readonly decision: CourseEnrollmentReconciliationDecision;
}): boolean;
