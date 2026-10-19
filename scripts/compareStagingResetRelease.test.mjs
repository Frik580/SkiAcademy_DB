import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareResetRelease, resetFunctions } from './compareStagingResetRelease.mjs';
const commit = 'a'.repeat(40),
  project = 'projects/ski-school-staging/';
function pair() {
  const names = [...resetFunctions, ...Array.from({ length: 42 }, (_, i) => `other${i}`)];
  const before = {
    report: { projectId: 'ski-school-staging', completedAt: 'now', errors: [] },
    functions: names.map((name) => ({
      name: project + `locations/us-central1/functions/${name}`,
      state: 'ACTIVE',
      labels: { commit_sha: 'b'.repeat(40), commit_dirty: 'false' },
      buildConfig: { runtime: 'nodejs22', entryPoint: name },
      serviceConfig: {
        revision: name + '-old',
        serviceAccountEmail: 'retained',
        maxInstanceCount: 10,
      },
    })),
    scheduler: Array.from({ length: 7 }, (_, i) => ({
      name: project + `jobs/job${i}`,
      state: 'ENABLED',
      schedule: 'every 5 minutes',
    })),
    eventarc: Array.from({ length: 8 }, (_, i) => ({
      name: project + `triggers/trigger${i}`,
      eventFilters: [{ value: 'original' }],
    })),
    subscriptions: Array.from({ length: 8 }, (_, i) => ({
      name: project + `subscriptions/sub${i}`,
      ackDeadlineSeconds: 600,
    })),
    services: Object.fromEntries(
      names.map((name) => [
        name,
        {
          latestReadyRevision: name + '-old',
          latestCreatedRevision: name + '-old',
          terminalCondition: { state: 'CONDITION_SUCCEEDED' },
          traffic: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', percent: 100 }],
          trafficStatuses: [
            {
              type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST',
              percent: 100,
              revision: name + '-old',
            },
          ],
          template: {
            serviceAccount: 'retained',
            containers: [{ image: 'old', resources: { cpu: '1' }, args: ['--first', 'second'] }],
          },
          labels: { commit_sha: 'b'.repeat(40), commit_dirty: 'false' },
        },
      ])
    ),
    policies: Object.fromEntries(
      names.map((name) => [
        name,
        { bindings: [{ role: 'roles/run.invoker', members: ['original'] }] },
      ])
    ),
  };
  const after = JSON.parse(JSON.stringify(before));
  for (const name of resetFunctions) {
    const f = after.functions.find((f) => f.buildConfig.entryPoint === name);
    f.serviceConfig.revision = name + '-new';
    f.labels.commit_sha = commit;
    const s = after.services[name];
    s.latestReadyRevision = `revisions/${name}-new`;
    s.latestCreatedRevision = s.latestReadyRevision;
    s.trafficStatuses[0].revision = name + '-new';
    s.labels.commit_sha = commit;
    s.template.containers[0].image = 'new';
  }
  return { before, after };
}
test('rejects old/split traffic and ordered argument changes', () => {
  for (const mutate of [
    (x) => (x.services[resetFunctions[0]].trafficStatuses[0].revision = 'old'),
    (x) => (x.services[resetFunctions[0]].trafficStatuses[0].percent = 50),
    (x) => x.services[resetFunctions[0]].template.containers[0].args.reverse(),
    (x) => (x.services.other0.trafficStatuses[0].revision = 'old-other'),
  ]) {
    const { before, after } = pair();
    mutate(after);
    assert.equal(compareResetRelease(before, after, commit).status, 'BLOCKED');
  }
});
test('rejects missing target and omitted persistent config drift', () => {
  {
    const { before, after } = pair();
    before.functions[0].name = before.functions[0].name.replace(resetFunctions[0], 'replacement');
    after.functions[0].name = before.functions[0].name;
    assert.equal(compareResetRelease(before, after, commit).status, 'BLOCKED');
  }
  for (const mutate of [
    (x) => (x.services[resetFunctions[0]].customAudiences = ['foreign']),
    (x) => (x.services[resetFunctions[0]].defaultUriDisabled = true),
    (x) => (x.functions[0].buildConfig.serviceAccount = 'foreign'),
    (x) => (x.services[resetFunctions[0]].buildConfig = { serviceAccount: 'foreign' }),
  ]) {
    const { before, after } = pair();
    mutate(after);
    assert.equal(compareResetRelease(before, after, commit).status, 'BLOCKED');
  }
});
test('accepts exactly five new ready revisions with preserved configuration', () => {
  const { before, after } = pair();
  assert.equal(compareResetRelease(before, after, commit).status, 'PASS');
});
test('rejects changed service account, capacity and invoker', () => {
  for (const mutate of [
    (x) => (x.functions[0].serviceConfig.serviceAccountEmail = 'other'),
    (x) => (x.functions[0].serviceConfig.maxInstanceCount = 100),
    (x) => (x.policies[resetFunctions[0]].bindings = []),
  ]) {
    const { before, after } = pair();
    mutate(after);
    assert.equal(compareResetRelease(before, after, commit).status, 'BLOCKED');
  }
});
test('rejects Scheduler, Eventarc and retry drift', () => {
  for (const mutate of [
    (x) => (x.scheduler[0].state = 'PAUSED'),
    (x) => (x.eventarc[0].eventFilters = []),
    (x) => (x.subscriptions[0].ackDeadlineSeconds = 10),
  ]) {
    const { before, after } = pair();
    mutate(after);
    assert.equal(compareResetRelease(before, after, commit).status, 'BLOCKED');
  }
});
test('rejects absent or dirty revisions, wrong project and incomplete capture', () => {
  for (const mutate of [
    (x) => (x.functions[0].labels.commit_dirty = 'true'),
    (x) => (x.functions[0].serviceConfig.revision = 'syncCourseEnrollmentOutcomeWork-old'),
    (x) => (x.report.projectId = 'ski-school-8f3ca'),
    (x) => x.eventarc.pop(),
    (x) => x.report.errors.push('429'),
  ]) {
    const { before, after } = pair();
    mutate(after);
    assert.equal(compareResetRelease(before, after, commit).status, 'BLOCKED');
  }
});
test('rejects sixth changed revision and unready selected service', () => {
  for (const mutate of [
    (x) => (x.functions[5].serviceConfig.revision = 'other-new'),
    (x) => (x.services[resetFunctions[0]].latestReadyRevision = 'old'),
  ]) {
    const { before, after } = pair();
    mutate(after);
    assert.equal(compareResetRelease(before, after, commit).status, 'BLOCKED');
  }
});
