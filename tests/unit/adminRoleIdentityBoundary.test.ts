import { describe, expect, it } from 'vitest';
import { adminClientAccountSearchParams } from '../../src/features/admin/adminNavigation';
import { readRepoFile } from '../helpers/readRepoFile';

describe('T32.9A.7.2 Admin Roles identity boundary', () => {
  it('uses canonical admin_account_list with role filter as Roles directory authority', () => {
    const directory = readRepoFile('src/features/admin/people/AdminRoleDirectory.tsx');
    const people = readRepoFile('src/features/admin/people/AdminPeopleSection.tsx');
    const panel = readRepoFile('src/features/admin/components/AdminPanel.tsx');
    expect(directory).toContain("directory: 'accounts'");
    expect(directory).toContain("role: 'admin'");
    expect(directory).toContain('useAdminIdentityReadModels');
    expect(directory).toContain('changeAccountRoleAuthorizedAction');
    expect(directory).toContain("kind: 'change_account_role'");
    expect(directory).not.toContain('mergeAdminClientDirectory');
    expect(directory).not.toContain('useUsersSync');
    expect(directory).not.toContain('usersList');
    expect(directory).not.toContain('storeUsers');
    expect(directory).not.toContain('expectedRevision ?? 1');
    expect(directory).not.toContain('updateDoc');
    expect(directory).not.toContain('setDoc');
    expect(directory).not.toContain('profileService');
    expect(directory).not.toContain('handleUpdateUserRole');
    expect(directory).not.toContain('canManageAdminRoles');
    expect(people).toContain('AdminRoleDirectory');
    expect(people).toContain("surface === 'admins' ? (");
    expect(people).not.toContain('mergeAdminClientDirectory');
    expect(people).not.toContain('storeUsers');
    expect(panel).not.toContain('CanonicalIdentityManager');
  });

  it('keeps instructor/participant/disable/ownership transfer out of Roles UX', () => {
    const directory = readRepoFile('src/features/admin/people/AdminRoleDirectory.tsx');
    const list = readRepoFile('src/features/admin/people/AdminRoleList.tsx');
    const picker = readRepoFile('src/features/admin/people/AdminRoleAccountPicker.tsx');
    const translations = readRepoFile('src/features/admin/people/useAdminRoleTranslations.ts');
    for (const source of [directory, list, picker, translations]) {
      expect(source).not.toContain('disable_account');
      expect(source).not.toContain('enable_account');
      expect(source).not.toContain('systemRole:');
      expect(source).not.toContain('ownership');
      expect(source).not.toContain('transferOwnership');
      expect(source).not.toContain('directory: \'participants\'');
      expect(source).not.toContain('directory: \'instructors\'');
      expect(source).not.toContain('link_account_instructor_catalog');
      expect(source).not.toContain('Instructor option');
    }
    expect(translations).toContain('Владелец');
    expect(translations).toContain('Owner');
    expect(translations).toContain('Добавить администратора');
    expect(translations).toContain('Снять права администратора');
    expect(list).toContain('canDemoteCanonicalAccountAdminRole');
    expect(picker).toContain('isCanonicalAccountEligibleForAdminRolePromotion');
    expect(list).toContain('ownerBadge');
    expect(list).toContain('instructorBadge');
  });

  it('navigates Open Client to People tab with canonical clientAccount deep-link', () => {
    const next = adminClientAccountSearchParams(
      new URLSearchParams('tab=finance&account=account_stale'),
      'account_role_client_01'
    );
    expect(next.get('tab')).toBe('people');
    expect(next.get('clientAccount')).toBe('account_role_client_01');
    expect(next.get('account')).toBe('account_stale');

    const panel = readRepoFile('src/features/admin/components/AdminPanel.tsx');
    const clients = readRepoFile('src/features/admin/people/AdminClientDirectory.tsx');
    expect(panel).toContain('ADMIN_CLIENT_ACCOUNT_QUERY_KEY');
    expect(panel).toContain('forceOpen={Boolean(searchParams.get(ADMIN_CLIENT_ACCOUNT_QUERY_KEY))}');
    expect(clients).toContain('ADMIN_CLIENT_ACCOUNT_QUERY_KEY');
    expect(clients).toContain('AccountIdSchema.safeParse(deepLinkAccountRaw)');
  });
});
