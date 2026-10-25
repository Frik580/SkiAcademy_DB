'use strict';

const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { initializeApp, applicationDefault, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const { bucketName, fingerprint, inventoryObjects } = require('./storage.cjs');
const { hash, assertReadEnvironment, collectInventory } = require('./inventory.cjs');
const { assertLocalMutation } = require('./policy.cjs');
const { buildManifest, executeReset, bootstrapEmptyAttendance } = require('./engine.cjs');
const { createRecoveryExport } = require('./recovery.cjs');
const { LOCK, assertStagingTarget, preflight, authorize } = require('./authorization.cjs');
const { identityVerifier } = require('./adcIdentity.cjs');

function parseArguments(args, entrypoint) {
  const flags = {};
  const booleans = new Set(['--apply', '--bootstrap', '--preflight']);
  const values = new Set([
    '--project',
    '--database',
    '--mode',
    '--scope',
    '--out',
    '--manifest',
    '--confirm',
    '--bucket',
    '--recovery-out',
    '--operation',
  ]);
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if ((!booleans.has(name) && !values.has(name)) || Object.hasOwn(flags, name))
      throw Error(`BLOCKED: unknown/duplicate option ${name}`);
    flags[name] = booleans.has(name) ? true : args[++index];
    if (
      flags[name] === undefined ||
      (typeof flags[name] === 'string' && flags[name].startsWith('--'))
    )
      throw Error(`BLOCKED: missing ${name}`);
  }
  const target = {
    projectId: flags['--project'],
    databaseId: flags['--database'],
    entrypoint,
    ...(flags['--bucket'] ? { storageBucket: flags['--bucket'] } : {}),
  };
  assertReadEnvironment(target);
  const mutation = flags['--apply'] || flags['--bootstrap'];
  const manifestInput = mutation || flags['--preflight'];
  if ([flags['--apply'], flags['--bootstrap'], flags['--preflight']].filter(Boolean).length > 1)
    throw Error('BLOCKED: reset and bootstrap require separate invocations');
  if (
    manifestInput
      ? !flags['--manifest'] ||
        !flags['--confirm'] ||
        flags['--scope'] ||
        flags['--mode'] ||
        flags['--out'] ||
        flags['--recovery-out']
      : !flags['--scope'] ||
        !flags['--out'] ||
        !flags['--mode'] ||
        flags['--manifest'] ||
        flags['--confirm']
  )
    throw Error(
      'BLOCKED: dry-run requires --mode --scope --out; apply/bootstrap requires --manifest --confirm'
    );
  if (
    flags['--preflight']
      ? !['reset', 'bootstrap'].includes(flags['--operation'])
      : flags['--operation']
  )
    throw Error('BLOCKED: --operation reset|bootstrap required only with --preflight');
  // Production hard-deny remains before SDK/credentials, regardless of flags.
  if (manifestInput && entrypoint === 'production') assertLocalMutation(target, {});
  if (manifestInput && !target.projectId.startsWith('demo-')) {
    if (target.databaseId !== '(default)' || target.projectId !== 'ski-school-staging')
      throw Error('BLOCKED: staging default database only');
    if (mutation && (!process.stdin.isTTY || !process.stdout.isTTY))
      throw Error('BLOCKED: cloud mutations disabled without interactive owner terminal');
  }
  bucketName(target);
  return { flags, target, mutation, manifestInput };
}

