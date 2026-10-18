import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const stable = (value) => JSON.stringify(sort(value));
function sort(value) {
  if (Array.isArray(value))
    return value.map(sort).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sort(value[key])])
    );
  return value;
}

/** Only runtime/provenance/service revision may change. No cloud calls or writes. */
export function compareFunctionConfig(before, after, allowedNew = [], expectedExisting = 43) {
  const errors = [];
  for (const [label, inventory] of [
    ['before', before],
    ['after', after],
  ]) {
    if (
      !Array.isArray(inventory.functions) ||
      inventory.nextPageToken ||
      inventory.unreachable?.length
    )
      errors.push(`${label}: incomplete inventory`);
    for (const f of inventory.functions ?? []) {
      const s = f.serviceConfig;
      if (
        !/^projects\/[^/]+\/locations\/[^/]+\/functions\/[^/]+$/.test(f.name ?? '') ||
        !f.buildConfig?.runtime ||
        !f.environment ||
        f.state !== 'ACTIVE' ||
        !s ||
        ![
          'availableMemory',
          'availableCpu',
          'timeoutSeconds',
          'maxInstanceRequestConcurrency',
          'ingressSettings',
          'serviceAccountEmail',
        ].every((k) => s[k] !== undefined) ||
        !Array.isArray(s.environmentKeys) ||
        f.error
      )
        errors.push(`${label}: incomplete function configuration`);
      if (label === 'after' && (f.buildConfig?.runtime !== 'nodejs22' || f.environment !== 'GEN_2'))
        errors.push(`${label}: function not GEN_2/nodejs22`);
    }
  }
  if (
    before.functions?.length !== expectedExisting ||
    after.functions?.length !== expectedExisting + allowedNew.length
  )
    errors.push('unexpected inventory count');
  if (errors.length) return { status: 'BLOCKED', errors };
  const byName = (f) => f.name.split('/').at(-1);
  const old = new Map(before.functions.map((f) => [byName(f), f]));
  const current = new Map(after.functions.map((f) => [byName(f), f]));
  if (old.size !== before.functions.length || current.size !== after.functions.length)
    errors.push('duplicate function names/regions');
  const additions = [...current.keys()].filter((name) => !old.has(name));
  if (stable(additions) !== stable(allowedNew)) errors.push('unexpected additions');
  const rows = [];
  for (const [name, f] of old) {
    const next = current.get(name);
    if (!next) {
      errors.push(`${name}: REMOVED`);
      continue;
    }
    const config = (x) => {
      const s = x.serviceConfig ?? {};
      return {
        identity: x.name,
        location: x.name.split('/')[3],
        environment: x.environment,
        memory: s.availableMemory,
        cpu: Number(s.availableCpu),
        timeout: s.timeoutSeconds,
        max: s.maxInstanceCount ?? null,
        min: s.minInstanceCount ?? 0,
        concurrency: s.maxInstanceRequestConcurrency,
        ingress: s.ingressSettings,
        serviceAccount: s.serviceAccountEmail,
        secrets: s.secretEnvironmentVariables ?? [],
        environmentKeys: s.environmentKeys ?? Object.keys(s.environmentVariables ?? {}),
        vpcConnector: s.vpcConnector ?? null,
        vpcEgress: s.vpcConnectorEgressSettings ?? null,
        event: x.eventTrigger ?? null,
      };
    };
    const a = config(f),
      b = config(next);
    const differences = Object.keys(a).filter((key) => stable(a[key]) !== stable(b[key]));
    if (differences.length) errors.push(`${name}: ${differences.join(', ')}`);
    if (next.state !== 'ACTIVE' || next.buildConfig?.runtime !== 'nodejs22')
      errors.push(`${name}: not ACTIVE/nodejs22`);
    rows.push({ name, differences });
  }
  return {
    status: errors.length ? 'BLOCKED' : 'PASS',
    existing: old.size,
    additions,
    errors,
    rows,
  };
}

// Additional snapshots must include Scheduler, Eventarc and Run IAM; missing
// evidence is a failure, never inferred from a successful Functions deploy.
export function compareOperationalResources(before, after, expectedExisting = 43) {
  const errors = [];
  for (const [label, inventory] of [
    ['before', before],
    ['after', after],
  ]) {
    const scheduler = inventory.scheduler;
    const eventarc = inventory.eventarc;
    const iam = inventory.runServiceIam;
    if (
      !Array.isArray(scheduler?.jobs) ||
      scheduler.jobs.length !== 7 ||
      scheduler.nextPageToken ||
      scheduler.error ||
      scheduler.jobs.some((j) => !j.name || !j.schedule || !j.timeZone || !j.httpTarget?.uri)
    )
      errors.push(`${label}: incomplete Scheduler evidence`);
    if (
      !Array.isArray(eventarc?.triggers) ||
      eventarc.triggers.length !== 6 ||
      eventarc.nextPageToken ||
      eventarc.unreachable?.length ||
      eventarc.error ||
      eventarc.triggers.some(
        (t) => !t.name || !t.destination || !t.eventFilters || !t.serviceAccount
      )
    )
      errors.push(`${label}: incomplete Eventarc evidence (compare existing six separately)`);
    if (
      !Array.isArray(iam) ||
      iam.length !== expectedExisting ||
      new Set(iam.map((i) => i.function)).size !== expectedExisting ||
      iam.some((i) => i.error || !i.function || !Array.isArray(i.bindings))
    )
      errors.push(`${label}: incomplete Run IAM evidence`);
  }
  if (!errors.length) {
    const normalized = (x) => ({
      scheduler: x.scheduler.jobs.map(
        ({ name, schedule, timeZone, state, attemptDeadline, retryConfig, httpTarget }) => ({
          name,
          schedule,
          timeZone,
          state,
          attemptDeadline,
          retryConfig,
          httpTarget,
        })
      ),
      eventarc: x.eventarc.triggers.map(
        ({ name, eventFilters, destination, serviceAccount, transport }) => ({
          name,
          eventFilters,
          destination,
          serviceAccount,
          transport,
        })
      ),
      runServiceIam: x.runServiceIam,
    });
    if (stable(normalized(before)) !== stable(normalized(after)))
      errors.push('operational configuration changed; explicit review required');
  }
  return { status: errors.length ? 'BLOCKED' : 'PASS', errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [beforePath, afterPath, outputPath, ...newNames] = process.argv.slice(2);
  if (!beforePath || !afterPath || !outputPath)
    throw new Error(
      'Usage: node scripts/compareFunctionConfig.mjs before.json after.json result.json [allowed-new-name ...]'
    );
  const before = JSON.parse(readFileSync(beforePath, 'utf8'));
  const after = JSON.parse(readFileSync(afterPath, 'utf8'));
  const result = {
    functions: compareFunctionConfig(before, after, newNames),
    operations: compareOperationalResources(before, after),
  };
  writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(
    JSON.stringify({ functions: result.functions.status, operations: result.operations.status })
  );
  if (result.functions.status !== 'PASS' || result.operations.status !== 'PASS')
    process.exitCode = 1;
}
