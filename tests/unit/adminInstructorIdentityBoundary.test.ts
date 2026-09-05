import { describe, expect, it } from 'vitest';
import {
  adminClientAccountSearchParams,
  adminPlannerSearchParams,
} from '../../src/features/admin/adminNavigation';
import { readRepoFile } from '../helpers/readRepoFile';

describe('T32.9A.6.2 Admin Instructors identity boundary', () => {
  it('uses canonical admin_instructor_list as Instructors directory authority', () => {
    const directory = readRepoFile('src/features/admin/people/AdminInstructorDirectory.tsx');
    const people = readRepoFile('src/features/admin/people/AdminPeopleSection.tsx');
    const panel = readRepoFile('src/features/admin/components/AdminPanel.tsx');
    expect(directory).toContain("directory: 'instructors'");
    expect(directory).toContain('useAdminIdentityReadModels');
    expect(directory).toContain("directory: 'accounts'");
    expect(directory).not.toContain('mergeAdminInstructorDirectory');
    expect(directory).not.toContain('CoachesManager');
    expect(directory).not.toContain('balanceUSD');
    expect(directory).not.toContain('updateDoc');
    expect(directory).not.toContain('setDoc');
    expect(directory).not.toContain('deleteDoc');
    expect(directory).not.toContain('ins_${Math.random()');
    expect(people).toContain('AdminInstructorDirectory');
    expect(people).toContain("surface === 'instructors' ? (");
    expect(people).toContain('<AdminInstructorDirectory adminAccountId={adminAccountId} />');
    expect(people).not.toContain('CoachesManager');
    expect(people).not.toContain('mergeAdminInstructorDirectory');
    expect(panel).not.toContain('CanonicalIdentityManager');
  });

  it('keeps role, participant picker, hard delete, and USD authority out of Instructors UX', () => {
    const directory = readRepoFile('src/features/admin/people/AdminInstructorDirectory.tsx');
    const detail = readRepoFile('src/features/admin/people/AdminInstructorDetail.tsx');
    const list = readRepoFile('src/features/admin/people/AdminInstructorList.tsx');
    const editor = readRepoFile('src/features/admin/people/AdminInstructorProfileEditor.tsx');
    const picker = readRepoFile('src/features/admin/people/AdminInstructorAccountPicker.tsx');
    const translations = readRepoFile(
      'src/features/admin/people/useAdminInstructorTranslations.ts'
    );
    for (const source of [directory, detail, list, editor, picker, translations]) {
      expect(source).not.toContain('change_account_role');
      expect(source).not.toContain('deleteDoc');
      expect(source).not.toContain('balanceUSD');
      expect(source).not.toContain('directory: \'participants\'');
      expect(source).not.toContain('Create participant');
      expect(source).not.toContain('Delete instructor');
      expect(source).not.toContain('Удалить инструктора');
      expect(source).not.toContain('onDeleteInstructor');
    }
    expect(directory).toContain('create_instructor_catalog_entry');
    expect(directory).toContain('update_instructor_catalog_profile');
    expect(directory).toContain('deactivate_instructor_catalog');
    expect(directory).toContain('reactivate_instructor_catalog');
    expect(directory).toContain('link_account_instructor_catalog');
    expect(directory).toContain('unlink_account_instructor_catalog');
    expect(directory).toContain('canonicalDeterministicHash');
    expect(directory).toContain("['instructor_catalog:v1'");
    expect(directory).toContain('accountId');
    expect(directory).toContain("directory: 'accounts'");
    expect(translations).toContain('Pause new bookings');
    expect(translations).toContain('Приостановить приём записей');
    expect(translations).toContain('Stop being instructor');
    expect(translations).toContain('Перестать быть инструктором');
    expect(detail).toContain('unlinkBlockedByCommitments');
  });

  it('navigates Open Client to People with clientAccount and Open Planner to Operations', () => {
    const client = adminClientAccountSearchParams(
      new URLSearchParams('tab=finance&account=account_stale'),
      'account_family_instructor_01'
    );
    expect(client.get('tab')).toBe('people');
    expect(client.get('clientAccount')).toBe('account_family_instructor_01');
    const planner = adminPlannerSearchParams(new URLSearchParams('tab=people'), {
      localDate: '2026-09-04',
      instructorId: 'instructor_hash_01',
    });
    expect(planner.get('tab')).toBe('operations');
    expect(planner.get('plannerDate')).toBe('2026-09-04');
  });
});
