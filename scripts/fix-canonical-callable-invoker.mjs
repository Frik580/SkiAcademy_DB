/**
 * One-off repair: align Cloud Run invoker IAM for browser-facing canonical callables.
 * Uses firebase-tools OAuth token (same as `firebase login`).
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT_ID = 'ski-school-8f3ca';
const REGION = 'us-central1';

const AFFECTED_SERVICES = [
  'querymanagedparticipantpickerreadmodels',
  'querylessonbookingreadmodels',
  'executecanonicalcommand',
  'executeguestcanonicalcommand',
];

function loadAccessToken() {
  const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const token = config?.tokens?.access_token;
  if (!token) {
    throw new Error('No firebase-tools access token. Run `firebase login` first.');
  }
  return token;
}

async function getIamPolicy(token, serviceName) {
  const resource = `projects/${PROJECT_ID}/locations/${REGION}/services/${serviceName}`;
  const url = `https://run.googleapis.com/v1/${resource}:getIamPolicy`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`getIamPolicy ${serviceName} failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

async function setIamPolicy(token, serviceName, policy) {
  const resource = `projects/${PROJECT_ID}/locations/${REGION}/services/${serviceName}`;
  const url = `https://run.googleapis.com/v1/${resource}:setIamPolicy`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ policy }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`setIamPolicy ${serviceName} failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

function ensurePublicInvoker(policy) {
  const invokerRole = 'roles/run.invoker';
  const members = ['allUsers'];
  const bindings = (policy.bindings ?? []).filter((binding) => binding.role !== invokerRole);
  bindings.push({ role: invokerRole, members });
  return {
    ...policy,
    bindings,
    version: policy.version ?? 3,
  };
}

function hasPublicInvoker(policy) {
  const binding = policy.bindings?.find((entry) => entry.role === 'roles/run.invoker');
  return binding?.members?.includes('allUsers') ?? false;
}

async function main() {
  const token = loadAccessToken();
  const dryRun = process.argv.includes('--dry-run');

  for (const serviceName of AFFECTED_SERVICES) {
    const policy = await getIamPolicy(token, serviceName);
    const alreadyPublic = hasPublicInvoker(policy);
    console.log(`${serviceName}: allUsers invoker = ${alreadyPublic}`);
    if (alreadyPublic) {
      continue;
    }
    if (dryRun) {
      console.log(`  would add roles/run.invoker for allUsers`);
      continue;
    }
    const updated = ensurePublicInvoker(policy);
    await setIamPolicy(token, serviceName, updated);
    console.log(`  fixed`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
