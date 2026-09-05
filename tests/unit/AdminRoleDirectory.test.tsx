import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountIdSchema } from '@ski-academy/shared-domain';

const {
  mockAdminReads,
  mockCandidateReads,
  mockExecute,
  mockSetSearchParams,
  identityReadByDirectory,
} = vi.hoisted(() => ({
  mockAdminReads: {
    accounts: {
      items: [] as Array<Record<string, unknown>>,
      loading: false,
      loadingMore: false,
      hasMore: false,
      cursor: undefined as string | undefined,
      error: undefined as 'permission-denied' | 'read-failed' | undefined,
    },
    participants: { items: [], loading: false, loadingMore: false, hasMore: false },
    instructors: { items: [], loading: false, loadingMore: false, hasMore: false },
    accountDetail: undefined as Record<string, unknown> | undefined,
    participantDetail: undefined,
    instructorDetail: undefined,
    detailLoading: false,
    detailError: undefined as 'permission-denied' | 'read-failed' | undefined,
    loadMore: vi.fn(),
    refresh: vi.fn(async () => undefined),
  },
  mockCandidateReads: {
    accounts: {
      items: [] as Array<Record<string, unknown>>,
      loading: false,
      loadingMore: false,
      hasMore: false,
      cursor: undefined as string | undefined,
      error: undefined as 'permission-denied' | 'read-failed' | undefined,
    },
    participants: { items: [], loading: false, loadingMore: false, hasMore: false },
    instructors: { items: [], loading: false, loadingMore: false, hasMore: false },
    accountDetail: undefined,
    participantDetail: undefined,
    instructorDetail: undefined,
    detailLoading: false,
    detailError: undefined as 'permission-denied' | 'read-failed' | undefined,
    loadMore: vi.fn(),
    refresh: vi.fn(async () => undefined),
  },
  mockExecute: vi.fn(async () => undefined),
  mockSetSearchParams: vi.fn(),
  identityReadByDirectory: {
    current: {} as Record<string, Record<string, unknown>>,
  },
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'ru', t: (key: string) => key }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('tab=people'), mockSetSearchParams],
  };
});

vi.mock('../../src/features/admin/identity/useAdminIdentityReadModels', () => ({
  useAdminIdentityReadModels: (input: Record<string, unknown>) => {
    const key = `${String(input.directory)}:${String(input.role ?? '')}:${String(input.search ?? '')}`;
    identityReadByDirectory.current[key] = input;
    if (input.role === 'admin') return mockAdminReads;
    return mockCandidateReads;
  },
}));

vi.mock('../../src/features/admin/identity/useAdminIdentityCommands', () => ({
  executeAdminIdentityAttempt: (...args: unknown[]) => mockExecute(...args),
}));

import { AdminRoleDirectory } from '../../src/features/admin/people/AdminRoleDirectory';

const ownerId = AccountIdSchema.parse('account_admin_role_owner_01');
const adminId = AccountIdSchema.parse('account_admin_role_admin_01');
const userId = AccountIdSchema.parse('account_admin_role_user_01');
const statsId = AccountIdSchema.parse('school_global_stats');
const uninitId = AccountIdSchema.parse('account_admin_role_uninit_01');

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    accountId: userId,
    displayName: 'Candidate User',
    email: 'user@example.com',
    lifecycle: 'active',
    role: { role: 'user' },
    managedParticipantCount: 0,
    instructorLink: { isInstructor: false },
    diagnosticCount: 0,
    revision: 3,
    authorizedActions: [{ kind: 'change_account_role', expectedRevision: 3 }],
    ...overrides,
  };
}

