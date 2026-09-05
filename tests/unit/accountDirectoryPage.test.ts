import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountIdSchema } from '@ski-academy/shared-domain';
import { loadAccountDirectoryPage } from '../../src/features/admin/identity/accountDirectorySearch';

const queryAdminIdentityReadModels = vi.fn();

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminIdentityReadModels: (...args: unknown[]) => queryAdminIdentityReadModels(...args),
}));

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

describe('loadAccountDirectoryPage', () => {
  beforeEach(() => {
    queryAdminIdentityReadModels.mockReset();
  });

  it('requests exactly one first page and never drains hasMore', async () => {
    queryAdminIdentityReadModels.mockResolvedValue({
      scope: 'admin_account_list',
      items: [accountItem('account_picker_alice_01', 'Alice Snow', 'alice@example.com')],
      hasMore: true,
      nextCursor: 'cursor-page-1',
    });

    const page = await loadAccountDirectoryPage();

    expect(queryAdminIdentityReadModels).toHaveBeenCalledTimes(1);
    expect(queryAdminIdentityReadModels).toHaveBeenCalledWith({
      scope: 'admin_account_list',
      pageSize: 20,
    });
    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('cursor-page-1');
  });

  it('passes server search and cursor for explicit follow-up pages', async () => {
    queryAdminIdentityReadModels.mockResolvedValue({
      scope: 'admin_account_list',
      items: [accountItem('account_picker_bob_02', 'Bob Carve', 'bob@school.test')],
      hasMore: false,
    });

    const page = await loadAccountDirectoryPage({
      search: 'Bob',
      cursor: 'cursor-page-1',
      pageSize: 50,
    });

    expect(queryAdminIdentityReadModels).toHaveBeenCalledTimes(1);
    expect(queryAdminIdentityReadModels).toHaveBeenCalledWith({
      scope: 'admin_account_list',
      pageSize: 50,
      search: 'Bob',
      cursor: 'cursor-page-1',
    });
    expect(page.items.map((item) => item.accountId)).toEqual([
      AccountIdSchema.parse('account_picker_bob_02'),
    ]);
  });

  it('filters disabled Accounts client-side while keeping uninitialized', async () => {
    queryAdminIdentityReadModels.mockResolvedValue({
      scope: 'admin_account_list',
      items: [
        {
          ...accountItem('account_picker_alice_01', 'Alice', 'a@x.test'),
          lifecycle: 'uninitialized',
        },
        { ...accountItem('account_picker_bob_02', 'Bob', 'b@x.test'), lifecycle: 'disabled' },
      ],
      hasMore: false,
    });

    const page = await loadAccountDirectoryPage();
    expect(page.items.map((item) => item.displayName)).toEqual(['Alice']);
  });
});
