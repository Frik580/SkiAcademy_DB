'use strict';

const { randomUUID } = require('node:crypto');
const { createInterface } = require('node:readline/promises');
const { hash, assertReadEnvironment } = require('./inventory.cjs');
const { assertLocalMutation } = require('./policy.cjs');
const { bucketName } = require('./storage.cjs');

const LOCK = 'system_data_resets/staging_authorization_v1';
const TTL = 15 * 60 * 1000;
const sessions = new WeakMap();

function assertStagingTarget(target, identity) {
  assertReadEnvironment(target);
  if (target.projectId.startsWith('demo-')) {
    assertLocalMutation(target, identity);
    return;
  }
  if (
    target.entrypoint !== 'staging' ||
    target.projectId !== 'ski-school-staging' ||
    target.databaseId !== '(default)' ||
    bucketName(target) !== 'ski-school-staging.firebasestorage.app' ||
    identity.projectId !== target.projectId ||
    identity.databaseId !== target.databaseId ||
    identity.settingsHost !== 'firestore.googleapis.com' ||
    identity.storageEndpoint !== 'https://storage.googleapis.com'
  )
    throw Error('BLOCKED: staging authorization target/SDK identity mismatch');
}

function planHash(manifest) {
  return hash({
    target: manifest.target,
    mode: manifest.mode,
    actions: manifest.actions,
    storage: manifest.storage.deletions,
  });
}

function assertMutation(ports, manifest, operation) {
  if (manifest.target.projectId.startsWith('demo-') && !ports.authorization) {
    assertLocalMutation(manifest.target, ports.identity);
    return;
  }
  assertStagingTarget(manifest.target, ports.identity);
  const session = sessions.get(ports.authorization);
  const { assertManifest } = require('./engine.cjs');
  assertManifest(manifest, manifest.sha256);
  if (
    !session ||
    session.closed ||
    session.operation !== operation ||
    session.manifestHash !== manifest.sha256 ||
    session.planHash !== planHash(manifest) ||
    session.targetHash !== hash(manifest.target) ||
    Date.now() >= session.expiresAt
  )
    throw Error('BLOCKED: missing, expired, reused or mismatched authorization');
}

function beginMutation(ports, manifest, operation) {
  assertMutation(ports, manifest, operation);
  const session = sessions.get(ports.authorization);
  if (session?.started)
    throw Error('BLOCKED: authorization already used; request fresh owner approval');
  if (session) session.started = true;
}

