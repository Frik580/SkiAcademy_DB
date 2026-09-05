import { describe, expect, it } from 'vitest';
import { AccountIdSchema } from '@ski-academy/shared-domain';
import {
  accountDirectoryOptionFromClient,
  filterAccountDirectoryBySearch,
  isBookableAccountLifecycle,
  mergeAccountDirectoryOptions,
  visibleAccountDirectoryOptions,
  type AccountDirectoryOption,
} from '../../src/features/admin/identity/accountDirectorySearch';

const alice: AccountDirectoryOption = {
  accountId: AccountIdSchema.parse('account_picker_alice_01'),
  displayName: 'Alice Snow',
  email: 'alice@example.com',
};
const bob: AccountDirectoryOption = {
  accountId: AccountIdSchema.parse('account_picker_bob_02'),
  displayName: 'Bob Carve',
  email: 'bob@school.test',
};
const directory = [alice, bob];

describe('filterAccountDirectoryBySearch', () => {
  it('returns the full directory when search is empty', () => {
    expect(filterAccountDirectoryBySearch(directory, '')).toEqual(directory);
    expect(filterAccountDirectoryBySearch(directory, '   ')).toEqual(directory);
  });

  it('matches ID, email, and name substrings without requiring a prefix', () => {
    expect(filterAccountDirectoryBySearch(directory, 'bob_02')).toEqual([bob]);
    expect(filterAccountDirectoryBySearch(directory, 'SCHOOL')).toEqual([bob]);
    expect(filterAccountDirectoryBySearch(directory, 'snow')).toEqual([alice]);
  });
});

describe('visibleAccountDirectoryOptions', () => {
  it('keeps the selected Account visible even when it misses the current filter', () => {
    expect(visibleAccountDirectoryOptions(directory, 'alice', bob.accountId)).toEqual([alice, bob]);
  });
});

describe('bookable Account directory', () => {
  it('includes uninitialized clients and excludes disabled Accounts', () => {
    expect(isBookableAccountLifecycle('active')).toBe(true);
    expect(isBookableAccountLifecycle('uninitialized')).toBe(true);
    expect(isBookableAccountLifecycle('disabled')).toBe(false);
  });

  it('maps the Planner client directory onto Account options', () => {
    const option = accountDirectoryOptionFromClient({
      uid: 'account_picker_carol_03',
      displayName: 'Carol Edge',
      email: 'carol@example.com',
    });
    expect(option).toEqual({
      accountId: AccountIdSchema.parse('account_picker_carol_03'),
      displayName: 'Carol Edge',
      email: 'carol@example.com',
    });
    expect(
      accountDirectoryOptionFromClient({
        uid: 'account_picker_disabled_04',
        displayName: 'Disabled',
        isClientActive: false,
      })
    ).toBeUndefined();
  });

  it('merges identity Accounts with the already loaded client directory', () => {
    const fromClients: AccountDirectoryOption = {
      accountId: AccountIdSchema.parse('account_picker_carol_03'),
      displayName: 'Carol Edge',
      email: 'carol@example.com',
    };
    expect(mergeAccountDirectoryOptions([fromClients], directory)).toEqual([
      alice,
      bob,
      fromClients,
    ]);
  });
});