describe('AdminRoleDirectory canonical Roles UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityReadByDirectory.current = {};
    mockAdminReads.accounts = {
      items: [
        accountRow({
          accountId: ownerId,
          displayName: 'System Owner',
          email: 'owner@example.com',
          role: { role: 'admin', systemRole: 'owner' },
          revision: 1,
          authorizedActions: [],
        }),
        accountRow({
          accountId: adminId,
          displayName: 'Ordinary Admin',
          email: 'admin@example.com',
          role: { role: 'admin' },
          revision: 2,
          authorizedActions: [{ kind: 'change_account_role', expectedRevision: 2 }],
        }),
      ],
      loading: false,
      loadingMore: false,
      hasMore: false,
      cursor: undefined,
      error: undefined,
    };
    mockAdminReads.accountDetail = {
      accountId: ownerId,
      displayName: 'System Owner',
      role: { role: 'admin', systemRole: 'owner' },
      lifecycle: 'active',
      authorizedActions: [],
    };
    mockCandidateReads.accounts = {
      items: [
        accountRow(),
        accountRow({
          accountId: adminId,
          displayName: 'Already Admin',
          email: 'admin@example.com',
          role: { role: 'admin' },
          authorizedActions: [{ kind: 'change_account_role', expectedRevision: 2 }],
        }),
        accountRow({
          accountId: ownerId,
          displayName: 'Owner Candidate',
          role: { role: 'admin', systemRole: 'owner' },
          authorizedActions: [],
        }),
        accountRow({
          accountId: statsId,
          displayName: 'School Global Stats',
          lifecycle: 'uninitialized',
          revision: undefined,
          authorizedActions: [],
        }),
        accountRow({
          accountId: uninitId,
          displayName: 'Uninitialized',
          lifecycle: 'uninitialized',
          revision: undefined,
          authorizedActions: [{ kind: 'change_account_role', expectedRevision: 1 }],
        }),
      ],
      loading: false,
      loadingMore: false,
      hasMore: true,
      cursor: 'cursor_1',
      error: undefined,
    };
    mockAdminReads.loadMore = vi.fn();
    mockAdminReads.refresh = vi.fn(async () => undefined);
    mockCandidateReads.loadMore = vi.fn();
    mockCandidateReads.refresh = vi.fn(async () => undefined);
  });

  it('lists current admins with owner badge and demote only for authorized non-owner', () => {
    const confirm = vi.fn((_message: string, onConfirm: () => void) => {
      void onConfirm();
    });
    render(<AdminRoleDirectory adminAccountId={ownerId} onRequestConfirm={confirm} />);

    expect(screen.getByText('System Owner')).toBeTruthy();
    expect(screen.getByText('Владелец')).toBeTruthy();
    expect(screen.getByText('Ordinary Admin')).toBeTruthy();
    expect(screen.getAllByText('Снять права администратора')).toHaveLength(1);

    fireEvent.click(screen.getByText('Снять права администратора'));
    expect(mockExecute).toHaveBeenCalledWith(
      ownerId,
      expect.objectContaining({
        kind: 'change_account_role',
        accountId: adminId,
        role: 'user',
        expectedRevision: 2,
      })
    );
    expect(identityReadByDirectory.current['accounts:admin:']).toMatchObject({
      directory: 'accounts',
      role: 'admin',
      search: '',
    });
  });

  it('opens Add Administrator picker with eligible candidates only and promotes via authorizedActions', async () => {
    const confirm = vi.fn((_message: string, onConfirm: () => void) => {
      void onConfirm();
    });
    render(<AdminRoleDirectory adminAccountId={ownerId} onRequestConfirm={confirm} />);

    fireEvent.click(screen.getByText('Добавить администратора'));
    expect(screen.getByText('Candidate User')).toBeTruthy();
    const unavailable = screen.getByText('School Global Stats').closest('ul');
    expect(unavailable?.textContent).toContain('Already Admin');
    expect(unavailable?.textContent).toContain('Owner Candidate');
    expect(unavailable?.textContent).toContain('Uninitialized');
    expect(screen.getAllByText(/Недоступен для назначения/).length).toBeGreaterThan(0);

    const selectableButton = screen.getByText('Candidate User').closest('button');
    expect(selectableButton).toBeTruthy();
    fireEvent.click(selectableButton as HTMLElement);
    fireEvent.click(screen.getByText('Назначить администратором'));

    expect(confirm).toHaveBeenCalled();
    expect(mockExecute).toHaveBeenCalledWith(
      ownerId,
      expect.objectContaining({
        kind: 'change_account_role',
        accountId: userId,
        role: 'admin',
        expectedRevision: 3,
      })
    );

    fireEvent.click(screen.getByText('Ещё'));
    expect(mockCandidateReads.loadMore).toHaveBeenCalled();
  });

  it('hides mutation controls for ordinary admin actor based on authorizedActions', () => {
    mockAdminReads.accounts.items = [
      accountRow({
        accountId: ownerId,
        displayName: 'System Owner',
        role: { role: 'admin', systemRole: 'owner' },
        authorizedActions: [],
      }),
      accountRow({
        accountId: adminId,
        displayName: 'Ordinary Admin',
        role: { role: 'admin' },
        authorizedActions: [],
      }),
    ];
    mockAdminReads.accountDetail = {
      accountId: adminId,
      displayName: 'Ordinary Admin',
      role: { role: 'admin' },
      lifecycle: 'active',
      authorizedActions: [],
    };
    render(<AdminRoleDirectory adminAccountId={adminId} onRequestConfirm={vi.fn()} />);
    expect(screen.getByText('System Owner')).toBeTruthy();
    expect(screen.queryByText('Добавить администратора')).toBeNull();
    expect(screen.queryByText('Снять права администратора')).toBeNull();
    expect(
      screen.getByText('Только владелец системы может назначать и снимать администраторов.')
    ).toBeTruthy();
  });

  it('opens client navigation from role row with canonical accountId and no role mutation', () => {
    render(<AdminRoleDirectory adminAccountId={ownerId} onRequestConfirm={vi.fn()} />);
    const ownerRow = screen.getByText('System Owner').closest('li');
    expect(ownerRow).toBeTruthy();
    fireEvent.click(within(ownerRow as HTMLElement).getByText('Открыть клиента'));
    expect(mockSetSearchParams).toHaveBeenCalled();
    const updater = mockSetSearchParams.mock.calls[0]?.[0] as (
      prev: URLSearchParams
    ) => URLSearchParams;
    const next = updater(new URLSearchParams('tab=people'));
    expect(next.get('tab')).toBe('people');
    expect(next.get('clientAccount')).toBe(ownerId);
    expect(mockExecute).not.toHaveBeenCalled();

    mockSetSearchParams.mockClear();
    const adminRow = screen.getByText('Ordinary Admin').closest('li');
    expect(adminRow).toBeTruthy();
    fireEvent.click(within(adminRow as HTMLElement).getByText('Открыть клиента'));
    const updaterB = mockSetSearchParams.mock.calls[0]?.[0] as (
      prev: URLSearchParams
    ) => URLSearchParams;
    const nextB = updaterB(new URLSearchParams('tab=people&clientAccount=account_stale_a'));
    expect(nextB.get('clientAccount')).toBe(adminId);
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
