import {
  IdempotencyKeySchema,
  type AdminAccountListItem,
} from '@ski-academy/shared-domain';

export const ADMIN_ROLE_DIRECTORY_PAGE_SIZE = 20;
export const ADMIN_ROLE_PROMOTE_REASON = 'Admin role directory promote administrator';
export const ADMIN_ROLE_DEMOTE_REASON = 'Admin role directory revoke administrator';

export type AdminRoleDirectoryRow = Pick<
  AdminAccountListItem,
  | 'accountId'
  | 'displayName'
  | 'email'
  | 'lifecycle'
  | 'role'
  | 'instructorLink'
  | 'authorizedActions'
  | 'revision'
  | 'diagnosticCount'
>;

export type AdminRoleCandidateRow = AdminRoleDirectoryRow;

export function adminRoleAttemptKey(action: string): string {
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  return IdempotencyKeySchema.parse(`admin_role:${action}:${entropy}`);
}