// Reads only. The full private manifest contains paths/data; public evidence uses
// path digests and field names so operator/audit output contains no personal data.
async function preflight(ports, manifest, confirmation, operation) {
  assertStagingTarget(manifest.target, ports.identity);
  if (hash(ports.target) !== hash(manifest.target)) throw Error('BLOCKED: target substitution');
  if (!['reset', 'bootstrap'].includes(operation)) throw Error('BLOCKED: invalid operation');
  const {
    assertManifest,
    buildManifest,
    verifySnapshot,
    checkpointRevisions,
  } = require('./engine.cjs');
  const jobPath = assertManifest(manifest, confirmation);
  const operatorHash = await ports.verifyOperator();
  const jobSnapshot = await ports.db.doc(jobPath).get();
  const job = jobSnapshot.data();
  if (operation === 'bootstrap' && job?.status === 'bootstrapped')
    throw Error('BLOCKED: bootstrap already complete; no repeat apply');
  if (manifest.storage.deletions.length)
    throw Error(
      'BLOCKED: authorization adapter supports Firestore-only reset; Storage deletes require separate review'
    );
  if (
    operation === 'bootstrap' &&
    (manifest.mode !== 'full-test-reset' ||
      !job ||
      !['verified', 'bootstrapped'].includes(job.status) ||
      job.manifestHash !== manifest.sha256 ||
      job.appliedCount !== manifest.actions.length ||
      job.storageCount !== 0 ||
      job.pendingStorage)
  )
    throw Error('BLOCKED: reset verifier not complete');
  const snapshot = await ports.scan();
  if (!job) {
    if (Date.now() >= Date.parse(manifest.expiresAt)) throw Error('BLOCKED: manifest expired');
    if (buildManifest(snapshot, manifest).sha256 !== manifest.sha256)
      throw Error('BLOCKED: stale manifest');
  } else {
    if (
      job.manifestHash !== manifest.sha256 ||
      !Number.isSafeInteger(job.appliedCount) ||
      job.appliedCount < 0 ||
      job.appliedCount > manifest.actions.length ||
      !['running', 'verified', 'bootstrapped'].includes(job.status) ||
      job.storageCount !== 0 ||
      job.pendingStorage
    )
      throw Error('BLOCKED: invalid resume journal');
    if (operation === 'reset' && job.status !== 'running')
      throw Error('BLOCKED: reset already complete; no repeat apply');
    verifySnapshot(
      snapshot,
      manifest,
      job.appliedCount,
      jobPath,
      operation === 'bootstrap',
      0,
      undefined,
      checkpointRevisions(jobSnapshot),
      true
    );
  }
  return Object.freeze({
    projectId: manifest.target.projectId,
    databaseId: manifest.target.databaseId,
    operation,
    manifestHash: manifest.sha256,
    planHash: planHash(manifest),
    operatorHash,
    journalHash: hash(job ?? null),
    checkpoint: job?.appliedCount ?? 0,
    counts: manifest.counts,
    currentDocuments: snapshot.rows.length,
    remainingActions:
      operation === 'reset' ? manifest.actions.length - (job?.appliedCount ?? 0) : 0,
    changes: manifest.actions.map((a) => ({
      kind: a.kind,
      collection: a.path.split('/')[0],
      pathHash: hash(a.path),
      beforeHash: a.beforeHash,
      afterHash: a.afterHash,
      fields: [...Object.keys(a.set ?? {}), ...(a.remove ?? [])],
    })),
    bootstrapChanges:
      operation === 'bootstrap' ? ['empty Attendance ready marker', 'journal status'] : [],
    externalWriters: 'NOT EXCLUDED: owner must follow approved pause/drain/recovery procedure',
  });
}

function phrase(evidence) {
  return `OWNER APPROVES ${evidence.operation} ${evidence.projectId} ${evidence.databaseId} ${evidence.manifestHash} ${evidence.planHash}`;
}

