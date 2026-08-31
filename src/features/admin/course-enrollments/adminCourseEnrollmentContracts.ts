import type {
  AdminCourseEnrollmentDetailReadModel,
  AdminCourseEnrollmentRosterItem,
  CourseEnrollmentId,
  CourseId,
  IdempotencyKey,
  ParticipantId,
} from '@ski-academy/shared-domain';

export type AdminCourseEnrollmentView = 'roster' | 'pending_guest' | 'history';
export type AdminCourseEnrollmentReadError = 'permission-denied' | 'read-failed';

export interface AdminCourseEnrollmentListState {
  readonly items: readonly AdminCourseEnrollmentRosterItem[];
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly cursor?: string;
  readonly error?: AdminCourseEnrollmentReadError;
}

export interface AdminCourseEnrollmentDetailState {
  readonly item?: AdminCourseEnrollmentDetailReadModel;
  readonly loading: boolean;
  readonly error?: AdminCourseEnrollmentReadError;
}

export interface AdminCourseEnrollmentTarget {
  readonly enrollmentId: CourseEnrollmentId;
  readonly revision: number;
  readonly courseId: CourseId;
  readonly paymentId: string;
}

export type AdminCourseEnrollmentAttempt =
  | {
      readonly kind: 'create_course_enrollments';
      readonly idempotencyKey: IdempotencyKey;
      readonly courseId: CourseId;
      readonly courseRevision: number;
      readonly participantId: ParticipantId;
      readonly reasonExplanation: string;
    }
  | {
      readonly kind: 'resolve_course_enrollment_cancellation';
      readonly idempotencyKey: IdempotencyKey;
      readonly target: AdminCourseEnrollmentTarget;
      readonly decision: 'approve' | 'reject';
      readonly refundAmount?: number;
      readonly reasonExplanation: string;
    }
  | {
      readonly kind: 'transfer_course_enrollment';
      readonly idempotencyKey: IdempotencyKey;
      readonly target: AdminCourseEnrollmentTarget;
      readonly targetCourseId: CourseId;
      readonly reasonExplanation: string;
    }
  | {
      readonly kind: 'reconcile_course_enrollment';
      readonly idempotencyKey: IdempotencyKey;
      readonly target: AdminCourseEnrollmentTarget;
    };

type AdminCourseEnrollmentMutationAttempt = Extract<
  AdminCourseEnrollmentAttempt,
  { target: AdminCourseEnrollmentTarget }
>;

export type AdminCourseEnrollmentMutationDraft =
  AdminCourseEnrollmentMutationAttempt extends infer Attempt
    ? Attempt extends AdminCourseEnrollmentMutationAttempt
      ? Omit<Attempt, 'target' | 'idempotencyKey'>
      : never
    : never;

export interface AdminCourseEnrollmentCourseOption {
  readonly courseId: CourseId;
  readonly title: string;
  readonly revision: number;
  readonly availableSeats: number;
  readonly lifecycle: string;
}

export interface AdminCourseEnrollmentParticipantOption {
  readonly participantId: ParticipantId;
  readonly displayName: string;
}
