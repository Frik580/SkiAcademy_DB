import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareFunctionConfig, compareOperationalResources } from './compareFunctionConfig.mjs';
const fixture = () => ({
  functions: [
    {
      name: 'projects/prod/locations/us-central1/functions/command',
      state: 'ACTIVE',
      environment: 'GEN_2',
      buildConfig: { runtime: 'nodejs22' },
      serviceConfig: {
        maxInstanceCount: 20,
        availableCpu: '1',
        availableMemory: '256Mi',
        timeoutSeconds: 60,
        maxInstanceRequestConcurrency: 80,
        ingressSettings: 'ALLOW_ALL',
        serviceAccountEmail: 'runtime@prod',
        environmentKeys: ['FIREBASE_CONFIG'],
      },
    },
  ],
});
test('permits only the expected runtime/provenance update', () => {
  const before = fixture();
  before.functions[0].buildConfig.runtime = 'nodejs20';
  assert.equal(compareFunctionConfig(before, fixture(), [], 1).status, 'PASS');
});
test('detects cap resets, disappearance, unknown additions and truncated inventories', () => {
  const after = fixture();
  delete after.functions[0].serviceConfig.maxInstanceCount;
  const cap = compareFunctionConfig(fixture(), after, [], 1);
  assert.equal(cap.status, 'BLOCKED');
  assert.ok(cap.errors.some((e) => e.includes('max')));
  assert.equal(compareFunctionConfig(fixture(), { functions: [] }, [], 1).status, 'BLOCKED');
  assert.equal(
    compareFunctionConfig(fixture(), { ...fixture(), nextPageToken: 'more' }, [], 1).status,
    'BLOCKED'
  );
  assert.equal(compareFunctionConfig({ functions: [] }, fixture()).status, 'BLOCKED');
  const renamed = fixture();
  renamed.functions[0].name += '-unexpected';
  assert.ok(
    compareFunctionConfig(fixture(), renamed, [], 1).errors.includes('unexpected additions')
  );
});
test('detects secret, account, event and concurrency drift', () => {
  for (const patch of [
    { secretEnvironmentVariables: [{ key: 'secret', version: '2' }] },
    { serviceAccountEmail: 'other' },
    { maxInstanceRequestConcurrency: 1 },
  ]) {
    const after = fixture();
    Object.assign(after.functions[0].serviceConfig, patch);
    const result = compareFunctionConfig(fixture(), after, [], 1);
    assert.equal(result.status, 'BLOCKED');
    assert.ok(result.errors.some((e) => /secrets|serviceAccount|concurrency/.test(e)));
  }
  const after = fixture();
  after.functions[0].eventTrigger = { retryPolicy: 'RETRY_POLICY_DO_NOT_RETRY' };
  assert.ok(compareFunctionConfig(fixture(), after, [], 1).errors.some((e) => e.includes('event')));
  assert.equal(compareOperationalResources({}, {}).status, 'BLOCKED');
});
test('cannot certify empty, unauthorized or structurally incomplete evidence', () => {
  assert.equal(compareFunctionConfig({ functions: [] }, { functions: [] }).status, 'BLOCKED');
  const invalid = fixture();
  delete invalid.functions[0].serviceConfig;
  assert.equal(compareFunctionConfig(invalid, invalid, [], 1).status, 'BLOCKED');
  const errors = {
    scheduler: { error: 403 },
    eventarc: { error: 403 },
    runServiceIam: { error: 403 },
  };
  assert.equal(compareOperationalResources(errors, errors).status, 'BLOCKED');
});

test('compares complete operational evidence and ignores volatile scheduler observations', () => {
  const before = {
    scheduler: {
      jobs: Array.from({ length: 7 }, (_, i) => ({
        name: `job-${i}`,
        schedule: 'every 5 minutes',
        timeZone: 'UTC',
        state: 'ENABLED',
        httpTarget: { uri: `https://worker-${i}` },
      })),
    },
    eventarc: {
      triggers: Array.from({ length: 6 }, (_, i) => ({
        name: `event-${i}`,
        destination: { cloudRun: { service: `worker-${i}` } },
        eventFilters: [{ attribute: 'type', value: 'written' }],
        serviceAccount: 'trigger@project',
      })),
    },
    runServiceIam: [
      { function: 'command', bindings: [{ role: 'roles/run.invoker', members: ['allUsers'] }] },
    ],
  };
  const after = structuredClone(before);
  after.scheduler.jobs[0].lastAttemptTime = 'new observation';
  assert.equal(compareOperationalResources(before, after, 1).status, 'PASS');
  after.runServiceIam[0].bindings[0].members = ['other'];
  assert.deepEqual(compareOperationalResources(before, after, 1).errors, [
    'operational configuration changed; explicit review required',
  ]);
  delete after.scheduler.jobs[0].httpTarget;
  assert.ok(
    compareOperationalResources(before, after, 1).errors.some((e) =>
      e.includes('incomplete Scheduler')
    )
  );
});
