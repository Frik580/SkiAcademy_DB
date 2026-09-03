import type {
  BookingId,
  IdempotencyKey,
  LessonBookingReadModel,
  LessonDifficulty,
  ParticipantId,
} from '@ski-academy/shared-domain';

export type AdminLessonBookingView = 'hot' | 'history';
export type AdminLessonBookingReadError = 'permission-denied' | 'read-failed';

export interface AdminLessonBookingListState {
  readonly items: readonly LessonBookingReadModel[];
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly cursor?: string;
  readonly error?: AdminLessonBookingReadError;
}

export interface AdminLessonBookingDetailState {
  readonly item?: LessonBookingReadModel;
  readonly loading: boolean;
  readonly error?: AdminLessonBookingReadError;
}

export interface AdminLessonBookingTarget {
  readonly bookingId: BookingId;
  readonly revision: number;
}

interface AttemptBase {
  readonly idempotencyKey: IdempotencyKey;
  readonly target: AdminLessonBookingTarget;
}

export type AdminLessonBookingMutationAttempt =
  | (AttemptBase & {
      readonly kind: 'resolve_booking_cancellation';
      readonly paymentId: string;
      readonly paymentRevision?: number;
      readonly decision: 'approve' | 'reject' | 'direct_cancel';
      readonly refundAmount?: number;
      readonly reasonExplanation: string;
    })
  | (AttemptBase & {
      readonly kind: 'reschedule_booking';
      readonly localDate: string;
      readonly localTime: string;
      readonly durationMinutes: number;
      readonly timezone: string;
      readonly reasonExplanation: string;
    })
  | (AttemptBase & {
      readonly kind: 'change_booking_instructor';
      readonly instructorId: string;
      readonly reasonExplanation: string;
    })
  | (AttemptBase & {
      readonly kind: 'change_booking_duration';
      readonly durationMinutes: number;
      readonly reasonExplanation: string;
    })
  | (AttemptBase & {
      readonly kind: 'record_booking_attendance';
      readonly participantId: ParticipantId;
      readonly attendanceStatus: 'present' | 'absent';
      readonly expectedAttendanceRevision?: number;
      readonly reasonExplanation: string;
    })
  | (AttemptBase & {
      readonly kind: 'resolve_attendance_outcome';
    })
  | (AttemptBase & {
      readonly kind: 'link_guest_booking_to_account_as_administrator';
      readonly targetAccountId: string;
      readonly targetParticipantId: ParticipantId;
      readonly targetAccountDisplayName?: string;
      readonly targetParticipantDisplayName: string;
      readonly reasonExplanation: string;
    });

export type AdminLessonBookingMutationDraft =
  AdminLessonBookingMutationAttempt extends infer Attempt
    ? Attempt extends AdminLessonBookingMutationAttempt
      ? Omit<Attempt, 'target' | 'idempotencyKey'>
      : never
    : never;

export interface AdminCreateLessonBookingAttempt {
  readonly kind: 'create_confirmed_booking';
  readonly idempotencyKey: IdempotencyKey;
  readonly bookingId: BookingId;
  readonly instructorId: string;
  readonly participantIds: readonly string[];
  readonly payerAccountId: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly durationMinutes: number;
  readonly timezone: string;
  readonly reasonExplanation: string;
  readonly difficulty?: LessonDifficulty;
  readonly notes?: string;
}

export type AdminLessonBookingAttempt =
  AdminLessonBookingMutationAttempt | AdminCreateLessonBookingAttempt;

export interface AdminLessonParticipantOption {
  readonly participantId: string;
  readonly displayName: string;
  readonly source: 'canonical_booking' | 'account_self';
}

export interface AdminLessonAccountOption {
  readonly accountId: string;
  readonly displayName: string;
  readonly email?: string;
}

export interface AdminLessonInstructorOption {
  readonly instructorId: string;
  readonly displayName: string;
}
