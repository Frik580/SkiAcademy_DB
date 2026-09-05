import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  type AdminEligibleParticipantItem,
} from '@ski-academy/shared-domain';
import { ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS } from '../../src/features/admin/identity/accountDirectorySearch';

const queryAdminIdentityReadModels = vi.fn();
const useAdminEligibleParticipants = vi.fn(() => ({
  items: [] as readonly AdminEligibleParticipantItem[],
  loading: false,
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminIdentityReadModels: (...args: unknown[]) => queryAdminIdentityReadModels(...args),
}));

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}));

vi.mock('../../src/features/admin/identity/useAdminIdentityReadModels', () => ({
  useAdminEligibleParticipants: (...args: unknown[]) => useAdminEligibleParticipants(...args),
}));

import { AdminManagedParticipantPicker } from '../../src/features/admin/identity/AdminManagedParticipantPicker';

const aliceId = AccountIdSchema.parse('account_picker_alice_01');
const bobId = AccountIdSchema.parse('account_picker_bob_02');

function accountItem(accountId: string, displayName: string, email: string) {
  return {
    accountId,
    displayName,
    email,
    lifecycle: 'active' as const,
    role: { role: 'user' as const },
    managedParticipantCount: 1,
    instructorLink: { isInstructor: false },
    diagnosticCount: 0,
    authorizedActions: [],
  };
}

function eligibleItem(
  suffix: string,
  authority: 'self' | 'parent_guardian'
): AdminEligibleParticipantItem {
  return {
    participantId: ParticipantIdSchema.parse(`participant_picker_${suffix}`),
    participantManagementId: ParticipantManagementIdSchema.parse(`management_picker_${suffix}`),
    displayName: suffix,
    authority,
    revision: 1,
    lifecycle: 'active',
  };
}

describe('AdminManagedParticipantPicker account search', () => {
  beforeEach(() => {
    queryAdminIdentityReadModels.mockReset();
    useAdminEligibleParticipants.mockReset();
    useAdminEligibleParticipants.mockReturnValue({ items: [], loading: false });
    queryAdminIdentityReadModels.mockResolvedValue({
      scope: 'admin_account_list',
      items: [
        accountItem(aliceId, 'Alice Snow', 'alice@example.com'),
        accountItem(bobId, 'Bob Carve', 'bob@school.test'),
      ],
      hasMore: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads at most one first page when the Account search is empty', async () => {
    render(<AdminManagedParticipantPicker onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Alice Snow/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: /Bob Carve/ })).toBeInTheDocument();
    expect(queryAdminIdentityReadModels).toHaveBeenCalledTimes(1);
    expect(queryAdminIdentityReadModels).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'admin_account_list',
      })
    );
    expect(queryAdminIdentityReadModels.mock.calls[0]?.[0]?.search).toBeUndefined();
    expect(queryAdminIdentityReadModels.mock.calls[0]?.[0]?.cursor).toBeUndefined();
  });

  it('does not auto-drain remaining Account pages; Load more fetches exactly one next page', async () => {
    queryAdminIdentityReadModels
      .mockResolvedValueOnce({
        scope: 'admin_account_list',
        items: [accountItem(aliceId, 'Alice Snow', 'alice@example.com')],
        hasMore: true,
        nextCursor: 'account-list-cursor-1',
      })
      .mockResolvedValueOnce({
        scope: 'admin_account_list',
        items: [accountItem(bobId, 'Bob Carve', 'bob@school.test')],
        hasMore: false,
      });
    render(<AdminManagedParticipantPicker onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Alice Snow/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole('option', { name: /Bob Carve/ })).not.toBeInTheDocument();
    expect(queryAdminIdentityReadModels).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Bob Carve/ })).toBeInTheDocument();
    });
    expect(queryAdminIdentityReadModels).toHaveBeenCalledTimes(2);
    expect(queryAdminIdentityReadModels).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        scope: 'admin_account_list',
        cursor: 'account-list-cursor-1',
      })
    );
  });

  it('runs one server search first page after debounce and drops stale rapid queries', async () => {
    queryAdminIdentityReadModels
      .mockResolvedValueOnce({
        scope: 'admin_account_list',
        items: [accountItem(aliceId, 'Alice Snow', 'alice@example.com')],
        hasMore: false,
      })
      .mockResolvedValueOnce({
        scope: 'admin_account_list',
        items: [accountItem(bobId, 'Bob Carve', 'bob@school.test')],
        hasMore: false,
      });

    render(<AdminManagedParticipantPicker onChange={vi.fn()} />);
    await waitFor(() => {
      expect(queryAdminIdentityReadModels).toHaveBeenCalledTimes(1);
    });

    vi.useFakeTimers();
    const searchBox = screen.getByRole('textbox', { name: 'Account for participant selection' });
    fireEvent.change(searchBox, { target: { value: 'a' } });
    fireEvent.change(searchBox, { target: { value: 'ab' } });
    fireEvent.change(searchBox, { target: { value: 'bob' } });

    await act(async () => {
      vi.advanceTimersByTime(ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS - 1);
    });
    expect(queryAdminIdentityReadModels).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(queryAdminIdentityReadModels).toHaveBeenCalledTimes(2);
    });
    expect(queryAdminIdentityReadModels).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: 'admin_account_list',
        search: 'bob',
      })
    );
    expect(screen.getByRole('option', { name: /Bob Carve/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Alice Snow/ })).not.toBeInTheDocument();
  });

  it('restores the first directory page immediately when search is cleared', async () => {
    queryAdminIdentityReadModels
      .mockResolvedValueOnce({
        scope: 'admin_account_list',
        items: [
          accountItem(aliceId, 'Alice Snow', 'alice@example.com'),
          accountItem(bobId, 'Bob Carve', 'bob@school.test'),
        ],
        hasMore: false,
      })
      .mockResolvedValueOnce({
        scope: 'admin_account_list',
        items: [accountItem(bobId, 'Bob Carve', 'bob@school.test')],
        hasMore: false,
      })
      .mockResolvedValueOnce({
        scope: 'admin_account_list',
        items: [
          accountItem(aliceId, 'Alice Snow', 'alice@example.com'),
          accountItem(bobId, 'Bob Carve', 'bob@school.test'),
        ],
        hasMore: false,
      });

    render(<AdminManagedParticipantPicker onChange={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Alice Snow/ })).toBeInTheDocument();
    });

    vi.useFakeTimers();
    const searchBox = screen.getByRole('textbox', { name: 'Account for participant selection' });
    fireEvent.change(searchBox, { target: { value: 'bob' } });
    await act(async () => {
      vi.advanceTimersByTime(ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: /Alice Snow/ })).not.toBeInTheDocument();
    });

    fireEvent.change(searchBox, { target: { value: '' } });
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Alice Snow/ })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: /Bob Carve/ })).toBeInTheDocument();
    expect(queryAdminIdentityReadModels).toHaveBeenCalledTimes(3);
  });

  it('shows uninitialized identity Accounts and Planner clients missing from the active identity page', async () => {
    const carolId = AccountIdSchema.parse('account_picker_carol_03');
    queryAdminIdentityReadModels.mockResolvedValue({
      scope: 'admin_account_list',
      items: [
        { ...accountItem(aliceId, 'Alice Snow', 'alice@example.com'), lifecycle: 'uninitialized' },
        { ...accountItem(bobId, 'Bob Carve', 'bob@school.test'), lifecycle: 'disabled' },
      ],
      hasMore: false,
    });
    render(
      <AdminManagedParticipantPicker
        onChange={vi.fn()}
        additionalAccounts={[
          {
            accountId: carolId,
            displayName: 'Carol Edge',
            email: 'carol@example.com',
          },
        ]}
      />
    );
    expect(screen.getByRole('option', { name: /Carol Edge/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Alice Snow/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole('option', { name: /Bob Carve/ })).not.toBeInTheDocument();
  });
});

