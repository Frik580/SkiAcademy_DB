import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const preload = fileURLToPath(new URL('./testFirestoreNetworkGuard.cjs', import.meta.url));
for (const code of [
  "require('node:dns').lookup('firestore.googleapis.com',()=>{})",
  "require('node:dns').promises.lookup('firestore.mtls.googleapis.com')",
  "require('node:http2').connect('https://firestore.googleapis.com')",
  "require('node:https').get('https://firestore.googleapis.com./v1/projects/forbidden')",
  "fetch('https://FIRESTORE.GOOGLEAPIS.COM./v1/projects/forbidden')",
]) {
  test(`cloud Firestore fails before transport: ${code}`, () => {
    const result = spawnSync(process.execPath, ['--require', preload, '-e', code], {
      encoding: 'utf8',
      env: { ...process.env, CARVE_TEST_EGRESS_LOG: '' },
      windowsHide: true,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TEST_FIRESTORE_EGRESS_BLOCKED/);
  });
}
test('loopback emulator resolution is allowed', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--require',
      preload,
      '-e',
      "require('node:dns').lookup('127.0.0.1',(e,ip)=>{if(e||ip!=='127.0.0.1')process.exitCode=1})",
    ],
    { encoding: 'utf8', windowsHide: true }
  );
  assert.equal(result.status, 0, result.stderr);
});
test('missing or remote emulator configuration fails closed', () => {
  for (const host of [
    '',
    'firestore.googleapis.com:443',
    '127.0.0.1:8080/?remote=true',
    'localhost:8080/#remote',
  ]) {
    const result = spawnSync(process.execPath, [preload, '--require-emulators', 'firestore'], {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, FIRESTORE_EMULATOR_HOST: host },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /TEST_EMULATOR_ENV_REQUIRED/);
  }
});
