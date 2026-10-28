// Offline comparison of SDK discovery and CLI wire serialization. Never deploys.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');

const root = path.resolve(__dirname, '..');
const cliRoot = path.join(root, 'node_modules/firebase-tools');
const cli = (name) => require(path.join(cliRoot, 'lib', name));
const functionsRoot = path.join(root, 'functions');

async function snapshot() {
  // Import registration code using an isolated demo identity, without credentials.
  process.env.GCLOUD_PROJECT = 'demo-ski-school-e2e';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
  require('./testFirestoreNetworkGuard.cjs');
  const loader = require(
    path.join(functionsRoot, 'node_modules/firebase-functions/lib/runtime/loader.js')
  );
  const manifest = await loader.loadStack(functionsRoot);
  const runtime = cli('deploy/functions/runtimes/node/parseRuntimeAndValidateSDK').getRuntimeChoice(
    functionsRoot
  );
  assert.equal(runtime, 'nodejs22');
  const build = cli('deploy/functions/runtimes/discovery/v1alpha1').buildFromV1Alpha1(
    manifest,
    process.env.GCLOUD_PROJECT,
    'us-central1',
    runtime
  );
  const backend = cli('deploy/functions/build').toBackend(build, {});
  const endpoints = cli('deploy/functions/backend').allEndpoints(backend);
  const wire = {};
  for (const endpoint of endpoints) {
    assert.equal(
      typeof endpoint.maxInstances,
      'number',
      `${endpoint.id}: missing numeric maxInstances`
    );
    const serialized = cli('gcp/cloudfunctionsv2').functionFromEndpoint(endpoint);
    assert.equal(
      serialized.serviceConfig.maxInstanceCount,
      endpoint.maxInstances,
      `${endpoint.id}: serialized maxInstanceCount changed`
    );
    wire[endpoint.id] = {
      endpoint,
      function: serialized,
      ...(endpoint.scheduleTrigger
        ? {
            // New CLI versions resolve the default account through Compute API.
            // Supply the same deterministic demo fixture as the old CLI, offline.
            scheduler: await cli('gcp/cloudscheduler').jobFromEndpoint(
              {
                ...endpoint,
                serviceAccount:
                  endpoint.serviceAccount ?? '123456789-compute@developer.gserviceaccount.com',
              },
              endpoint.region,
              '123456789'
            ),
          }
        : {}),
    };
  }
  return {
    cliVersion: require(path.join(cliRoot, 'package.json')).version,
    sdkVersion: require(path.join(functionsRoot, 'node_modules/firebase-functions/package.json'))
      .version,
    cliDefaultRegion: cli('api').functionsDefaultRegion(),
    wireRegionFixture: 'us-central1',
    regionScope:
      'Fixed-region serializer fixture; deployment default-region resolution is not exercised.',
    runtime,
    manifest,
    wire,
  };
}

async function main() {
  const [output, baseline] = process.argv.slice(2);
  assert.ok(output, 'Usage: node scripts/snapshotFunctionsWire.cjs <output.json> [baseline.json]');
  // Match the JSON boundary used by SDK discovery (ResetValue serializes to null).
  const result = JSON.parse(JSON.stringify(await snapshot()));
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  if (baseline) {
    const before = JSON.parse(fs.readFileSync(baseline, 'utf8'));
    assert.deepEqual(result.manifest, before.manifest, 'SDK discovery manifest changed');
    assert.equal(result.runtime, before.runtime);
    assert.ok(
      isDeepStrictEqual(result.wire, before.wire),
      'CLI wire configuration changed; inspect both snapshots. Offline serialization does not verify deployment prepare or deployed VPC/Scheduler/IAM.'
    );
  }
  console.log(
    `PASS: ${Object.keys(result.wire).length} Functions; ${result.runtime}; CLI ${result.cliVersion}; SDK ${result.sdkVersion}${baseline ? '; unchanged discovery/wire configuration' : ''}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
