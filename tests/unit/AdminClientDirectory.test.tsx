import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
} from '@ski-academy/shared-domain';

const {
  mockReads,
  mockParticipant,
  mockWallet,
  mockExecute,
  mockSetSearchParams,
  identityReadInput,
  searchParamsHolder,
} = vi.hoisted(() => ({
  mockReads: {
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
    participantDetail: undefined as Record<string, unknown> | undefined,
    instructorDetail: undefined,
    detailLoading: false,
    detailError: undefined as 'permission-denied' | 'read-failed' | undefined,
    loadMore: vi.fn(),
    refresh: vi.fn(async () => undefined),
  },
  mockParticipant: {
    item: undefined as Record<string, unknown> | undefined,
    loading: false,
    error: undefined as 'permission-denied' | 'read-failed' | undefined,
    refresh: vi.fn(async () => undefined),
  },
  mockWallet: {
    item: undefined as Record<string, unknown> | undefined,
    loading: false,
    error: undefined as 'permission-denied' | 'read-failed' | undefined,
    refetch: vi.fn(),
  },
  mockExecute: vi.fn(async () => undefined),
  mockSetSearchParams: vi.fn(),
  identityReadInput: { current: {} as Record<string, unknown> },
  searchParamsHolder: {
    params: new URLSearchParams('tab=people&payment=payment_stale'),
  },
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [searchParamsHolder.params, mockSetSearchParams],
  };
});
vi.mock('../../src/features/admin/identity/useAdminIdentityReadModels', () => ({
  useAdminIdentityReadModels: (input: Record<string, unknown>) => {
    identityReadInput.current = input;
    return mockReads;
  },
  useAdminParticipantDetail: () => mockParticipant,
}));

vi.mock('../../src/features/admin/components/finance/useAdminFinanceReadModels', () => ({
  useAdminWalletReadModel: () => mockWallet,
}));

vi.mock('../../src/features/admin/identity/useAdminIdentityCommands', () => ({
  executeAdminIdentityAttempt: (...args: unknown[]) => mockExecute(...args),
}));

import { AdminClientDirectory } from '../../src/features/admin/people/AdminClientDirectory';

const adminId = AccountIdSchema.parse('account_admin_client_dir_01');
const familyId = AccountIdSchema.parse('account_family_client_dir_01');
const selfId = ParticipantIdSchema.parse('participant_self_client_dir_01');
const childId = ParticipantIdSchema.parse('participant_child_client_dir_01');
const managementSelf = ParticipantManagementIdSchema.parse('management_self_client_dir_01');
const managementChild = ParticipantManagementIdSchema.parse('management_child_client_dir_01');

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    accountId: familyId,
    displayName: 'Ivan Petrov',
    email: 'ivan@example.com',
    lifecycle: 'active',
    role: { role: 'user' },
    managedParticipantCount: 2,
    instructorLink: { isInstructor: false },
    diagnosticCount: 0,
    revision: 1,
    authorizedActions: [
      { kind: 'disable_account', expectedRevision: 1 },
      { kind: 'update_account_contact_as_administrator', expectedRevision: 1 },
      { kind: 'create_managed_dependent_participant', expectedRevision: 1 },
    ],
    ...overrides,
  };
}

