import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { tokenPrincipal, identityVerifier } = require('../../scripts/data-reset/adcIdentity.cjs');
const {
  assertMutation,
  assertStagingTarget,
  authorize,
  TTL,
} = require('../../scripts/data-reset/authorization.cjs');
const { parseArguments } = require('../../scripts/data-reset/cli.cjs');
const target = {
  projectId: 'ski-school-staging',
  databaseId: '(default)',
  entrypoint: 'staging',
  storageBucket: 'ski-school-staging.firebasestorage.app',
};
const identity = {
  projectId: target.projectId,
  databaseId: '(default)',
  settingsHost: 'firestore.googleapis.com',
  storageEndpoint: 'https://storage.googleapis.com',
};
const emptyEnv = {
  FIRESTORE_EMULATOR_HOST: '',
  FIREBASE_AUTH_EMULATOR_HOST: '',
  FIREBASE_STORAGE_EMULATOR_HOST: '',
  STORAGE_EMULATOR_HOST: '',
};
const info = {
  sub: 'google-subject',
  email: 'operator@example.test',
  email_verified: 'true',
  expires_in: '3600',
};
const response = (body = info) => ({ ok: true, json: async () => body });

describe('staging reset authorization security', () => {
  it('uses Google introspection of actual access tokens without tokens in URLs/evidence', async () => {
    const request = vi.fn(async () => response());
    const principal = await tokenPrincipal('private-token', request);
    expect(principal).toMatch(/^[a-f0-9]{64}$/);
    expect(principal).not.toContain(info.email);
    expect(request.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/tokeninfo');
    expect(JSON.stringify(request.mock.calls[0][0])).not.toContain('private-token');
  });
  it.each([
    { ...info, sub: undefined },
    { ...info, email_verified: false },
    { ...info, email: undefined },
    { ...info, expires_in: '-1' },
  ])('rejects unverifiable token identity %j', async (value) => {
    await expect(tokenPrincipal('token', async () => response(value))).rejects.toThrow(
      'verified Google'
    );
  });
  it('fails closed on identity endpoint denial/outage without provider secrets', async () => {
    await expect(tokenPrincipal('token', async () => ({ ok: false }))).rejects.toThrow('rejected');
    await expect(
      tokenPrincipal('token', async () => {
        throw Error('secret');
      })
    ).rejects.toThrow('unavailable');
  });
  it('rejects disagreement between actual Admin/Firestore/Storage ADC clients', async () => {
    const verify = identityVerifier(
      [async () => 'one', async () => 'two'],
      async (_url: string, options: { headers: { Authorization: string } }) =>
        response(options.headers.Authorization === 'Bearer one' ? info : { ...info, sub: 'other' })
    );
    await expect(verify()).rejects.toThrow('mismatch');
  });
  it('rejects a changed refreshed ADC principal', async () => {
    let token = 'one';
    const verify = identityVerifier([async () => token], async () =>
      response({ ...info, sub: token })
    );
    await verify();
    token = 'two';
    await expect(verify()).rejects.toThrow('change');
  });
  it('hard denies production, substituted SDK project, bucket and database', () => {
    const saved = { ...process.env };
    Object.assign(process.env, emptyEnv);
    try {
      for (const changed of [
        { ...target, projectId: 'ski-school-8f3ca', entrypoint: 'production' },
        { ...target, projectId: 'other' },
        { ...target, databaseId: 'other' },
        { ...target, storageBucket: 'ski-school-staging.appspot.com' },
      ])
        expect(() => assertStagingTarget(changed, identity)).toThrow('BLOCKED');
      expect(() =>
        assertStagingTarget(target, { ...identity, projectId: 'ski-school-8f3ca' })
      ).toThrow('mismatch');
      expect(() =>
        parseArguments(
          [
            '--project',
            'ski-school-8f3ca',
            '--database',
            '(default)',
            '--apply',
            '--manifest',
            'file',
            '--confirm',
            'hash',
          ],
          'production'
        )
      ).toThrow('cloud mutations disabled');
      expect(TTL).toBe(15 * 60 * 1000);
    } finally {
      process.env = saved;
    }
  });
  it('rejects fake authorization objects and keeps read-only preflight separate', async () => {
    const automatedOutput = vi.fn();
    for (const operation of ['reset', 'bootstrap']) {
      await expect(
        authorize({}, { target }, 'hash', operation, {
          input: { isTTY: true },
          output: { isTTY: true, write: automatedOutput },
        })
      ).rejects.toThrow('interactive owner terminal required');
    }
    expect(automatedOutput).not.toHaveBeenCalled();
    expect(() => assertMutation({ identity, authorization: {} }, { target }, 'reset')).toThrow();
    const saved = { ...process.env };
    Object.assign(process.env, emptyEnv);
    try {
      expect(
        parseArguments(
          [
            '--project',
            target.projectId,
            '--database',
            '(default)',
            '--bucket',
            target.storageBucket,
            '--preflight',
            '--operation',
            'reset',
            '--manifest',
            'file',
            '--confirm',
            'hash',
          ],
          'staging'
        ).mutation
      ).toBeUndefined();
      expect(() =>
        parseArguments(
          [
            '--project',
            target.projectId,
            '--database',
            '(default)',
            '--preflight',
            '--bootstrap',
            '--manifest',
            'file',
            '--confirm',
            'hash',
          ],
          'staging'
        )
      ).toThrow('separate');
    } finally {
      process.env = saved;
    }
  });
});