async function makePorts(target) {
  assertReadEnvironment(target);
  const emulator = target.projectId.startsWith('demo-');
  const app = initializeApp(
    { projectId: target.projectId, ...(emulator ? {} : { credential: applicationDefault() }) },
    `data-reset-${randomUUID()}`
  );
  const db = getFirestore(app, target.databaseId);
  if (emulator) db.settings({ host: process.env.FIRESTORE_EMULATOR_HOST, ssl: false });
  // Pin the Firestore ADC client; Admin SDK otherwise discovers it independently.
  let firestoreAuth;
  if (!emulator) {
    const { GoogleAuth } = require('google-auth-library');
    firestoreAuth = new GoogleAuth({
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
    });
    await firestoreAuth.getClient();
    db.settings({ auth: firestoreAuth, host: 'firestore.googleapis.com', ssl: true });
  }
  const auth = getAuth(app);
  const bucket = getStorage(app).bucket(bucketName(target));
  const identity = Object.freeze({
    projectId: db.projectId,
    databaseId: db.databaseId,
    settingsHost: emulator ? process.env.FIRESTORE_EMULATOR_HOST : 'firestore.googleapis.com',
    storageEndpoint: bucket.storage.apiEndpoint.replace(/\/$/, ''),
  });
  const verifyOperator = emulator
    ? async () => {
        assertLocalMutation(target, identity);
        return hash({ emulator: target.projectId });
      }
    : identityVerifier([
        async () => (await app.options.credential.getAccessToken()).access_token,
        async () => await firestoreAuth.getAccessToken(),
        async () => await bucket.storage.authClient.getAccessToken(),
      ]);
  return {
    target,
    db,
    auth,
    identity,
    verifyOperator,
    storage: {
      bucket,
      deleteExact: async (object) => {
        const file = bucket.file(object.name);
        let metadata;
        try {
          [metadata] = await file.getMetadata();
        } catch (error) {
          if (Number(error.code) === 404) return;
          throw error;
        }
        if (fingerprint(metadata).sha256 !== object.sha256)
          throw Error('BLOCKED: Storage object changed before deletion');
        await file.delete({
          ifGenerationMatch: object.generation,
          ifMetagenerationMatch: metadata.metageneration,
        });
      },
    },
    scan: async () => {
      // Storage failure produces no complete manifest and never permits a write.
      const snapshot = await collectInventory(app, db, auth, target);
      return {
        ...snapshot,
        // Singleton authorization metadata is verified transactionally, never
        // selected as business data or silently included in a reset plan.
        rows: snapshot.rows.filter((row) => row.path !== LOCK),
        storage: await inventoryObjects(bucket),
      };
    },
    assertIsolated: async () => {
      assertLocalMutation(target, identity);
      if (process.env.FUNCTIONS_EMULATOR || process.env.FIREBASE_FUNCTIONS_EMULATOR_ORIGIN)
        throw Error('BLOCKED: Functions emulator writers enabled');
      if (process.env.FIREBASE_EMULATOR_HUB) {
        if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_EMULATOR_HUB))
          throw Error('BLOCKED: invalid emulator hub');
        const response = await fetch(`http://${process.env.FIREBASE_EMULATOR_HUB}/emulators`, {
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok || (await response.json()).functions)
          throw Error('BLOCKED: Functions emulator must be stopped');
      }
      // Hermetic emulator rehearsal only. This is NOT cloud writer evidence.
    },
    close: async () => {
      await db.terminate();
      await deleteApp(app);
    },
  };
}

async function main(args, entrypoint) {
  const { flags, target, mutation, manifestInput } = parseArguments(args, entrypoint);
  const input = JSON.parse(
    fs.readFileSync(manifestInput ? flags['--manifest'] : flags['--scope'], 'utf8')
  );
  if (manifestInput && hash(input.target) !== hash(target))
    throw Error('BLOCKED: manifest project/database/entrypoint mismatch');
  const ports = await makePorts(target);
  try {
    if (flags['--preflight']) {
      console.log(
        JSON.stringify(
          await preflight(ports, input, flags['--confirm'], flags['--operation']),
          null,
          2
        )
      );
    } else if (mutation) {
      let authorization;
      if (!target.projectId.startsWith('demo-')) {
        assertStagingTarget(target, ports.identity);
        ports.revalidateManifest = async () => {
          if (hash(JSON.parse(fs.readFileSync(flags['--manifest'], 'utf8'))) !== hash(input))
            throw Error('BLOCKED: manifest file changed');
        };
        authorization = await authorize(
          ports,
          input,
          flags['--confirm'],
          flags['--bootstrap'] ? 'bootstrap' : 'reset'
        );
      }
      try {
        const executionPorts = authorization?.ports ?? ports;
        const result = flags['--bootstrap']
          ? await bootstrapEmptyAttendance(executionPorts, input, flags['--confirm'])
          : await executeReset(executionPorts, input, flags['--confirm']);
        console.log(JSON.stringify(result));
      } finally {
        await authorization?.close();
      }
    } else {
      const snapshot = await ports.scan();
      if (flags['--recovery-out'])
        fs.writeFileSync(
          flags['--recovery-out'],
          JSON.stringify(createRecoveryExport(snapshot, target), null, 2) + '\n',
          { flag: 'wx', mode: 0o600 }
        );
      const manifest = buildManifest(snapshot, {
        target,
        mode: flags['--mode'],
        selection: input,
      });
      fs.writeFileSync(flags['--out'], JSON.stringify(manifest, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      });
      console.log(
        JSON.stringify({
          dryRun: true,
          ...manifest.counts,
          sha256: manifest.sha256,
          blockers: manifest.blockers.length,
          cloudApply: manifest.cloudApply,
        })
      );
      if (manifest.blockers.length) process.exitCode = 2;
    }
  } finally {
    await ports.close();
  }
}

module.exports = { parseArguments, makePorts, main };
