import type {
  AccountId,
  AdminIdentityAuthorizedActionKind,
  IdempotencyKey,
  InstructorId,
  ParticipantId,
  ParticipantManagementId,
} from '@ski-academy/shared-domain';

export type AdminIdentityDirectory = 'accounts' | 'participants' | 'instructors';

export interface AdminIdentityCommandBase {
  readonly idempotencyKey: IdempotencyKey;
  readonly reasonExplanation: string;
  readonly expectedRevision: number;
}

export type AdminIdentityAttempt =
  | (AdminIdentityCommandBase & {
      readonly kind: 'disable_account' | 'enable_account' | 'change_account_role';
      readonly accountId: AccountId;
      readonly role?: 'user' | 'admin';
    })
  | (AdminIdentityCommandBase & {
      readonly kind:
        'archive_participant' | 'reactivate_participant' | 'update_participant_profile';
      readonly participantId: ParticipantId;
      readonly displayName?: string;
      readonly birthDate?: string;
      readonly skillLevel?: string;
      readonly discipline?: 'ski' | 'snowboard';
    })
  | (AdminIdentityCommandBase & {
      readonly kind: 'assign_participant_management_as_administrator';
      readonly participantId: ParticipantId;
      readonly participantManagementId: ParticipantManagementId;
      readonly accountId: AccountId;
    })
  | (AdminIdentityCommandBase & {
      readonly kind: 'revoke_participant_management';
      readonly participantManagementId: ParticipantManagementId;
    })
  | (AdminIdentityCommandBase & {
      readonly kind: 'create_managed_dependent_participant';
      readonly accountId: AccountId;
      readonly participantId: ParticipantId;
      readonly participantManagementId: ParticipantManagementId;
      readonly displayName: string;
      readonly birthDate: string;
      readonly skillLevel: string;
      readonly discipline: 'ski' | 'snowboard';
    })
  | (AdminIdentityCommandBase & {
      readonly kind:
        'provision_self_participant_for_account' | 'repair_participant_management_owner_guard';
      readonly accountId?: AccountId;
      readonly participantId?: ParticipantId;
    })
  | (AdminIdentityCommandBase & {
      readonly kind:
        | 'create_instructor_catalog_entry'
        | 'update_instructor_catalog_profile'
        | 'deactivate_instructor_catalog'
        | 'reactivate_instructor_catalog';
      readonly instructorId: InstructorId;
      readonly name?: string;
      readonly pricePerHourKZT?: number;
      readonly specialty?: 'ski' | 'snowboard' | 'both';
      readonly languages?: readonly string[];
      readonly experienceYears?: number;
      readonly bio?: string;
      readonly avatarUrl?: string;
      readonly phoneNumber?: string;
    })
  | (AdminIdentityCommandBase & {
      readonly kind: 'link_account_instructor_catalog' | 'unlink_account_instructor_catalog';
      readonly accountId: AccountId;
      readonly instructorId: InstructorId;
    });

export type AdminIdentityActionKind = AdminIdentityAuthorizedActionKind;

export interface AdminManagedParticipantSelection {
  readonly accountId: AccountId;
  readonly participantId: ParticipantId;
  readonly displayName: string;
  readonly accountDisplayName?: string;
}
