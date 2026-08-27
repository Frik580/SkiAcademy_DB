import { describe, expect, it } from 'vitest';
import { AccountIdSchema } from '@ski-academy/shared-domain';
import {
  resolveCallableAccountContext,
  isAdministratorProfile,
} from './resolveCallableAccountContext';

describe('resolveCallableAccountContext', () => {
  const accountId = AccountIdSchema.parse('account_resolve_callable_01');

  it('derives account identity from auth uid', () => {
    const resolved = resolveCallableAccountContext({ role: 'user' }, {
      authUid: accountId,
      commandKind: 'complete_booking',
      exercisedCapability: 'account_owner',
    });
    expect(resolved.accountId).toBe(accountId);
    expect(resolved.capability).toBe('account_owner');
    expect(resolved.source).toBe('client_callable');
  });

  it('rejects administrator capability spoofing from client transport', () => {
    expect(() =>
      resolveCallableAccountContext({ role: 'user' }, {
        authUid: accountId,
        commandKind: 'complete_booking',
        exercisedCapability: 'administrator',
      })
    ).toThrow('forbidden_capability');
  });

  it('upgrades administrator command kinds only for admin profiles', () => {
    const resolved = resolveCallableAccountContext({ role: 'admin' }, {
      authUid: accountId,
      commandKind: 'confirm_guest_booking',
    });
    expect(resolved.capability).toBe('administrator');
    expect(resolved.source).toBe('admin_callable');

    expect(() =>
      resolveCallableAccountContext({ role: 'user' }, {
        authUid: accountId,
        commandKind: 'confirm_guest_booking',
      })
    ).toThrow('forbidden');
  });

  it('detects administrator profile from trusted user document fields', () => {
    expect(isAdministratorProfile({ role: 'admin' })).toBe(true);
    expect(isAdministratorProfile({ role: 'user' })).toBe(false);
  });
});
