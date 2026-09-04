import { describe, expect, it } from 'vitest';
import { adminFinanceAccountSearchParams } from '../../src/features/admin/adminNavigation';
import { readRepoFile } from '../helpers/readRepoFile';

describe('T32.9A.5.2 Admin Clients identity boundary', () => {
  it('uses canonical admin_account_list as Clients directory authority', () => {
    const directory = readRepoFile('src/features/admin/people/AdminClientDirectory.tsx');
    const people = readRepoFile('src/features/admin/people/AdminPeopleSection.tsx');
    const panel = readRepoFile('src/features/admin/components/AdminPanel.tsx');
    expect(directory).toContain("directory: 'accounts'");
    expect(directory).toContain('useAdminIdentityReadModels');
    expect(directory).not.toContain('useUsersSync');
    expect(directory).not.toContain('loadMoreUsers');
    expect(directory).not.toContain('mergeAdminClientDirectory');
    expect(directory).not.toContain('balanceUSD');
    expect(directory).not.toContain('updateDoc');
    expect(directory).not.toContain('setDoc');
    expect(directory).not.toContain('deleteDoc');
    expect(people).toContain('AdminClientDirectory');
    expect(people).toContain("surface === 'clients' ? <AdminClientDirectory");
    expect(panel).not.toContain('CanonicalIdentityManager');
  });

  it('keeps role, instructor, guest, finance mutation, create, and delete out of Clients UX', () => {
    const directory = readRepoFile('src/features/admin/people/AdminClientDirectory.tsx');
    const detail = readRepoFile('src/features/admin/people/AdminClientAccountDetail.tsx');
    const wallet = readRepoFile('src/features/admin/people/AdminClientWalletSummary.tsx');
    const contact = readRepoFile('src/features/admin/people/AdminClientContactEditor.tsx');
    const participant = readRepoFile('src/features/admin/people/AdminClientParticipantDetail.tsx');
    for (const source of [directory, detail, wallet, contact, participant]) {
      expect(source).not.toContain('change_account_role');
      expect(source).not.toContain('create_instructor_catalog_entry');
      expect(source).not.toContain('link_account_instructor_catalog');
      expect(source).not.toContain('LinkGuestBookingModal');
      expect(source).not.toContain('record_manual_wallet_funding');
      expect(source).not.toContain('record_financial_correction');
      expect(source).not.toContain('complete_booking');
      expect(source).not.toContain('create_account');
      expect(source).not.toContain('onDeleteUser');
      expect(source).not.toContain('skierLabel');
      expect(source).not.toContain('balanceUSD');
    }
    expect(directory).toContain('update_account_contact_as_administrator');
    expect(directory).toContain('update_participant_profile');
    expect(directory).toContain('create_managed_dependent_participant');
    expect(directory).toContain('provision_self_participant_for_account');
    expect(contact).toContain('disabled');
    expect(wallet).toContain('walletMissing');
    expect(wallet).toContain('openFinance');
  });

  it('opens Finance on the exact Account and clears stale payment selection', () => {
    const next = adminFinanceAccountSearchParams(
      new URLSearchParams('tab=people&payment=payment_stale&movement=move_1'),
      'account_family_client_dir_01'
    );
    expect(next.get('tab')).toBe('finance');
    expect(next.get('account')).toBe('account_family_client_dir_01');
    expect(next.get('payment')).toBeNull();
    expect(next.get('movement')).toBeNull();
  });
});
