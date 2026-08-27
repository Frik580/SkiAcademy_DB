import { type AdminIssue, type AdminIssueDedupeIdentityInput, type AdminIssueKind, type AdminIssueSeverity } from './courseEnrollmentAttendanceAdminIssue';
import type { AccountId, BookingId, CorrelationId, CourseEnrollmentId, OccurrenceId } from './identifiers';
import { type Payment } from './paymentWallet';
import { type CanonicalTimestamp } from './primitives';
import type { Booking } from './bookingOccurrenceProposalChange';
import type { Course, CourseEnrollment } from './courseEnrollmentAttendanceAdminIssue';
import type { CommandActor } from './commands/actors';
import type { ExercisedCapability } from './commands/capabilities';
export declare const PAYMENT_REQUIRED_AT_START_INSTRUCTOR_INSTRUCTION: "Payment required\u2014do not start";
export interface AdminIssueKindPolicy {
    readonly severity: AdminIssueSeverity;
    readonly blocksOutcome: boolean;
    readonly blocksDelivery: boolean;
    readonly allowDismiss: boolean;
    readonly requireCoupledDomainCommandToResolve: boolean;
}
export declare const ADMIN_ISSUE_KIND_POLICIES: Record<AdminIssueKind, AdminIssueKindPolicy>;
export declare function adminIssueKindPolicy(kind: AdminIssueKind): AdminIssueKindPolicy;
export declare function paymentRequiredAtStartIdentity(input: {
    readonly bookingId: BookingId;
    readonly occurrenceId: OccurrenceId;
}): AdminIssueDedupeIdentityInput;
export declare function paymentRequiredAtStartCourseEnrollmentIdentity(input: {
    readonly enrollmentId: CourseEnrollmentId;
    readonly occurrenceId: OccurrenceId;
}): AdminIssueDedupeIdentityInput;
export declare function paymentRequiredAtStartCourseEnrollmentIdentityFromEnrollment(enrollmentId: CourseEnrollmentId): AdminIssueDedupeIdentityInput;
export type PaymentStartGateDecision = {
    readonly outcome: 'too_early';
} | {
    readonly outcome: 'ineligible_terminal';
} | {
    readonly outcome: 'ineligible_not_confirmed';
} | {
    readonly outcome: 'ineligible_not_individual';
} | {
    readonly outcome: 'unsupported_subject';
} | {
    readonly outcome: 'fully_funded';
} | {
    readonly outcome: 'underfunded';
};
export declare function evaluateIndividualBookingPaymentStartGate(input: {
    readonly now: CanonicalTimestamp;
    readonly subjectKind: 'booking' | 'course_enrollment';
    readonly booking?: Booking;
    readonly payment?: Payment;
}): PaymentStartGateDecision;
export declare function evaluateCourseEnrollmentPaymentStartGate(input: {
    readonly now: CanonicalTimestamp;
    readonly enrollment: CourseEnrollment;
    readonly course: Course;
    readonly payment: Payment;
}): PaymentStartGateDecision;
export declare function isCourseEnrollmentPaymentStartRestrictionActive(input: {
    readonly now: CanonicalTimestamp;
    readonly enrollment: CourseEnrollment;
    readonly course: Course;
    readonly payment: Payment;
    readonly openPaymentRequiredAtStartIssue: boolean;
}): boolean;
export declare function assertCourseEnrollmentPaymentIdentity(correlationId: CorrelationId, enrollment: CourseEnrollment, payment: Payment): void;
export declare function assertBookingPaymentIdentity(correlationId: CorrelationId, booking: Booking, payment: Payment): void;
export declare function assertCompatibleAdminIssueIdentity(correlationId: CorrelationId, existing: AdminIssue, identity: AdminIssueDedupeIdentityInput): void;
export interface OpenAdminIssueInput {
    readonly identity: AdminIssueDedupeIdentityInput;
    readonly now: CanonicalTimestamp;
    readonly correlationId: CorrelationId;
    readonly commandId: string;
    readonly causationId?: string;
}
export declare function createOpenAdminIssue(input: OpenAdminIssueInput): AdminIssue;
export declare function reuseOrReopenAdminIssue(existing: AdminIssue, input: OpenAdminIssueInput): AdminIssue;
export interface AdminIssueLifecycleActor {
    readonly actor: CommandActor;
    readonly exercisedCapability: ExercisedCapability;
}
export declare function assertAdministratorMayMutateAdminIssue(correlationId: CorrelationId, actor: AdminIssueLifecycleActor): AccountId;
export interface ResolveOrDismissAdminIssueInput {
    readonly expectedRevision: AdminIssue['revision'];
    readonly now: CanonicalTimestamp;
    readonly correlationId: CorrelationId;
    readonly commandId: string;
    readonly reason: string;
    readonly actor: AdminIssueLifecycleActor;
    readonly coupledDomainCommand: boolean;
}
export interface OwnerWithdrawalUnresolvedPendingCancellationResolutionInput {
    readonly expectedRevision: AdminIssue['revision'];
    readonly now: CanonicalTimestamp;
    readonly correlationId: CorrelationId;
    readonly commandId: string;
    readonly reason: string;
    readonly actor: AdminIssueLifecycleActor;
    readonly bookingId: BookingId;
}
export interface OwnerWithdrawalUnresolvedCourseEnrollmentPendingCancellationResolutionInput {
    readonly expectedRevision: AdminIssue['revision'];
    readonly now: CanonicalTimestamp;
    readonly correlationId: CorrelationId;
    readonly commandId: string;
    readonly reason: string;
    readonly actor: AdminIssueLifecycleActor;
    readonly enrollmentId: CourseEnrollmentId;
}
export declare function resolveAdminIssue(existing: AdminIssue, input: ResolveOrDismissAdminIssueInput): AdminIssue;
export declare function resolveUnresolvedPendingCancellationForOwnerWithdrawal(existing: AdminIssue, input: OwnerWithdrawalUnresolvedPendingCancellationResolutionInput): AdminIssue;
export declare function resolveUnresolvedCourseEnrollmentPendingCancellationForOwnerWithdrawal(existing: AdminIssue, input: OwnerWithdrawalUnresolvedCourseEnrollmentPendingCancellationResolutionInput): AdminIssue;
export declare function dismissAdminIssue(existing: AdminIssue, input: ResolveOrDismissAdminIssueInput): AdminIssue;
export interface SanitizedPaymentStartGateInstructorView {
    readonly restriction: 'payment_required_at_start';
    readonly instruction: typeof PAYMENT_REQUIRED_AT_START_INSTRUCTOR_INSTRUCTION;
    readonly blocksDelivery: true;
}
export declare function sanitizePaymentStartGateForInstructor(issue: Pick<AdminIssue, 'kind' | 'blocksDelivery' | 'lifecycle'>): SanitizedPaymentStartGateInstructorView | undefined;
export declare function sanitizedInstructorViewOmitsFinancialFields(view: SanitizedPaymentStartGateInstructorView): boolean;
