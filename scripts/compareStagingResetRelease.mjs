import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import inventory from '../functions/scripts/data-reset/inventory.cjs';

export const resetFunctions = [
  'syncCourseEnrollmentOutcomeWork',
  'syncGuestBookingConfirmationWork',
  'syncGuestEnrollmentConfirmationWork',
  'syncGuestPaymentConfirmationWork',
  'scheduledReconcileGuestConfirmationMismatches',
];
const project = 'ski-school-staging';
const canonical = (value) => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sort(value[k])])
    );
  return value;
}
const omit = (value, keys) =>
  Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => !keys.includes(key)));
const labels = (value) => omit(value, ['commit_sha', 'commit_dirty', 'firebase-functions-hash']);
// Only these API filter lists are unordered; every field and duplicate is retained.
function normalizeEventFilters(trigger) {
  if (!trigger || !Array.isArray(trigger.eventFilters)) return trigger;
  return {
    ...trigger,
    eventFilters: [...trigger.eventFilters].sort((a, b) => {
      const left = canonical(a),
        right = canonical(b);
      return left < right ? -1 : left > right ? 1 : 0;
    }),
  };
}
export function loadResetRelease(directory) {
  const report = JSON.parse(readFileSync(join(directory, 'fence-report.json'), 'utf8'));
  const read = (name) => {
    const value = JSON.parse(readFileSync(join(directory, `${name}.json`), 'utf8'));
    if (inventory.hash(value) !== report.artifacts?.[name]?.sha256)
      throw Error(`BLOCKED: captured artifact hash mismatch: ${name}`);
    return value;
  };
  const functions = read('functions');
  return {
    report,
    functions,
    scheduler: read('scheduler'),
    eventarc: read('eventarc'),
    subscriptions: read('subscriptions'),
    services: Object.fromEntries(
      functions.map((f) => {
        const name = f.name.split('/').at(-1);
        return [name, read(`service-${name}`)];
      })
    ),
    policies: Object.fromEntries(
      functions.map((f) => {
        const name = f.name.split('/').at(-1);
        return [name, read(`policy-${name}`)];
      })
    ),
  };
}
export function compareResetRelease(before, after, commit) {
  const errors = [];
  const equal = (a, b, message) => {
    if (canonical(a) !== canonical(b)) errors.push(message);
  };
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) errors.push('exact approved commit required');
  for (const [side, x] of [
    ['before', before],
    ['after', after],
  ]) {
    if (x.report.projectId !== project || x.report.errors?.length || !x.report.completedAt)
      errors.push(`${side}: incomplete/wrong-project capture`);
    for (const name of resetFunctions) {
      const matches = x.functions?.filter(
        (f) =>
          f.name === `projects/${project}/locations/us-central1/functions/${name}` &&
          f.buildConfig?.entryPoint === name
      );
      if (matches?.length !== 1) errors.push(`${side}: missing required target ${name}`);
    }
    for (const [key, count] of [
      ['functions', 47],
      ['scheduler', 7],
      ['eventarc', 8],
      ['subscriptions', 8],
    ]) {
      if (
        !Array.isArray(x[key]) ||
        x[key].length !== count ||
        new Set(x[key].map((v) => v.name)).size !== count
      )
        errors.push(`${side}: incomplete ${key}`);
      if (x[key]?.some((v) => !v.name.startsWith(`projects/${project}/`)))
        errors.push(`${side}: foreign ${key}`);
    }
  }
  if (errors.length) return { status: 'BLOCKED', errors };
  equal(
    before.functions.map((f) => f.name).sort(),
    after.functions.map((f) => f.name).sort(),
    'Function set changed'
  );
  for (const f of before.functions) {
    const name = f.name.split('/').at(-1),
      next = after.functions.find((n) => n.name === f.name);
    if (!next) {
      errors.push(`${name}: missing`);
      continue;
    }
    const selected = resetFunctions.includes(name),
      oldService = before.services[name],
      service = after.services[name];
    if (
      !f.serviceConfig?.revision ||
      !next.serviceConfig?.revision ||
      f.state !== 'ACTIVE' ||
      next.state !== 'ACTIVE' ||
      next.buildConfig?.runtime !== 'nodejs22'
    )
      errors.push(`${name}: incomplete/not ACTIVE/nodejs22`);
    equal(
      omit(f.serviceConfig, ['revision']),
      omit(next.serviceConfig, ['revision']),
      `${name}: service configuration drift`
    );
    equal(
      normalizeEventFilters(f.eventTrigger ?? null),
      normalizeEventFilters(next.eventTrigger ?? null),
      `${name}: trigger drift`
    );
    equal(
      omit(f.buildConfig, ['build', 'source', 'sourceProvenance']),
      omit(next.buildConfig, ['build', 'source', 'sourceProvenance']),
      `${name}: build configuration drift`
    );
    equal(labels(f.labels), labels(next.labels), `${name}: label drift`);
    equal(
      omit(before.policies[name], ['etag']),
      omit(after.policies[name], ['etag']),
      `${name}: invoker IAM drift`
    );
    const runConfig = (s) => ({
      ...omit(s, [
        'uid',
        'generation',
        'createTime',
        'updateTime',
        'creator',
        'lastModifier',
        'client',
        'clientVersion',
        'etag',
        'observedGeneration',
        'terminalCondition',
        'conditions',
        'latestReadyRevision',
        'latestCreatedRevision',
        'trafficStatuses',
        'reconciling',
        'labels',
        'template',
        'urls',
        'uri',
        'buildConfig',
      ]),
      labels: labels(s?.labels),
      buildConfig: omit(s?.buildConfig, ['name', 'sourceLocation', 'imageUri']),
      template: omit(s?.template, ['revision', 'labels', 'containers']),
      templateLabels: labels(s?.template?.labels),
      containers: s?.template?.containers?.map((c) => omit(c, ['image'])),
    });
    equal(runConfig(oldService), runConfig(service), `${name}: Run configuration drift`);
    if (
      !service?.latestReadyRevision ||
      service.latestReadyRevision !== service.latestCreatedRevision ||
      service.reconciling ||
      service.terminalCondition?.state !== 'CONDITION_SUCCEEDED'
    )
      errors.push(`${name}: Run not ready`);
    if (selected) {
      if (
        service.trafficStatuses?.length !== 1 ||
        service.trafficStatuses[0].percent !== 100 ||
        service.trafficStatuses[0].revision !== next.serviceConfig.revision
      )
        errors.push(`${name}: approved revision does not receive all traffic`);
      if (next.serviceConfig.revision === f.serviceConfig.revision)
        errors.push(`${name}: revision did not change`);
      if (!service.latestReadyRevision.endsWith(`/${next.serviceConfig.revision}`))
        errors.push(`${name}: Functions/Run revision mismatch`);
      if (
        next.labels?.commit_sha !== commit ||
        next.labels?.commit_dirty !== 'false' ||
        service.labels?.commit_sha !== commit ||
        service.labels?.commit_dirty !== 'false'
      )
        errors.push(`${name}: unapproved/dirty provenance`);
    } else {
      equal(
        oldService.trafficStatuses,
        service.trafficStatuses,
        `${name}: untargeted traffic changed`
      );
      equal(
        f.serviceConfig.revision,
        next.serviceConfig.revision,
        `${name}: untargeted revision changed`
      );
      equal(f.labels, next.labels, `${name}: untargeted provenance changed`);
    }
  }
  equal(
    before.scheduler.map((j) =>
      omit(j, ['status', 'lastAttemptTime', 'scheduleTime', 'userUpdateTime'])
    ),
    after.scheduler.map((j) =>
      omit(j, ['status', 'lastAttemptTime', 'scheduleTime', 'userUpdateTime'])
    ),
    'Scheduler configuration/state drift'
  );
  equal(
    before.eventarc.map((t) => normalizeEventFilters(omit(t, ['uid', 'createTime', 'updateTime']))),
    after.eventarc.map((t) => normalizeEventFilters(omit(t, ['uid', 'createTime', 'updateTime']))),
    'Eventarc configuration drift'
  );
  equal(before.subscriptions, after.subscriptions, 'PubSub configuration drift');
  return { status: errors.length ? 'BLOCKED' : 'PASS', errors };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [before, after, commit] = process.argv.slice(2);
  if (!before || !after || !commit)
    throw Error(
      'Usage: node scripts/compareStagingResetRelease.mjs BEFORE_DIR AFTER_DIR APPROVED_SHA'
    );
  const result = compareResetRelease(loadResetRelease(before), loadResetRelease(after), commit);
  console.log(JSON.stringify(result));
  if (result.status !== 'PASS') process.exitCode = 1;
}
