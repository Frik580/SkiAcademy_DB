import type {
  BookingChangeRequestReadModelAuthorizedActions,
  BookingProposalReadModelAuthorizedActions,
  LessonBookingReadModelAuthorizedActions,
  ParticipantInstructorAccessReadModelAuthorizedActions,
} from '@ski-academy/shared-domain';

export interface BookingProposalCabinetItem {
  readonly proposalId: string;
  readonly revision: number;
  readonly participantId: string;
  readonly instructorId: string;
  readonly participantDisplayName: string;
  readonly instructorDisplayName: string;
  readonly date: string;
  readonly time: string;
  readonly durationHours: number;
  readonly lifecycleStatus: string;
  readonly lifecycleLabel: string;
  readonly authorizedActions: BookingProposalReadModelAuthorizedActions;
}

export interface BookingChangeRequestCabinetItem {
  readonly requestId: string;
  readonly revision: number;
  readonly bookingId: string;
  readonly requestType: string;
  readonly reason: string;
  readonly lifecycleStatus: string;
  readonly lifecycleLabel: string;
  readonly authorizedActions: BookingChangeRequestReadModelAuthorizedActions;
}

export interface InstructorLessonBookingItem {
  readonly bookingId: string;
  readonly revision: number;
  readonly status: string;
  readonly date: string;
  readonly time: string;
  readonly durationHours: number;
  readonly instructorId: string;
  readonly instructorName: string;
  readonly participantIds: readonly string[];
  readonly participantNames: readonly string[];
  readonly partyKind: 'individual' | 'family_group';
  readonly authorizedActions: LessonBookingReadModelAuthorizedActions;
}

export interface ParticipantAccessCabinetItem {
  readonly participantId: string;
  readonly instructorId: string;
  readonly participantDisplayName: string;
  readonly instructorDisplayName: string;
  readonly relationshipStatus?: 'active' | 'revoked' | 'expired';
  readonly relationshipRevision?: number;
  readonly instructorRelationshipId?: string;
  readonly managerBlockStatus?: 'active' | 'removed';
  readonly managerBlockRevision?: number;
  readonly managerBlockId?: string;
  readonly instructorBlockStatus?: 'active' | 'removed';
  readonly instructorBlockRevision?: number;
  readonly instructorBlockId?: string;
  readonly authorizedActions: ParticipantInstructorAccessReadModelAuthorizedActions;
}

export type CollaborationActorScope = 'account' | 'instructor';

export interface CollaborationReadSyncState {
  readonly loading: boolean;
  readonly loaded: boolean;
  readonly error?: string;
}