describe('AdminClientDirectory canonical identity UX', () => {
  beforeEach(() => {
    searchParamsHolder.params = new URLSearchParams('tab=people&payment=payment_stale');
    mockReads.accounts = {
      items: [accountRow()],
      loading: false,
      loadingMore: false,
      hasMore: false,
      cursor: undefined,
      error: undefined,
    };
    mockReads.accountDetail = undefined;
    mockReads.detailLoading = false;
    mockReads.detailError = undefined;
    mockReads.loadMore.mockReset();
    mockReads.refresh.mockClear();
    mockParticipant.item = undefined;
    mockParticipant.loading = false;
    mockParticipant.error = undefined;
    mockWallet.item = undefined;
    mockWallet.loading = false;
    mockExecute.mockClear();
    mockSetSearchParams.mockClear();
  });

  it('renders canonical account rows without skier conflation or balanceUSD', () => {
    const { container } = render(<AdminClientDirectory adminAccountId={adminId} />);
    expect(screen.getByText('Ivan Petrov')).toBeInTheDocument();
    expect(screen.getByText('ivan@example.com')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Skier|balanceUSD|\$/);
    expect(
      screen.queryByRole('button', { name: /create account|create client/i })
    ).not.toBeInTheDocument();
    expect(identityReadInput.current).toMatchObject({
      directory: 'accounts',
      enabled: true,
    });
  });

  it('uses canonical server search and resets the list query when the query changes', async () => {
    vi.useFakeTimers();
    render(<AdminClientDirectory adminAccountId={adminId} />);
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Search clients'), {
        target: { value: 'ivan@example.com' },
      });
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(identityReadInput.current.search).toBe('ivan@example.com');
    fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: '' } });
    expect(identityReadInput.current.search).toBe('');
    vi.useRealTimers();
  });

  it('paginates with load more and keeps the first page rows', async () => {
    mockReads.accounts.hasMore = true;
    mockReads.accounts.cursor = 'cursor-1';
    mockReads.loadMore.mockImplementation(() => {
      mockReads.accounts = {
        ...mockReads.accounts,
        items: [
          accountRow(),
          accountRow({
            accountId: AccountIdSchema.parse('account_family_client_dir_02'),
            displayName: 'Second Client',
            email: 'second@example.com',
            managedParticipantCount: 1,
          }),
        ],
        hasMore: false,
      };
    });
    const { rerender } = render(<AdminClientDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    rerender(<AdminClientDirectory adminAccountId={adminId} />);
    expect(mockReads.loadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Ivan Petrov')).toBeInTheDocument();
    expect(screen.getByText('Second Client')).toBeInTheDocument();
  });

  it('shows self and dependent participants with human-readable relationships', async () => {
    mockReads.accountDetail = {
      ...accountRow(),
      phoneNumber: '+77010000000',
      managedParticipants: [
        {
          participantId: selfId,
          participantManagementId: managementSelf,
          displayName: 'Ivan Petrov',
          authority: 'self',
          lifecycle: 'active',
          revision: 1,
          skillLevel: 'intermediate',
          discipline: 'ski',
        },
        {
          participantId: childId,
          participantManagementId: managementChild,
          displayName: 'Masha Petrova',
          authority: 'parent_guardian',
          lifecycle: 'active',
          revision: 1,
          skillLevel: 'beginner',
          discipline: 'ski',
          age: { kind: 'birth_date', birthDate: '2016-06-01' },
        },
      ],
      diagnostics: [],
    };
    render(<AdminClientDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText(/Self/)).toBeInTheDocument();
    expect(screen.getByText(/Parent \/ guardian/)).toBeInTheDocument();
    expect(screen.getByText('Masha Petrova')).toBeInTheDocument();
    expect(screen.getAllByText(/Participant skill level/).length).toBeGreaterThan(0);
  });

  it('persists contact edits through the canonical admin command and keeps email read-only', async () => {
    mockReads.accountDetail = {
      ...accountRow(),
      phoneNumber: '+77010000000',
      managedParticipants: [],
      diagnostics: [],
    };
    render(<AdminClientDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit contact' }));
    fireEvent.change(screen.getByLabelText('Name', { selector: '#admin-client-display-name' }), {
      target: { value: 'Ivan Updated' },
    });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+77019999999' } });
    expect(screen.getByLabelText('Email')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save contact' }));
    await waitFor(() => expect(mockExecute).toHaveBeenCalled());
    expect(mockExecute.mock.calls[0]?.[1]).toMatchObject({
      kind: 'update_account_contact_as_administrator',
      displayName: 'Ivan Updated',
      phoneNumber: '+77019999999',
    });
    expect(JSON.stringify(mockExecute.mock.calls[0]?.[1])).not.toContain('email');
  });

  it('does not show a synthetic zero wallet when the canonical wallet is absent', () => {
    mockReads.accountDetail = {
      ...accountRow(),
      managedParticipants: [],
      diagnostics: [],
    };
    mockWallet.item = {
      accountId: familyId,
      exists: false,
      balance: 0,
      currency: 'KZT',
      accountStatus: 'active',
    };
    render(<AdminClientDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('admin-client-wallet-missing')).toHaveTextContent(
      'Wallet is not created'
    );
    expect(screen.queryByTestId('admin-client-wallet-balance')).not.toBeInTheDocument();
  });

  it('shows canonical KZT wallet summary and opens Finance on the same account', () => {
    mockReads.accountDetail = {
      ...accountRow(),
      managedParticipants: [],
      diagnostics: [],
    };
    mockWallet.item = {
      accountId: familyId,
      exists: true,
      balance: 25_000,
      currency: 'KZT',
      accountStatus: 'active',
    };
    render(<AdminClientDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByTestId('admin-client-wallet-balance').textContent).toMatch(/25.?000/);
    fireEvent.click(screen.getByRole('button', { name: 'Open Finance' }));
    expect(mockSetSearchParams).toHaveBeenCalled();
    const updater = mockSetSearchParams.mock.calls[0]?.[0] as (
      prev: URLSearchParams
    ) => URLSearchParams;
    const next = updater(new URLSearchParams('tab=people&payment=payment_stale&movement=move_1'));
    expect(next.get('tab')).toBe('finance');
    expect(next.get('account')).toBe(familyId);
    expect(next.get('payment')).toBeNull();
    expect(next.get('movement')).toBeNull();
  });

  it('edits participant skillLevel through update_participant_profile', async () => {
    mockReads.accountDetail = {
      ...accountRow(),
      managedParticipants: [
        {
          participantId: selfId,
          participantManagementId: managementSelf,
          displayName: 'Ivan Petrov',
          authority: 'self',
          lifecycle: 'active',
          revision: 1,
          skillLevel: 'beginner',
        },
      ],
      diagnostics: [],
    };
    mockParticipant.item = {
      participantId: selfId,
      displayName: 'Ivan Petrov',
      classification: 'self',
      lifecycle: 'active',
      profile: {
        displayName: 'Ivan Petrov',
        age: { kind: 'age_years', years: 34 },
        skillLevel: 'beginner',
        discipline: 'ski',
      },
      managers: [
        {
          accountId: familyId,
          participantManagementId: managementSelf,
          displayName: 'Ivan Petrov',
          authority: 'self',
          managementRevision: 1,
        },
      ],
      authorizedActions: [{ kind: 'update_participant_profile', expectedRevision: 4 }],
      archiveBlockedByCommitments: false,
      revision: 4,
    };
    render(<AdminClientDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open participant' }));
    fireEvent.change(screen.getByLabelText('Participant skill level'), {
      target: { value: 'advanced' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save participant' }));
    await waitFor(() => expect(mockExecute).toHaveBeenCalled());
    expect(mockExecute.mock.calls[0]?.[1]).toMatchObject({
      kind: 'update_participant_profile',
      skillLevel: 'advanced',
      participantId: selfId,
    });
    expect(JSON.stringify(mockExecute.mock.calls[0]?.[1])).not.toContain('difficulty');
  });

  it('keeps identity boundary mutations out of the Clients surface', () => {
    mockReads.accountDetail = {
      ...accountRow(),
      managedParticipants: [],
      diagnostics: [],
    };
    render(<AdminClientDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(
      screen.queryByText(/Promote|Demote|Grant instructor|Guest Link|Create Account|Delete/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /record_manual_wallet_funding|Complete|Cancel/i })
    ).not.toBeInTheDocument();
  });

  it('closes Account detail from the detail panel close control', async () => {
    mockReads.accountDetail = {
      ...accountRow(),
      managedParticipants: [],
      diagnostics: [],
    };
    render(<AdminClientDirectory adminAccountId={adminId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByText('Edit contact')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close detail' }));
    expect(screen.queryByText('Edit contact')).not.toBeInTheDocument();
    expect(identityReadInput.current.selectedAccountId).toBeUndefined();
  });

  it('opens Account detail from clientAccount deep-link without mutation', async () => {
    mockReads.accountDetail = {
      ...accountRow(),
      managedParticipants: [],
      diagnostics: [],
    };
    searchParamsHolder.params = new URLSearchParams(`tab=people&clientAccount=${familyId}`);
    render(<AdminClientDirectory adminAccountId={adminId} />);
    await waitFor(() => {
      expect(identityReadInput.current.selectedAccountId).toBe(familyId);
    });
    expect(screen.getByText('Edit contact')).toBeInTheDocument();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockSetSearchParams).toHaveBeenCalled();
    const updater = mockSetSearchParams.mock.calls[0]?.[0] as (
      prev: URLSearchParams
    ) => URLSearchParams;
    const cleared = updater(new URLSearchParams(`tab=people&clientAccount=${familyId}`));
    expect(cleared.get('clientAccount')).toBeNull();
    expect(cleared.get('tab')).toBe('people');
  });

  it('deep-link Account B replaces stale Account A selection', async () => {
    const accountB = AccountIdSchema.parse('account_family_client_dir_02');
    mockReads.accounts.items = [
      accountRow(),
      accountRow({
        accountId: accountB,
        displayName: 'Second Client',
        email: 'second@example.com',
      }),
    ];
    mockReads.accountDetail = {
      ...accountRow(),
      managedParticipants: [],
      diagnostics: [],
    };
    searchParamsHolder.params = new URLSearchParams(`tab=people&clientAccount=${familyId}`);
    const { rerender } = render(<AdminClientDirectory adminAccountId={adminId} />);
    await waitFor(() => {
      expect(identityReadInput.current.selectedAccountId).toBe(familyId);
    });

    mockReads.accountDetail = {
      ...accountRow({
        accountId: accountB,
        displayName: 'Second Client',
        email: 'second@example.com',
      }),
      managedParticipants: [],
      diagnostics: [],
    };
    searchParamsHolder.params = new URLSearchParams(`tab=people&clientAccount=${accountB}`);
    rerender(<AdminClientDirectory adminAccountId={adminId} />);
    await waitFor(() => {
      expect(identityReadInput.current.selectedAccountId).toBe(accountB);
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });
});
