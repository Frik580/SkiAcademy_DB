import { spawnSync } from 'node:child_process';
import {
  FUNCTIONS_REGION,
  HOSTING_ENVIRONMENTS,
  createSourceIdentity,
  evaluateFunctionsComparison,
  evaluateHostingComparison,
  parseHostingBuildInfo,
  readGitProvenanceInputs,
  systemCaAlreadyEnabled,
} from './deploymentProvenance.mjs';

if (!systemCaAlreadyEnabled(process.execArgv, process.env)) {
  const probe = spawnSync(process.execPath, ['--use-system-ca', '-e', 'process.exit(0)'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  if (probe.status === 0) {
    const child = spawnSync(
      process.execPath,
      ['--use-system-ca', ...process.execArgv, process.argv[1], ...process.argv.slice(2)],
      { stdio: 'inherit', windowsHide: true }
    );
    process.exit(child.status === null ? 1 : child.status);
  }
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function printBlock(title, lines) {
  console.log(title);
  for (const line of lines) console.log(line);
  console.log('');
}

const environment = readOption('--environment');
const target = HOSTING_ENVIRONMENTS[environment];
if (!target?.origin) {
  console.error('Expected --environment production or --environment staging');
  process.exit(2);
}

const git = readGitProvenanceInputs(process.cwd());
const local = createSourceIdentity({
  gitHead: git.gitHead,
  gitStatus: git.gitStatus,
  carveCommitSha: process.env.CARVE_COMMIT_SHA,
  githubSha: process.env.GITHUB_SHA,
});
if (!local.commitSha) {
  console.error('Cannot determine source commit for local HEAD');
  process.exit(2);
}

printBlock('Local HEAD', [`commit: ${local.commitSha}`, `dirty: ${local.dirty}`]);

let exitCode = 0;
let buildInfo = null;
let cacheControl = '';
try {
  const response = await fetch(`${target.origin}/build-info.json`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
  cacheControl = response.headers.get('cache-control') ?? '';
  if (!response.ok) {
    throw new Error(`status ${response.status}`);
  }
  buildInfo = parseHostingBuildInfo(JSON.parse(await response.text()));
} catch (error) {
  const message = error instanceof Error && error.message ? error.message : 'request failed';
  printBlock(`${environment} Hosting`, ['commit: UNVERIFIED', `environment: ${environment}`]);
  console.error(`Hosting provenance request failed: ${message.split('\n')[0]}`);
  console.log('Hosting MISMATCH');
  console.log('Functions NOT CHECKED');
  process.exit(2);
}

printBlock(`${environment} Hosting`, [
  `commit: ${buildInfo.commitSha}`,
  `environment: ${buildInfo.environment}`,
  `dirty: ${buildInfo.dirty}`,
  `project: ${buildInfo.firebaseProjectId}`,
  `built: ${buildInfo.buildTimestamp}`,
]);

const hosting = evaluateHostingComparison({
  localCommitSha: local.commitSha,
  localDirty: local.dirty,
  buildInfo,
  expectedEnvironment: environment,
  cacheControl,
});
console.log(hosting.match ? 'Hosting MATCH' : 'Hosting MISMATCH');
if (!hosting.match) {
  console.log(`reasons: ${hosting.reasons.join(', ')}`);
  exitCode = 1;
}

if (!process.argv.includes('--functions')) {
  console.log('Functions NOT CHECKED');
  process.exit(exitCode);
}

const listed = spawnSync(
  'gcloud',
  [
    'run',
    'services',
    'list',
    `--project=${target.firebaseProjectId}`,
    `--region=${FUNCTIONS_REGION}`,
    '--format=json',
  ],
  {
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32',
  }
);

if (listed.status !== 0 || !listed.stdout) {
  console.log('Functions NOT VERIFIED');
  process.exit(exitCode === 0 ? 2 : exitCode);
}

let services;
try {
  services = JSON.parse(listed.stdout);
} catch {
  console.log('Functions NOT VERIFIED');
  process.exit(exitCode === 0 ? 2 : exitCode);
}
if (!Array.isArray(services)) {
  console.log('Functions NOT VERIFIED');
  process.exit(exitCode === 0 ? 2 : exitCode);
}

const functionsResult = evaluateFunctionsComparison({
  localCommitSha: local.commitSha,
  localDirty: local.dirty,
  services,
});
console.log('Functions');
for (const row of functionsResult.rows) {
  console.log(
    `${row.name} commit: ${row.commitSha ?? 'UNVERIFIED'} dirty: ${
      row.dirty === null ? 'UNVERIFIED' : row.dirty
    } ${row.status.toUpperCase()}`
  );
}
console.log(functionsResult.match ? 'Functions MATCH' : 'Functions MISMATCH');
if (!functionsResult.match) {
  console.log(`reasons: ${functionsResult.reasons.join(', ')}`);
  if (exitCode === 0) exitCode = 1;
}
process.exit(exitCode);
