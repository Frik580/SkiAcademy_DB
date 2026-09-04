import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSubscribeGuestWalletBalance } = vi.hoisted(() => ({
  mockSubscribeGuestWalletBalance: vi.fn(),
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));

vi.mock('../../src/app/providers/CurrencyContext', () => ({
  useCurrency: () => ({ formatPrice: (amount: number) => `$${amount}` }),
}));

vi.mock('../../src/features/notifications', () => ({
  useNotifications: () => ({ addNotification: vi.fn() }),
}));

vi.mock('../../src/features/admin/adminService', () => ({
  subscribeGuestWalletBalance: mockSubscribeGuestWalletBalance,
}));

vi.mock('../../src/features/admin/components/settings/SkillConfigManager', () => ({
  SkillConfigManager: () => <div>skill-config</div>,
}));

vi.mock('../../src/features/admin/components/settings/AchievementsManager', () => ({
  AchievementsManager: () => <div>achievements-config</div>,
}));

import { GuestWalletPanel } from '../../src/features/admin/components/finance/GuestWalletPanel';
import { AdminSystemSettings } from '../../src/features/admin/components/settings/AdminSystemSettings';
import { readRepoFile } from '../helpers/readRepoFile';

describe('T32.1 read-only Admin panels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscribeGuestWalletBalance.mockImplementation((onValue: (value: number) => void) => {
      onValue(125);
      return vi.fn();
    });
  });

  it('loads the guest wallet balance without mutation controls', () => {
    render(<GuestWalletPanel />);

    expect(screen.getByText('$125')).toBeInTheDocument();
    expect(screen.getByText('guestWalletMutationDisabled')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
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