async function authorize(ports, manifest, confirmation, operation, testIO) {
  // Test IO is allowed ONLY for verified loopback emulator targets.
  const local = manifest.target.projectId.startsWith('demo-');
  if (testIO && !local) throw Error('BLOCKED: interactive owner terminal required');
  const io = testIO ?? { input: process.stdin, output: process.stdout };
  if (!io.input.isTTY || !io.output.isTTY)
    throw Error('BLOCKED: interactive owner terminal required');
  const evidence = await preflight(ports, manifest, confirmation, operation);
  io.output.write(JSON.stringify({ preflight: true, ...evidence }, null, 2) + '\n');
  io.output.write(
    'Owner: confirm secured recovery archive, approved pause/drain checks and bounded external-writer risk.\n'
  );
  const approvedAt = Date.now();
  const terminal = createInterface({ ...io, terminal: false });
  let answer;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TTL);
  try {
    answer = await terminal.question(`Type exactly: ${phrase(evidence)}\n> `, {
      signal: abort.signal,
    });
  } catch {
    throw Error('BLOCKED: owner confirmation cancelled or expired');
  } finally {
    clearTimeout(timer);
    terminal.close();
  }
  if (answer !== phrase(evidence) || Date.now() >= approvedAt + TTL)
    throw Error('BLOCKED: exact owner authorization missing or expired');
  // Confirmation never blesses changed input or a changed checkpoint.
  await ports.revalidateManifest?.();
  const fresh = await preflight(ports, manifest, confirmation, operation);
  if (hash(fresh) !== hash(evidence)) throw Error('BLOCKED: preflight changed during approval');
  const session = {
    operation,
    manifestHash: evidence.manifestHash,
    planHash: evidence.planHash,
    targetHash: hash(manifest.target),
    operatorHash: evidence.operatorHash,
    approvedAt,
    expiresAt: approvedAt + TTL,
    sessionId: randomUUID(),
    closed: false,
  };
  const lockRef = ports.db.doc(LOCK);
  await ports.db.runTransaction(async (tx) => {
    const lock = await tx.get(lockRef);
    const previous = lock.data();
    const now = Math.max(Date.now(), lock.readTime.toMillis());
    if (now >= session.expiresAt) throw Error('BLOCKED: authorization expired');
    if (
      previous &&
      (previous.version !== 1 ||
        !Number.isSafeInteger(previous.expiresAt) ||
        !['held', 'released'].includes(previous.status))
    )
      throw Error('BLOCKED: invalid authorization lock');
    if (previous?.status === 'held' && previous.expiresAt > now)
      throw Error('BLOCKED: parallel apply lease held');
    if (previous && previous.manifestHash !== session.manifestHash) {
      if (!/^[a-f0-9]{64}$/.test(previous.manifestHash))
        throw Error('BLOCKED: invalid previous plan');
      const priorJob = await tx.get(ports.db.doc(`system_data_resets/${previous.manifestHash}`));
      if (
        !priorJob.exists ||
        !(
          priorJob.get('status') === 'bootstrapped' ||
          (priorJob.get('status') === 'verified' && priorJob.get('mode') === 'activity-reset')
        )
      )
        throw Error('BLOCKED: unfinished reset; resume original manifest');
    }
    const job = await tx.get(ports.db.doc(`system_data_resets/${session.manifestHash}`));
    if (hash(job.data() ?? null) !== evidence.journalHash)
      throw Error('BLOCKED: checkpoint changed during approval');
    const history = previous?.history ?? [];
    if (!Array.isArray(history) || history.length >= 100)
      throw Error('BLOCKED: authorization audit capacity; archive/recovery review required');
    tx.set(lockRef, {
      version: 1,
      status: 'held',
      operation,
      manifestHash: session.manifestHash,
      planHash: session.planHash,
      operatorHash: session.operatorHash,
      sessionId: session.sessionId,
      approvedAt,
      expiresAt: session.expiresAt,
      history: [
        ...history,
        {
          operation,
          manifestHash: session.manifestHash,
          planHash: session.planHash,
          operatorHash: session.operatorHash,
          sessionId: session.sessionId,
          approvedAt,
          expiresAt: session.expiresAt,
          checkpoint: evidence.checkpoint,
          journalHash: evidence.journalHash,
        },
      ],
    });
  });
  const capability = Object.freeze({});
  sessions.set(capability, session);
  async function checkTransaction(tx) {
    const lock = await tx.get(lockRef);
    const now = Math.max(Date.now(), lock.readTime.toMillis());
    assertMutation(authorized, manifest, operation);
    if (
      lock.get('status') !== 'held' ||
      lock.get('sessionId') !== session.sessionId ||
      lock.get('manifestHash') !== session.manifestHash ||
      lock.get('planHash') !== session.planHash ||
      lock.get('operation') !== operation ||
      lock.get('operatorHash') !== session.operatorHash ||
      lock.get('expiresAt') !== session.expiresAt ||
      now >= session.expiresAt
    )
      throw Error('BLOCKED: expired or replaced authorization lease');
  }
  // Every engine/bootstrap transaction reads the singleton lock before any
  // writes. An expired process cannot commit after another process takes over.
  const db = new Proxy(ports.db, {
    get(target, key) {
      if (key === 'runTransaction')
        return (callback, ...args) =>
          target.runTransaction(
            async (tx) => {
              await checkTransaction(tx);
              return callback(tx);
            },
            ...args
          );
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const authorized = {
    ...ports,
    db,
    authorization: capability,
    assertIsolated: async () => {
      assertMutation(authorized, manifest, operation);
      if ((await ports.verifyOperator()) !== session.operatorHash)
        throw Error('BLOCKED: ADC identity changed');
      await ports.revalidateManifest?.();
      await ports.db.runTransaction(checkTransaction);
    },
  };
  return {
    ports: authorized,
    evidence,
    close: async () => {
      session.closed = true; // Never reusable, including failure/lost response.
      await ports.db.runTransaction(async (tx) => {
        const lock = await tx.get(lockRef);
        if (lock.get('sessionId') === session.sessionId && lock.get('status') === 'held')
          tx.update(lockRef, { status: 'released' });
      });
    },
  };
}

module.exports = {
  LOCK,
  TTL,
  assertStagingTarget,
  assertMutation,
  beginMutation,
  planHash,
  preflight,
  phrase,
  authorize,
};