describe('AdminManagedParticipantPicker self default and visibility', () => {
  beforeEach(() => {
    queryAdminIdentityReadModels.mockReset();
    useAdminEligibleParticipants.mockReset();
    queryAdminIdentityReadModels.mockResolvedValue({
      scope: 'admin_account_list',
      items: [accountItem(aliceId, 'Alice Snow', 'alice@example.com')],
      hasMore: false,
    });
  });

  it('defaults to self and hides the managed-participant field when self is the only option', async () => {
    const self = eligibleItem('self', 'self');
    useAdminEligibleParticipants.mockReturnValue({ items: [self], loading: false });
    const onChange = vi.fn();
    const onReadyChange = vi.fn();

    const { rerender } = render(
      <AdminManagedParticipantPicker
        onChange={onChange}
        autoSelectUniqueSelf
        onReadyChange={onReadyChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Alice Snow/ })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Select an Account first' }), {
      target: { value: aliceId },
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: aliceId,
          participantId: self.participantId,
        })
      );
    });

    const selected = onChange.mock.calls.find(
      (call) => call[0]?.participantId === self.participantId
    )?.[0];
    rerender(
      <AdminManagedParticipantPicker
        selected={selected}
        onChange={onChange}
        autoSelectUniqueSelf
        onReadyChange={onReadyChange}
      />
    );

    expect(
      screen.queryByRole('combobox', { name: 'Account-managed participants' })
    ).not.toBeInTheDocument();
    expect(onReadyChange).toHaveBeenCalledWith(true);
  });

  it('defaults to self but keeps the field when other managed participants exist', async () => {
    const self = eligibleItem('self', 'self');
    const dependent = eligibleItem('child', 'parent_guardian');
    useAdminEligibleParticipants.mockReturnValue({
      items: [dependent, self],
      loading: false,
    });
    const onChange = vi.fn();

    const { rerender } = render(
      <AdminManagedParticipantPicker onChange={onChange} autoSelectUniqueSelf />
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Alice Snow/ })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Select an Account first' }), {
      target: { value: aliceId },
    });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          participantId: self.participantId,
        })
      );
    });

    const selected = onChange.mock.calls.find(
      (call) => call[0]?.participantId === self.participantId
    )?.[0];
    rerender(
      <AdminManagedParticipantPicker selected={selected} onChange={onChange} autoSelectUniqueSelf />
    );

    expect(
      screen.getByRole('combobox', { name: 'Account-managed participants' })
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /child · parent_guardian/ })).toBeInTheDocument();
  });

  it('reports ready for an Account with no eligible participants so planner can provision self', async () => {
    useAdminEligibleParticipants.mockReturnValue({ items: [], loading: false });
    const onReadyChange = vi.fn();

    render(
      <AdminManagedParticipantPicker
        onChange={vi.fn()}
        autoSelectUniqueSelf
        onReadyChange={onReadyChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Alice Snow/ })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox', { name: 'Select an Account first' }), {
      target: { value: aliceId },
    });

    await waitFor(() => {
      expect(onReadyChange).toHaveBeenCalledWith(true);
    });
    expect(
      screen.getByRole('combobox', { name: 'Account-managed participants' })
    ).toBeInTheDocument();
  });
});
