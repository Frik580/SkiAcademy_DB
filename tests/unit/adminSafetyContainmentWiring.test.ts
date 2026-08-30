import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../helpers/readRepoFile';

describe('T32.1 Admin safety containment wiring', () => {
  it('removes destructive maintenance writers from active Admin and booking actions', () => {
    const adminActions = readRepoFile('src/features/admin/useAdminActions.ts');
    const bookingActions = readRepoFile('src/features/bookings/useBookingActions.ts');
    const adminRoute = readRepoFile('src/app/routes/AdminRouteContainer.tsx');
    const adminPanel = readRepoFile('src/features/admin/components/AdminPanel.tsx');

    for (const source of [adminActions, bookingActions, adminRoute, adminPanel]) {
      expect(source).not.toContain('clearStudentBookings');
      expect(source).not.toContain('clearCancelledBookings');
      expect(source).not.toContain('resetSchoolFinances');
    }
  });

  it('keeps dangerous Admin panels read-only with explicit containment copy', () => {
    const systemSettings = readRepoFile(
      'src/features/admin/components/settings/AdminSystemSettings.tsx'
    );
    const guestWallet = readRepoFile(
      'src/features/admin/components/finance/GuestWalletPanel.tsx'
    );
    const clients = readRepoFile('src/features/admin/components/users/ClientsManager.tsx');
    const profileService = readRepoFile('src/features/profile/profileService.ts');

    expect(systemSettings).toContain("t('destructiveAdminToolsDisabled')");
    expect(systemSettings).not.toContain('onResetSchoolFinances');
    expect(guestWallet).toContain("t('guestWalletMutationDisabled')");
    expect(guestWallet).not.toContain('adjustGuestWalletBalance');
    expect(clients).toContain("t('directBalanceEditingDisabled')");
    expect(clients).toContain("t('existingClientEmailEditingDisabled')");
    expect(clients).not.toContain('setClientBalance');
    expect(clients).not.toContain('onDeleteUser');
    expect(profileService).not.toContain('updateUserWithAdminBalanceLedger');
    expect(profileService).not.toContain('deleteUserService');
    expect(profileService).toContain('delete nonMonetaryProfile.balanceUSD');
  });
});
