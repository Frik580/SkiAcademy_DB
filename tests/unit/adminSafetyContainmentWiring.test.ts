import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../helpers/readRepoFile';

function repoPath(relative: string): string {
  return join(process.cwd(), relative);
}

describe('T32.1 Admin safety containment wiring', () => {
  it('removes destructive maintenance writers from active Admin and leftover booking actions', () => {
    expect(existsSync(repoPath('src/features/admin/useAdminActions.ts'))).toBe(false);
    expect(existsSync(repoPath('src/features/bookings/useBookingActions.ts'))).toBe(false);
    expect(existsSync(repoPath('src/features/admin/resetSchoolFinances.ts'))).toBe(false);

    const adminRoute = readRepoFile('src/app/routes/AdminRouteContainer.tsx');
    const adminPanel = readRepoFile('src/features/admin/components/AdminPanel.tsx');

    for (const source of [adminRoute, adminPanel]) {
      expect(source).not.toContain('clearStudentBookings');
      expect(source).not.toContain('clearCancelledBookings');
      expect(source).not.toContain('resetSchoolFinances');
    }
  });

  it('keeps dangerous Admin surfaces read-only with explicit containment copy', () => {
    const systemSettings = readRepoFile(
      'src/features/admin/components/settings/AdminSystemSettings.tsx'
    );
    const guestFinance = readRepoFile('src/features/admin/finance/CanonicalGuestFinancePanel.tsx');
    const clients = readRepoFile('src/features/admin/people/AdminClientDirectory.tsx');
    const contact = readRepoFile('src/features/admin/people/AdminClientContactEditor.tsx');
    const profileService = readRepoFile('src/features/profile/profileService.ts');
    const adminService = readRepoFile('src/features/admin/adminService.ts');

    expect(existsSync(repoPath('src/features/admin/components/finance/GuestWalletPanel.tsx'))).toBe(
      false
    );
    expect(systemSettings).toContain("t('destructiveAdminToolsDisabled')");
    expect(systemSettings).not.toContain('onResetSchoolFinances');
    expect(guestFinance).not.toContain('adjustGuestWalletBalance');
    expect(adminService).not.toContain('adjustGuestWalletBalance');
    expect(adminService).not.toContain('subscribeGuestWalletBalance');
    expect(clients).toContain('update_account_contact_as_administrator');
    expect(clients).not.toContain('balanceUSD');
    expect(clients).not.toContain('setClientBalance');
    expect(clients).not.toContain('onDeleteUser');
    expect(contact).toContain('emailReadOnly');
    expect(profileService).not.toContain('updateUserWithAdminBalanceLedger');
    expect(profileService).not.toContain('deleteUserService');
    expect(profileService).toContain('delete nonMonetaryProfile.balanceUSD');
  });
});
