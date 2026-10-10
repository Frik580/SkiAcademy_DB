'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { parseMigrationArguments, runCli } = require('./guestConfirmationQueueMigration.cjs');

const production = ['--project', 'ski-school-8f3ca'];
const confirmations = ['--allow-production', '--confirm-project', 'ski-school-8f3ca'];
const actions = ['dry-run', 'status', 'begin', 'restart', 'page', 'repair', 'cutover', 'rollback'];
const evidence = ['--evidence', 'unit test evidence', '--epoch', 'unit-test-epoch'];

async function refusedBeforeRuntime(argv, env, message) {
  let loaded = false;
  await assert.rejects(
    runCli(argv, env, () => {
      loaded = true;
    }),
    message
  );
  assert.equal(loaded, false, 'must refuse before loading Admin SDK/migration code');
}

for (const action of actions) {
  test(`${action}: all production confirmations required before runtime`, async () => {
    // Parser-only tests: no production process/action with --apply is executed.
    const args = [...production, '--action', action, ...evidence];
    for (const consent of [
      [],
      ['--allow-production'],
      ['--confirm-project', 'ski-school-8f3ca'],
      ['--allow-production', '--confirm-project', 'ski-school-staging'],
    ]) {
      await refusedBeforeRuntime([...args, ...consent], {}, /Production requires/);
    }
    if (!['dry-run', 'status'].includes(action)) {
      await refusedBeforeRuntime([...args, ...confirmations], {}, /Mutation requires --apply/);
    }
    const validated = parseMigrationArguments(
      [...args, ...confirmations, ...(['dry-run', 'status'].includes(action) ? [] : ['--apply'])],
      {}
    );
    assert.equal(validated.action, action);
    assert.equal(validated.projectId, 'ski-school-8f3ca');
  });
}

test('default dry-run is also production gated', async () => {
  await refusedBeforeRuntime(production, {}, /Production requires/);
  assert.equal(parseMigrationArguments([...production, ...confirmations], {}).action, 'dry-run');
});

test('exact project ID, confirmation and unambiguous arguments', async () => {
  for (const project of [
    'prod',
    'staging',
    'ski-school-8f3ca-typo',
    'other-project',
    ' ski-school-8f3ca',
  ]) {
    await refusedBeforeRuntime(['--project', project, ...confirmations], {}, /exact supported/);
  }
  for (const suffix of [
    [],
    ['--confirm-project'],
    ['--project', 'ski-school-staging'],
    ['--unknown'],
  ]) {
    if (!suffix.length) continue;
    await refusedBeforeRuntime(
      [...production, ...confirmations, ...suffix],
      {},
      /duplicate|Missing|Unknown/
    );
  }
  await refusedBeforeRuntime(['--project'], {}, /Missing value/);
  await refusedBeforeRuntime(
    [...production, ...confirmations, '--action', 'oops'],
    {},
    /Unknown migration action/
  );
  await refusedBeforeRuntime(
    ['--project', 'ski-school-staging', ...confirmations],
    {},
    /production project ID/
  );
  await refusedBeforeRuntime(
    ['--project', 'ski-school-staging', '--confirm-project', 'ski-school-8f3ca'],
    {},
    /exactly match/
  );
});

test('production refuses every emulator hint, including empty variables', async () => {
  for (const name of [
    'FIRESTORE_EMULATOR_HOST',
    'FIRESTORE_EMULATOR_HOST_PATH',
    'FIREBASE_FIRESTORE_EMULATOR_ADDRESS',
    'FIREBASE_EMULATOR_HUB',
    'FIREBASE_AUTH_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
    'STORAGE_EMULATOR_HOST',
    'FUNCTIONS_EMULATOR',
    'FIRESTORE_HOST',
  ]) {
    for (const value of ['127.0.0.1:8080', '']) {
      await refusedBeforeRuntime(
        [...production, ...confirmations],
        { [name]: value },
        /emulator environment/
      );
    }
  }
});

