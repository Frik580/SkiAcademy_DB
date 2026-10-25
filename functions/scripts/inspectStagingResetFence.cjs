'use strict';

// Read-only evidence capture. This tool NEVER certifies isolation or unlocks apply.
const fs = require('node:fs');
const path = require('node:path');
const { hash } = require('./data-reset/inventory.cjs');
const project = 'ski-school-staging';
const output = process.argv[2];
if (process.argv.length !== 3 || !output)
  throw Error(
    'Usage: node --use-system-ca functions/scripts/inspectStagingResetFence.cjs NEW_EVIDENCE_DIRECTORY'
  );
fs.mkdirSync(output, { recursive: false });
const report = {
  projectId: project,
  databaseId: '(default)',
  observedAt: new Date().toISOString(),
  status: 'BLOCKED',
  requests: [],
  errors: [],
  artifacts: {},
  blockers: [
    'No enforced fence or valid invocation canaries',
    'Effective privileged Admin SDK writers unproven',
    'Eventarc/PubSub drain and old-retry replay safety unproven',
    'In-flight requests, Firestore/Storage operations and credentials unproven',
  ],
};
const save = (name, data) => {
  fs.writeFileSync(path.join(output, `${name}.json`), JSON.stringify(data, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  report.artifacts[name] = { sha256: hash(data) };
};
async function main() {
  const auth = require('../../node_modules/firebase-tools/lib/auth.js');
  const api = require('../../node_modules/firebase-tools/lib/api.js');
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw Error('Existing Firebase CLI read identity required');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.tokens.refresh_token,
      client_id: api.clientId(),
      client_secret: api.clientSecret(),
    }),
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) throw Error('OAuth refresh failed');
  const hosts = new Set([
    'cloudfunctions.googleapis.com',
    'cloudscheduler.googleapis.com',
    'eventarc.googleapis.com',
    'pubsub.googleapis.com',
    'run.googleapis.com',
    'cloudresourcemanager.googleapis.com',
    'firestore.googleapis.com',
  ]);
  async function read(url, body) {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      !hosts.has(parsed.hostname) ||
      !new RegExp(`^/v[12]/projects/${project}(?:/|:|$)`).test(parsed.pathname) ||
      (body && !parsed.pathname.endsWith(':getIamPolicy'))
    )
      throw Error('Read-only staging endpoint guard');
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(30000),
    });
    report.requests.push({ url, http: response.status });
    if (!response.ok)
      throw Error(`Read-only inventory HTTP ${response.status}: ${parsed.hostname}`);
    const data = await response.json();
    if (data.unreachable?.length) throw Error('Unreachable regions; inventory incomplete');
    return data;
  }
  async function list(url, key) {
    const rows = [];
    let pageToken;
    do {
      const next = new URL(url);
      next.searchParams.set('pageSize', '100');
      if (pageToken) next.searchParams.set('pageToken', pageToken);
      const data = await read(next.href);
      rows.push(...(data[key] ?? []));
      if (rows.length > 1000 || (data.nextPageToken && data.nextPageToken === pageToken))
        throw Error('Inventory cap/cursor failure');
      pageToken = data.nextPageToken;
    } while (pageToken);
    return rows;
  }
  const inventories = [
    [
      'functions',
      `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/-/functions`,
      'functions',
    ],
    [
      'scheduler',
      `https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/us-central1/jobs`,
      'jobs',
    ],
    [
      'eventarc',
      `https://eventarc.googleapis.com/v1/projects/${project}/locations/-/triggers`,
      'triggers',
    ],
    [
      'subscriptions',
      `https://pubsub.googleapis.com/v1/projects/${project}/subscriptions`,
      'subscriptions',
    ],
    [
      'operations',
      `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/operations`,
      'operations',
    ],
  ];
  for (const [name, url, key] of inventories) {
    try {
      save(name, await list(url, key));
    } catch (error) {
      report.errors.push({ name, message: error.message });
    }
  }
  try {
    save(
      'project-iam',
      await read(
        `https://cloudresourcemanager.googleapis.com/v1/projects/${project}:getIamPolicy`,
        { options: { requestedPolicyVersion: 3 } }
      )
    );
  } catch (error) {
    report.errors.push({ name: 'project-iam', message: error.message });
  }
  const functionsFile = path.join(output, 'functions.json');
  if (fs.existsSync(functionsFile)) {
    for (const fn of JSON.parse(fs.readFileSync(functionsFile, 'utf8'))) {
      const id = fn.name.split('/').at(-1);
      const service = fn.serviceConfig?.service;
      if (!service?.startsWith(`projects/${project}/`)) {
        report.errors.push({ name: id, message: 'Missing/foreign service' });
        continue;
      }
      try {
        save(`service-${id}`, await read(`https://run.googleapis.com/v2/${service}`));
        save(`policy-${id}`, await read(`https://run.googleapis.com/v2/${service}:getIamPolicy`));
      } catch (error) {
        report.errors.push({ name: id, message: error.message });
      }
    }
  }
}
main()
  .catch((error) => {
    report.errors.push({ message: error.message });
  })
  .finally(() => {
    save('fence-report', { ...report, completedAt: new Date().toISOString() });
    console.log(
      JSON.stringify({
        status: report.status,
        projectId: project,
        artifacts: Object.keys(report.artifacts).length,
        errors: report.errors.length,
        blockers: report.blockers,
      })
    );
    process.exitCode = 2; // Evidence is not a fence approval.
  });
