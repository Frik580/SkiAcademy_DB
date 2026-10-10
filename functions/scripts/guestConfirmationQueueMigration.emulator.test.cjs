'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
// This suite performs writes only in the explicitly selected local demo emulator.
if (!emulator || !/^(127\.0\.0\.1|localhost):\d+$/.test(emulator)) {
  throw new Error('CLI integration tests require a local FIRESTORE_EMULATOR_HOST.');
}
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const exec = promisify(execFile);
const cliPath = require.resolve('./guestConfirmationQueueMigration.cjs');
const controlPath = 'migration_control/guest_confirmation_reconciliation_v1';
const workCollection = 'guest_confirmation_reconciliation_work';
const quarantineCollection = 'guest_confirmation_reconciliation_quarantine';
let app;
let db;

async function cli(action, extra = [], success = true) {
  const args = [cliPath, '--project', 'demo-ski-school-e2e', '--action', action, ...extra];
  if (!['status', 'dry-run'].includes(action)) args.push('--apply');
  const result = await exec(process.execPath, args, { env: process.env }).then(
    (output) => ({ ...output, code: 0 }),
    (error) => ({ stdout: error.stdout, stderr: error.stderr, code: error.code })
  );
  assert.equal(result.code === 0, success, result.stderr);
  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
async function status() {
  return (await cli('status')).at(-1);
}
async function clean() {
  for (const collection of [
    'bookings',
    'course_enrollments',
    'payments',
    'monetary_events',
    workCollection,
    quarantineCollection,
  ]) {
    await db.recursiveDelete(db.collection(collection));
  }
  await db.doc(controlPath).delete();
}
before(() => {
  app = initializeApp({ projectId: 'demo-ski-school-e2e' }, 'guest-cli-integration');
  db = getFirestore(app);
});
beforeEach(clean);
after(async () => {
  await clean();
  await deleteApp(app);
});

test('CLI requires two passes/evidence/epoch/no lease/no blocked work; explicit cutover, rollback, restart', async () => {
  const financial = { fixture: 'untouched financial history', currency: 'KZT' };
  await db.doc('payments/payment_cli_untouched').set(financial);
  await db.doc('monetary_events/event_cli_untouched').set(financial);
  await cli('dry-run');
  assert.equal((await db.doc(controlPath).get()).exists, false);
  await cli('begin', ['--evidence', 'emulator deployment evidence']);
  await cli('begin', ['--evidence', 'cannot overwrite durable state'], false);
  const epoch = (await status()).epoch;
  const proof = ['--epoch', epoch, '--evidence', 'emulator independent evidence'];
  await cli('cutover', proof, false);
  await cli('page');
  assert.equal((await status()).backfillPass, 1);
  await cli('cutover', proof, false);
  await cli('page');
  assert.equal((await status()).backfillPass, 2);
  assert.equal((await status()).mode, 'legacy');
  const beforeRepeat = (await db.doc(controlPath).get()).data();
  await cli('page');
  assert.deepEqual((await db.doc(controlPath).get()).data(), beforeRepeat);
  await cli('cutover', ['--epoch', 'stale-epoch', '--evidence', 'checked'], false);
  await cli('cutover', ['--epoch', epoch], false);
  await db
    .doc(controlPath)
    .update({ leaseToken: 'active-test-lease', leaseUntilMs: Date.now() + 600000 });
  assert.equal((await status()).leaseToken, 'active-test-lease');
  await cli('cutover', proof, false);
  await cli('restart', ['--evidence', 'checked'], false);
  await db.doc(controlPath).update({ leaseToken: null, leaseUntilMs: 0 });
  await db.doc(`${workCollection}/payment_cli_blocked`).set({ status: 'blocked' });
  assert.equal((await status()).blockedWork, true);
  await cli('cutover', proof, false);
  await db.doc(`${workCollection}/payment_cli_blocked`).delete();
  await cli('cutover', proof);
  assert.equal((await status()).mode, 'queue');
  await cli('restart', ['--evidence', 'checked'], false);
  const queued = (await db.doc(controlPath).get()).data();
  await cli('rollback');
  assert.deepEqual((await db.doc(controlPath).get()).data(), { ...queued, mode: 'legacy' });
  await cli('restart', ['--evidence', 'emulator verified redeployment']);
  const restarted = await status();
  assert.notEqual(restarted.epoch, epoch);
  assert.equal(restarted.backfillPass, 0);
  assert.equal(restarted.readyEvidence, null);
  await cli('page');
  await cli('page');
  await cli('cutover', proof, false);
  await cli('cutover', ['--epoch', restarted.epoch, '--evidence', 'fresh independent evidence']);
  assert.deepEqual((await db.doc('payments/payment_cli_untouched').get()).data(), financial);
  assert.deepEqual((await db.doc('monetary_events/event_cli_untouched').get()).data(), financial);
});

test('historical subjects with empty payments preserve durable cursors and quarantine gate; bounded repair', async () => {
  const batch = db.batch();
  for (let index = 0; index < 26; index++)
    batch.set(db.doc(`bookings/booking_cli_${String(index).padStart(2, '0')}`), {
      attribution: { bookingOrigin: 'guest' },
      historical: true,
    });
  await batch.commit();
  assert.equal((await db.collection('payments').limit(1).get()).empty, true);
  const dry = (await cli('dry-run'))[0];
  assert.equal(dry.recoveryDocsRead, 25);
  assert.equal(dry.quarantined, 25);
  assert.equal((await db.collection(quarantineCollection).get()).empty, true);
  const remaining = (await cli('dry-run', ['--after-booking', dry.nextCursors.bookings.after]))[0];
  assert.equal(remaining.recoveryDocsRead, 1);
  await cli('begin', ['--evidence', 'emulator evidence']);
  await cli('page');
  const first = await status();
  assert.equal(first.backfillPass, 0);
  assert.equal(first.backfill.bookings.after, 'booking_cli_24');
  assert.equal(first.quarantine, true);
  await cli('page');
  assert.equal((await status()).backfillPass, 1);
  await cli('page');
  await cli('page');
  const transferred = await status();
  assert.equal(transferred.backfillPass, 2);
  assert.equal((await db.collection(quarantineCollection).get()).size, 26);
  assert.equal((await db.collection('bookings').get()).size, 26);
  const proof = ['--epoch', transferred.epoch, '--evidence', 'checked'];
  await cli('cutover', proof, false);
  // Remove only test fixtures to simulate an independently authorized source repair.
  await db.recursiveDelete(db.collection('bookings'));
  const repaired = (await cli('repair'))[0];
  assert.equal(repaired.cleared, 25);
  assert.equal((await status()).quarantine, true);
  await cli('cutover', proof, false);
  await cli('repair', ['--after-quarantine', repaired.nextCursor]);
  assert.equal((await status()).quarantine, false);
  await cli('cutover', proof);
});
