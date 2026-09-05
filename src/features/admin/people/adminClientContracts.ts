import {
  IdempotencyKeySchema,
  type AccountId,
  type AdminAccountDetailReadModel,
  type AdminAccountListItem,
  type AdminParticipantDetailReadModel,
  type AdminWalletReadModel,
  type ParticipantId,
} from '@ski-academy/shared-domain';

export const ADMIN_CLIENT_DIRECTORY_PAGE_SIZE = 20;
export const ADMIN_CLIENT_CONTACT_REASON = 'Admin client directory contact update';
export const ADMIN_CLIENT_LIFECYCLE_REASON = 'Admin client directory lifecycle update';
export const ADMIN_CLIENT_PARTICIPANT_REASON = 'Admin client directory participant update';
export const ADMIN_CLIENT_DEPENDENT_REASON = 'Admin client directory add participant';
export const ADMIN_CLIENT_PROVISION_SELF_REASON =
  'Admin client directory provision self participant';

export type AdminClientDirectoryRow = Pick<
  AdminAccountListItem,
  | 'accountId'
  | 'displayName'
  | 'email'
  | 'lifecycle'
  | 'managedParticipantCount'
  | 'role'
  | 'instructorLink'
  | 'authorizedActions'
  | 'revision'
>;

export type AdminClientAccountDetailView = Pick<
  AdminAccountDetailReadModel,
  | 'accountId'
  | 'displayName'
  | 'email'
  | 'phoneNumber'
  | 'lifecycle'
  | 'role'
  | 'instructorLink'
  | 'managedParticipants'
  | 'diagnostics'
  | 'authorizedActions'
  | 'revision'
>;

export type AdminClientManagedParticipant =
  AdminAccountDetailReadModel['managedParticipants'][number];

export type AdminClientParticipantDetailView = Pick<
  AdminParticipantDetailReadModel,
  | 'participantId'
  | 'displayName'
  | 'classification'
  | 'lifecycle'
  | 'profile'
  | 'managers'
  | 'authorizedActions'
  | 'archiveBlockedByCommitments'
  | 'revision'
>;

export type AdminClientWalletSummaryView = Pick<
  AdminWalletReadModel,
  'accountId' | 'exists' | 'balance' | 'currency' | 'accountStatus'
>;

export interface AdminClientContactDraft {
  readonly displayName: string;
  readonly phoneNumber: string;
}

export interface AdminClientDependentDraft {
  readonly displayName: string;
  readonly birthDate: string;
  readonly skillLevel: string;
  readonly discipline: 'ski' | 'snowboard';
}

export interface AdminClientParticipantProfileDraft {
  readonly displayName: string;
  readonly birthDate: string;
  readonly skillLevel: string;
  readonly discipline: 'ski' | 'snowboard';
  readonly instructorComment: string;
}

export function adminClientAttemptKey(
  action: string,
  subjectId: AccountId | ParticipantId | string
) {
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  return IdempotencyKeySchema.parse(`admin_clients:${action}:${subjectId}:${entropy}`);
}
