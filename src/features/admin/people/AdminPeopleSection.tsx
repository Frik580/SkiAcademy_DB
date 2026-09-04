import { IdempotencyKeySchema, ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_MAX } from '@ski-academy/shared-domain';
import { useEffect, useMemo } from 'react';
import type { Booking, Instructor, UserProfile } from '../../../types';
import { AdminRoleManager } from '../components/users/AdminRoleManager';
import { executeAdminIdentityAttempt } from '../identity/useAdminIdentityCommands';
import { useAdminIdentityReadModels } from '../identity/useAdminIdentityReadModels';
import { mergeAdminClientDirectory } from './adminPeopleMapping';
import { AdminClientDirectory } from './AdminClientDirectory';
import { AdminInstructorDirectory } from './AdminInstructorDirectory';

interface AdminPeopleSectionProps {
  readonly adminAccountId: string;
  readonly currentUserProfile: UserProfile;
  readonly storeUsers: UserProfile[];
  readonly storeInstructors: Instructor[];
  readonly bookings: Booking[];
  readonly onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
  readonly surface: 'clients' | 'instructors' | 'admins';
}

function attemptKey(action: string) {
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  return IdempotencyKeySchema.parse(`admin_people:${action}:${entropy}`);
}

export function AdminPeopleSection({
  adminAccountId,
  currentUserProfile,
  storeUsers,
  onRequestConfirm,
  surface,
}: AdminPeopleSectionProps) {
  const accounts = useAdminIdentityReadModels({
    enabled: surface === 'admins',
    directory: 'accounts',
    search: '',
    pageSize: ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_MAX,
  });

  useEffect(() => {
    if (
      accounts.accounts.hasMore &&
      accounts.accounts.cursor &&
      !accounts.accounts.loading &&
      !accounts.accounts.loadingMore
    ) {
      accounts.loadMore();
    }
  }, [
    accounts.accounts.cursor,
    accounts.accounts.hasMore,
    accounts.accounts.loading,
    accounts.accounts.loadingMore,
    accounts.loadMore,
  ]);

  const usersList = useMemo(
    () => mergeAdminClientDirectory(storeUsers, accounts.accounts.items),
    [accounts.accounts.items, storeUsers]
  );

  const refreshPeople = async () => {
    await accounts.refresh();
  };

  return (
    <>
      {surface === 'clients' ? <AdminClientDirectory adminAccountId={adminAccountId} /> : null}
      {surface === 'instructors' ? (
        <AdminInstructorDirectory adminAccountId={adminAccountId} />
      ) : null}
      {surface === 'admins' ? (
        <AdminRoleManager
          usersList={usersList}
          currentUserProfile={currentUserProfile}
          onUpdateUserRole={async (targetUid, newRole) => {
            const item = accounts.accounts.items.find((account) => account.accountId === targetUid);
            await executeAdminIdentityAttempt(adminAccountId, {
              kind: 'change_account_role',
              accountId: item?.accountId ?? (targetUid as never),
              role: newRole,
              reasonExplanation: 'Admin resort administrator assignment',
              expectedRevision: item?.revision ?? 1,
              idempotencyKey: attemptKey('assign_admin_role'),
            });
            await refreshPeople();
          }}
          onRequestConfirm={onRequestConfirm}
        />
      ) : null}
    </>
  );
}
