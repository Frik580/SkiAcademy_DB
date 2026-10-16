// Test-process preload: reject cloud Firestore before DNS/HTTP2/HTTP transport.
const dns = require('node:dns');
const http2 = require('node:http2');
const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');

const cloudFirestore = /(^|\.)firestore(?:\.[a-z0-9-]+)*\.googleapis\.com$/i;
const violations = [];
function checkFirestoreHost(host) {
  host = String(host).toLowerCase().replace(/\.$/, '');
  if (!cloudFirestore.test(host)) return;
  const message = `TEST_FIRESTORE_EGRESS_BLOCKED: ${host}; use an explicit localhost Firebase emulator`;
  violations.push(message);
  if (process.env.CARVE_TEST_EGRESS_LOG) {
    fs.appendFileSync(process.env.CARVE_TEST_EGRESS_LOG, `${process.pid} ${message}\n`);
  }
  // SDK retry/error handling must not turn a rejected egress attempt into PASS.
  process.exitCode = 1;
  throw new Error(message);
}
for (const owner of [dns, dns.promises]) {
  for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6', 'resolveTxt']) {
    const original = owner[key];
    owner[key] = function (host, ...args) {
      checkFirestoreHost(host);
      return original.call(this, host, ...args);
    };
  }
}
const connect = http2.connect;
http2.connect = function (authority, ...args) {
  checkFirestoreHost(new URL(authority).hostname);
  return connect.call(this, authority, ...args);
};
function checkUrl(input) {
  const value = typeof input === 'object' && input?.url ? input.url : input;
  checkFirestoreHost(new URL(value).hostname);
}
for (const protocol of ['node:http', 'node:https']) {
  const transport = require(protocol);
  for (const method of ['request', 'get']) {
    const original = transport[method];
    transport[method] = function (input, ...args) {
      if (typeof input === 'string' || input instanceof URL) checkUrl(input);
      else if (input?.hostname || input?.host)
        checkFirestoreHost(input.hostname || input.host.split(':')[0]);
      return original.call(this, input, ...args);
    };
  }
}
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, ...args) {
  checkUrl(input);
  return originalFetch.call(this, input, ...args);
};
function assertEmulators(env, services) {
  const keys = {
    firestore: 'FIRESTORE_EMULATOR_HOST',
    auth: 'FIREBASE_AUTH_EMULATOR_HOST',
    storage: 'FIREBASE_STORAGE_EMULATOR_HOST',
  };
  for (const service of services) {
    const value = env[keys[service]];
    let url;
    try {
      url = new URL(`http://${value}`);
    } catch {
      /* rejected below */
    }
    if (
      !value ||
      !url ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      !url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error(
        `TEST_EMULATOR_ENV_REQUIRED: ${keys[service]} must name an explicit loopback host:port`
      );
    }
  }
}
syncBuiltinESMExports();
module.exports = { checkFirestoreHost, violations, assertEmulators };
if (require.main === module && process.argv[2] === '--require-emulators') {
  assertEmulators(process.env, process.argv.slice(3));
}
