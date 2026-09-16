import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));

vi.mock('../../src/app/providers/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: (amount: number) => `$${amount}` }),
}));

vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}));

vi.mock('../../src/features/admin/components/settings/SkillConfigManager', () => ({
  SkillConfigManager: () => <div>skill-config</div>,
}));

vi.mock('../../src/features/admin/components/settings/AchievementsManager', () => ({
  AchievementsManager: () => <div>achievements-config</div>,
}));

import { AdminSystemSettings } from '../../src/features/admin/components/settings/AdminSystemSettings';
import { readRepoFile } from '../helpers/readRepoFile';

describe('T32.1 read-only Admin panels', () => {
  it('does not keep the unmounted GuestWalletPanel as a product surface', () => {
    expect(
      existsSync(join(process.cwd(), 'src/features/admin/components/finance/GuestWalletPanel.tsx'))
    ).toBe(false);
    const guestFinance = readRepoFile('src/features/admin/finance/CanonicalGuestFinancePanel.tsx');
    const adminService = readRepoFile('src/features/admin/adminService.ts');
    expect(guestFinance).not.toContain('adjustGuestWalletBalance');
    expect(adminService).not.toContain('subscribeGuestWalletBalance');
    expect(adminService).not.toContain('adjustGuestWalletBalance');
  });

  it('loads normal System settings with a non-executable destructive-tools notice', async () => {
    render(<AdminSystemSettings />);

    expect(screen.getByText('systemSettingsTitle')).toBeInTheDocument();
    await userEvent.click(screen.getByText('adminDangerZoneTitle'));
    expect(screen.getByText('destructiveAdminToolsDisabled')).toBeInTheDocument();
    expect(screen.queryByText('resetSchoolFinancesRun')).not.toBeInTheDocument();
    expect(screen.queryByText('clearStudentBookingsRun')).not.toBeInTheDocument();
  });

  it('keeps Clients contact editing without legacy balance mutation controls', () => {
    const directory = readRepoFile('src/features/admin/people/AdminClientDirectory.tsx');
    const contact = readRepoFile('src/features/admin/people/AdminClientContactEditor.tsx');
    expect(directory).toContain('update_account_contact_as_administrator');
    expect(directory).not.toContain('balanceUSD');
    expect(directory).not.toContain('setClientBalance');
    expect(contact).toContain('emailReadOnly');
    expect(contact).toContain('disabled');
  });
});
