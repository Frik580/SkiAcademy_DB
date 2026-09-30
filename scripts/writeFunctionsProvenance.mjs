import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderFunctionsProvenanceModule,
  resolveFunctionsBuildProvenance,
  sameSourceIdentity,
} from './deploymentProvenance.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(repoRoot, 'functions', 'src', 'generated', 'deploymentProvenance.ts');

function currentProvenance() {
  return resolveFunctionsBuildProvenance({
    env: process.env,
    cwd: repoRoot,
    buildTimestamp: new Date().toISOString(),
  });
}

if (process.argv.includes('--check')) {
  const existing = readFileSync(target, 'utf8');
  const match = existing.match(/commitSha: '([0-9a-f]{40})'[\s\S]*dirty: (true|false)/);
  if (!match) {
    throw new Error('Functions deployment provenance is missing after the build');
  }
  const current = currentProvenance();
  const baked = {
    commitSha: match[1],
    dirty: match[2] === 'true',
  };
  if (!sameSourceIdentity(baked, current)) {
    throw new Error('Source identity changed during the functions build. Re-run the build.');
  }
} else {
  const provenance = currentProvenance();
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, renderFunctionsProvenanceModule(provenance), 'utf8');
}
