import {
  ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_DEFAULT,
  ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_MAX,
  AccountIdSchema,
  type AccountId,
} from '@ski-academy/shared-domain';
import { queryAdminIdentityReadModels } from '../../../lib/canonical/canonicalReadModelClient';

export const ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS = 1000;

export interface AccountDirectoryOption {
  readonly accountId: AccountId;
  readonly displayName: string;
  readonly email?: string;
}

export interface AccountDirectoryPage {
  readonly items: readonly AccountDirectoryOption[];
  readonly hasMore: boolean;
  readonly nextCursor?: string;
}

export function isBookableAccountLifecycle(
  lifecycle: 'active' | 'disabled' | 'uninitialized'
): boolean {
  return lifecycle === 'active' || lifecycle === 'uninitialized';
}

export function accountDirectoryOptionFromClient(input: {
  readonly uid: string;
  readonly displayName?: string;
  readonly email?: string;
  readonly isClientActive?: boolean;
}): AccountDirectoryOption | undefined {
  if (input.isClientActive === false) return undefined;
  const parsed = AccountIdSchema.safeParse(input.uid);
  if (!parsed.success) return undefined;
  const displayName = input.displayName?.trim() || input.email?.trim() || parsed.data;
  return {
    accountId: parsed.data,
    displayName,
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
  };
}

export function mergeAccountDirectoryOptions(
  ...groups: readonly (readonly AccountDirectoryOption[] | undefined)[]
): AccountDirectoryOption[] {
  const byId = new Map<string, AccountDirectoryOption>();
  for (const group of groups) {
    for (const item of group ?? []) {
      const existing = byId.get(item.accountId);
      if (!existing) {
        byId.set(item.accountId, item);
        continue;
      }
      byId.set(item.accountId, {
        accountId: item.accountId,
        displayName: existing.displayName || item.displayName,
        ...(existing.email || item.email ? { email: existing.email ?? item.email } : {}),
      });
    }
  }
  return [...byId.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
}

export function filterAccountDirectoryBySearch(
  items: readonly AccountDirectoryOption[],
  search: string
): AccountDirectoryOption[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) => {
    const email = item.email ?? '';
    return (
      item.accountId.toLowerCase().includes(needle) ||
      item.displayName.toLowerCase().includes(needle) ||
      email.toLowerCase().includes(needle)
    );
  });
}

export function visibleAccountDirectoryOptions(
  items: readonly AccountDirectoryOption[],
  search: string,
  selectedAccountId: AccountId | undefined
): AccountDirectoryOption[] {
  const filtered = filterAccountDirectoryBySearch(items, search);
  if (!selectedAccountId) return filtered;
  if (filtered.some((item) => item.accountId === selectedAccountId)) return filtered;
  const selected = items.find((item) => item.accountId === selectedAccountId);
  return selected ? [...filtered, selected] : filtered;
}

function pageSizeOf(pageSize?: number): number {
  if (pageSize === undefined) return ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_DEFAULT;
  return Math.min(Math.max(1, pageSize), ADMIN_IDENTITY_READ_MODEL_PAGE_SIZE_MAX);
}

/**
 * One bounded admin_account_list page. Never drains pages.
 * Server search covers displayName prefix, exact email, phone, and accountId.
 */
export async function loadAccountDirectoryPage(
  input: {
    readonly search?: string;
    readonly cursor?: string;
    readonly pageSize?: number;
  } = {}
): Promise<AccountDirectoryPage> {
  const search = input.search?.trim();
  const result = await queryAdminIdentityReadModels({
    scope: 'admin_account_list',
    pageSize: pageSizeOf(input.pageSize),
    ...(search ? { search } : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
  });
  if (result.scope !== 'admin_account_list') {
    return { items: [], hasMore: false };
  }
  const items: AccountDirectoryOption[] = [];
  for (const item of result.items) {
    if (!isBookableAccountLifecycle(item.lifecycle)) continue;
    items.push({
      accountId: item.accountId,
      displayName: item.displayName,
      ...(item.email ? { email: item.email } : {}),
    });
  }
  return {
    items,
    hasMore: result.hasMore,
    ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
  };
}
