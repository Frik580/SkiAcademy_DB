import type {
  BookingStatus,
  LessonBookingReadModelAuthorizedActions,
  ManagedParticipantPickerAgeProjection,
} from '@ski-academy/shared-domain';
import type { LessonDifficulty } from '../../types';
import type { ClientCallableCapability } from '../../lib/canonical/canonicalCommandClient';

export interface LessonBookingPaymentPresentation {
  readonly kind: 'visible' | 'withheld';
  readonly paymentStatus?: string;
  readonly price?: number;
}

export interface LessonBookingCabinetItem {
  readonly id: string;
  readonly bookingId: string;
  readonly revision: number;
  readonly status: BookingStatus;
  readonly date: string;
  readonly time: string;
  readonly durationHours: number;
  readonly instructorId: string;
  readonly instructorName: string;
  readonly instructorAvatar: string;
  readonly participantNames: readonly string[];
  readonly partyKind: 'individual' | 'family_group';
  readonly payment: LessonBookingPaymentPresentation;
  readonly totalPrice?: number;
  readonly bookingOrigin: 'account' | 'guest' | 'instructor' | 'admin';
  readonly isLessonBooking: boolean;
  readonly difficulty?: LessonDifficulty;
  readonly cancellationReason?: string;
  readonly authorizedActions?: LessonBookingReadModelAuthorizedActions;
}

export interface LessonBookingSubmissionIdentity {
  readonly bookingId: string;
  readonly idempotencyKey: string;
}

export interface AuthenticatedLessonBookingInput {
  readonly instructorId: string;
  readonly participantIds: readonly string[];
  readonly exercisedCapability: ClientCallableCapability;
  readonly localDate: string;
  readonly localTime: string;
  readonly durationMinutes: number;
  readonly timezone: string;
  readonly identity: LessonBookingSubmissionIdentity;
}

export interface GuestLessonBookingInput {
  readonly instructorId: string;
  readonly participantId: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly durationMinutes: number;
  readonly timezone: string;
  readonly identity: LessonBookingSubmissionIdentity;
  readonly guestDisplayName: string;
  readonly guestSkillLevel: string;
  readonly guestDiscipline: 'ski' | 'snowboard';
  readonly guestAgeYears: number;
}

export interface ManagedParticipantOption {
  readonly participantId: string;
  readonly participantManagementId: string;
  readonly displayName: string;
  readonly discipline: 'ski' | 'snowboard';
  readonly skillLevel: string;
  readonly age: ManagedParticipantPickerAgeProjection;
  readonly authority: 'self' | 'parent_guardian';
  readonly revision: number;
  readonly instructorComment?: string;
}

export type LessonBookingReadSyncState = {
  readonly hotLoading: boolean;
  readonly historyLoading: boolean;
  readonly historyHasMore: boolean;
  readonly historyCursor?: string;
  readonly error?: string;
  readonly loaded: boolean;
};
