import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { Timestamp } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { buildManifest, references } = require('../../scripts/data-reset/engine.cjs');
const { hash, assertReadEnvironment } = require('../../scripts/data-reset/inventory.cjs');
const {
  assertLocalMutation,
  assertTarget,
  exactPath,
} = require('../../scripts/data-reset/policy.cjs');

describe('data reset safety contracts', () => {
  const target = { projectId: 'demo-reset', databaseId: '(default)', entrypoint: 'staging' };
  const scope = { dataScope: 'test', testSessionId: 'session_reset' };
  const docs = {
    'users/owner': { ...scope, accountId: 'owner' },
    'participants/person': { ...scope, participantId: 'person' },
    'participant_management/owner': {
      participantId: 'person',
      accountId: 'owner',
      role: 'owner',
      status: 'active',
    },
    'test_sessions/session_reset': { status: 'closed' },
    'participant_progress/person': { ...scope, participantId: 'person', xp: 100 },
  };
  function plan(reference?: string) {
    const data = { ...docs, ...(reference ? { 'settings/reference': { reference } } : {}) };
    return buildManifest(
      {
        complete: true,
        storage: { complete: true, bucket: 'demo-reset.firebasestorage.app', objects: [] },
        ghosts: [],
        auth: [{ uid: 'owner', hash: 'fingerprint' }],
        rows: Object.entries(data).map(([path, value]) => ({
          path,
          data: value,
          hash: hash(value),
          updateTime: '1:0',
        })),
      },
      {
        target,
        mode: 'full-test-reset',
        selection: {
          accountIds: ['owner'],
          participantIds: ['person'],
          testSessionIds: ['session_reset'],
          documents: [
            {
              path: 'participant_progress/person',
              sha256: hash(docs['participant_progress/person']),
            },
          ],
        },
      }
    );
  }

  it('separates projection paths from retained Participant identity', () => {
    expect(plan().blockers).toEqual([]);
  });
  it('rejects mismatched Account identity and a foreign refund beneficiary', () => {
    const base = plan();
    const extra = { ...scope, refundAccountIdAtEvent: 'real_customer' };
    const changed = {
      ...docs,
      'users/owner': { ...scope, accountId: 'another' },
      'monetary_events/refund': extra,
    };
    const snapshot = {
      complete: true,
      storage: { complete: true, bucket: 'demo-reset.firebasestorage.app', objects: [] },
      ghosts: [],
      auth: base.auth,
      rows: Object.entries(changed).map(([path, data]) => ({
        path,
        data,
        hash: hash(data),
        updateTime: '1:0',
      })),
    };
    const result = buildManifest(snapshot, {
      ...base,
      selection: {
        ...base.selection,
        documents: [
          ...base.selection.documents,
          { path: 'monetary_events/refund', sha256: hash(extra) },
        ],
      },
    });
    expect(result.blockers.join()).toContain('Unproven TEST Account ownership');
    expect(result.blockers.join()).toContain('Foreign refundAccountIdAtEvent');
  });
  it.each([
    'participant_progress/person',
    '/participant_progress/person',
    'projects/demo-reset/databases/(default)/documents/participant_progress/person',
  ])('rejects retained reference %s', (reference) =>
    expect(plan(reference).blockers.join()).toContain('Retained orphan reference')
  );
  it('fingerprints object key order deterministically without type-tag collisions', () => {
    expect(hash({ b: 2, a: 1 })).toBe(hash({ a: 1, b: 2 }));
    expect(hash(Timestamp.fromMillis(0))).not.toBe(hash({ $timestamp: [0, 0] }));
    expect(references({ nested: ['/bookings/old'] }).has('bookings/old')).toBe(true);
  });
  it('rejects wildcard/path traversal and absent or cross-environment targets', () => {
    for (const path of ['bookings/*', 'bookings/a/../b', '/users/owner', 'bookings'])
      expect(() => exactPath(path)).toThrow('BLOCKED');
    expect(() => assertTarget('ski-school-8f3ca', '(default)', 'staging')).toThrow('BLOCKED');
    expect(() => assertTarget('ski-school-staging', '', 'staging')).toThrow('BLOCKED');
    for (const id of ['ski-school-staging', 'ski-school-8f3ca'])
      expect(() =>
        assertLocalMutation(
          {
            ...target,
            projectId: id,
            entrypoint: id === 'ski-school-staging' ? 'staging' : 'production',
          },
          {}
        )
      ).toThrow('cloud mutations disabled');
    expect(() =>
      assertLocalMutation(
        target,
        { projectId: 'other', databaseId: '(default)', settingsHost: '127.0.0.1:8080' },
        { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9299' }
      )
    ).toThrow('loopback');
  });
  it('rejects alternate Storage endpoint overrides and mismatched actual SDK transport', () => {
    const env = {
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9299',
      FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
      STORAGE_EMULATOR_HOST: 'https://storage.googleapis.com',
    };
    expect(() => assertReadEnvironment(target, env)).toThrow('conflicting Storage');
    const local = { ...env, STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199' };
    const identity = {
      projectId: target.projectId,
      databaseId: target.databaseId,
      settingsHost: local.FIRESTORE_EMULATOR_HOST,
      storageEndpoint: 'https://storage.googleapis.com',
    };
    expect(() => assertLocalMutation(target, identity, local)).toThrow('loopback');
    expect(() =>
      assertLocalMutation(
        target,
        { ...identity, storageEndpoint: local.STORAGE_EMULATOR_HOST },
        local
      )
    ).not.toThrow();
    expect(() =>
      assertReadEnvironment(
        { ...target, projectId: 'ski-school-staging' },
        { STORAGE_EMULATOR_HOST: 'http://127.0.0.1:9199' }
      )
    ).toThrow('BLOCKED');
  });
});
