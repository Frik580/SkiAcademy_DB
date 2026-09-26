import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  GUEST_CALLABLE_APP_CHECK_OPTIONS,
  assertGuestCallableAppCheck,
  guestCallableAppCheckEnforced,
} from './guestCallableProtection';

describe('guest callable App Check', () => {
  it('requires attestation outside the Functions emulator', () => {
    expect(guestCallableAppCheckEnforced({ FUNCTIONS_EMULATOR: 'true' })).toBe(false);
    expect(guestCallableAppCheckEnforced({})).toBe(true);
    expect(() => assertGuestCallableAppCheck({ app: undefined }, true)).toThrow(HttpsError);
    expect(() => assertGuestCallableAppCheck({ app: undefined }, false)).not.toThrow();
    expect(() =>
      assertGuestCallableAppCheck(
        { app: { appId: 'app', token: 'token', alreadyConsumed: true } },
        true
      )
    ).toThrow(HttpsError);
    expect(() =>
      assertGuestCallableAppCheck({ app: { appId: 'app', token: 'token' } }, true)
    ).not.toThrow();
  });

  it('binds enforceAppCheck and token consumption only to the guest command callable', () => {
    expect(GUEST_CALLABLE_APP_CHECK_OPTIONS).toEqual({
      enforceAppCheck: true,
      consumeAppCheckToken: true,
    });
    const indexSource = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../index.ts'),
      'utf8'
    );
    const guestExport = indexSource.slice(
      indexSource.indexOf('export const executeGuestCanonicalCommand')
    );
    const guestBlock = guestExport.slice(
      0,
      guestExport.indexOf('export const', 'export const'.length)
    );
    expect(guestBlock).toContain('GUEST_PUBLIC_CALLABLE_OPTIONS');
    expect(indexSource).toContain('...GUEST_CALLABLE_APP_CHECK_OPTIONS');
    expect(indexSource).not.toContain(
      'export const executeCanonicalCommand = onCall(GUEST_PUBLIC_CALLABLE_OPTIONS'
    );
  });
});