test('production rejects conflicting environment projects/config before SDK', async () => {
  for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'GCP_PROJECT']) {
    await refusedBeforeRuntime(
      [...production, ...confirmations],
      { [name]: 'ski-school-staging' },
      /project mismatch/
    );
    assert.equal(
      parseMigrationArguments([...production, ...confirmations], { [name]: 'ski-school-8f3ca' })
        .projectId,
      'ski-school-8f3ca'
    );
  }
  for (const config of ['{"projectId":"ski-school-staging"}', 'null', '[]', '{', '/config.json']) {
    await refusedBeforeRuntime(
      [...production, ...confirmations],
      { FIREBASE_CONFIG: config },
      /FIREBASE_CONFIG/
    );
  }
  parseMigrationArguments([...production, ...confirmations], {
    FIREBASE_CONFIG: '{"projectId":"ski-school-8f3ca"}',
  });
});

test('staging and demo retain read/mutation/emulator constraints', async () => {
  for (const project of ['ski-school-staging', 'demo-ski-school-e2e']) {
    const env = project.startsWith('demo-') ? { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' } : {};
    for (const action of actions) {
      const args = ['--project', project, '--action', action, ...evidence];
      if (!['dry-run', 'status'].includes(action)) {
        await refusedBeforeRuntime(args, env, /Mutation requires --apply/);
        args.push('--apply');
      }
      assert.equal(parseMigrationArguments(args, env).action, action);
    }
  }
  await refusedBeforeRuntime(
    ['--project', 'demo-ski-school-e2e'],
    {},
    /requires FIRESTORE_EMULATOR_HOST/
  );
  parseMigrationArguments(['--project', 'ski-school-staging'], {
    FIRESTORE_EMULATOR_HOST: 'localhost:8080',
    GCLOUD_PROJECT: 'demo-ski-school-e2e',
  });
});

test('evidence and epoch checked before SDK, with existing mutation contract', async () => {
  const base = ['--project', 'ski-school-staging', '--apply'];
  for (const action of ['begin', 'restart', 'cutover']) {
    await refusedBeforeRuntime([...base, '--action', action], {}, /evidence/);
    await refusedBeforeRuntime([...base, '--action', action, '--evidence', ' '], {}, /evidence/);
  }
  await refusedBeforeRuntime(
    [...base, '--action', 'cutover', '--evidence', 'checked'],
    {},
    /--epoch/
  );
});

test('explicit Admin app and Firestore target checked before any read', async () => {
  const argv = [...production, ...confirmations, '--action', 'status'];
  let getCalled = false;
  await assert.rejects(
    runCli(argv, {}, () => ({
      initializeApp: (options) => {
        assert.equal(options.projectId, 'ski-school-8f3ca');
        return { options: { projectId: 'ski-school-staging' } };
      },
      getFirestore: () => {
        getCalled = true;
      },
    })),
    /Admin project mismatch/
  );
  assert.equal(getCalled, false);
  await assert.rejects(
    runCli(argv, {}, () => ({
      initializeApp: (options) => ({ options }),
      getFirestore: (app) => {
        assert.equal(app.options.projectId, 'ski-school-8f3ca');
        return { projectId: 'ski-school-staging' };
      },
      migration: {
        readGuestConfirmationControl: () => assert.fail('must not read mismatched database'),
      },
    })),
    /Firestore project mismatch/
  );
});

test('real CLI rejects unsafe invocations with nonzero exit and readable guard errors', () => {
  for (const argv of [
    production,
    [...production, '--action', 'status'],
    ['--project', 'wrong-project'],
  ]) {
    const result = spawnSync(
      process.execPath,
      [require.resolve('./guestConfirmationQueueMigration.cjs'), ...argv],
      { encoding: 'utf8', env: {} }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Production requires|exact supported/);
    assert.equal(result.stdout, '');
  }
});
