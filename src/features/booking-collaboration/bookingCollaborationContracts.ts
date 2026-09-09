import type {
  BookingChangeRequestReadModelAuthorizedActions,
  BookingStatus,
  BookingProposalReadModelAuthorizedActions,
  LessonBookingReadModel,
  LessonBookingReadModelAuthorizedActions,
  ParticipantInstructorAccessReadModelAuthorizedActions,
} from '@ski-academy/shared-domain';

export type BookingProposalCabinetSourceScope = 'account_open' | 'instructor_open';

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
  readonly clientExercisedCapability?: 'account_owner' | 'parent_guardian';
  readonly sourceScope: BookingProposalCabinetSourceScope;
}

export type BookingChangeRequestCabinetSourceScope = 'account_open' | 'instructor_open';

export interface BookingChangeRequestCabinetItem {
  readonly requestId: string;
  readonly revision: number;
  readonly bookingId: string;
  readonly requestType: string;
  readonly reason: string;
  readonly lifecycleStatus: string;
  readonly lifecycleLabel: string;
  readonly sourceScope: BookingChangeRequestCabinetSourceScope;
  readonly authorizedActions: BookingChangeRequestReadModelAuthorizedActions;
}

export interface InstructorLessonBookingItem {
  readonly bookingId: string;
  readonly revision: number;
  readonly status: BookingStatus;
  readonly date: string;
  readonly time: string;
  readonly durationHours: number;
  readonly startsAtEpochMs: number;
  readonly endsAtEpochMs: number;
  readonly instructorId: string;
  readonly instructorName: string;
  readonly participantIds: readonly string[];
  readonly participantNames: readonly string[];
  readonly participants: readonly {
    readonly participantId: string;
    readonly displayName: string;
    readonly selfAccountId?: string;
  }[];
  readonly partyKind: 'individual' | 'family_group';
  readonly difficulty?: LessonBookingReadModel['difficulty'];
  readonly notes?: string;
  readonly bookingOrigin: 'account' | 'instructor' | 'admin' | 'guest';
  readonly authorizedActions: LessonBookingReadModelAuthorizedActions;
  readonly attendance: readonly {
    readonly participantId: string;
    readonly attendanceStatus?: 'present' | 'absent';
    readonly revision?: number;
    readonly authorizedActions: {
      readonly canRecordPresent: boolean;
      readonly canRecordAbsent: boolean;
    };
  }[];
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
