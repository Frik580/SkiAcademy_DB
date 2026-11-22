import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from './testManifest.mjs';
import {
  classifyManifest,
  findInventoryAdditions,
  inventoryPath,
  parseInventory,
} from './validateTestManifest.mjs';

function assertTrackableTests(root, files) {
  const result = spawnSync('git', ['check-ignore', '-z', '--stdin'], {
    cwd: root,
    input: `${files.join('\0')}\0`,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status === 1) return;
  if (result.status !== 0)
    throw new Error(`Could not check Git ignore rules: ${result.stderr.trim()}`);
  const ignored = result.stdout.split('\0').filter(Boolean);
  throw new Error(`Canonical test files excluded by Git ignore rules:\n  ${ignored.join('\n  ')}`);
}

export function syncTestManifest(mode, { root = ROOT, requireTrackable = false, ...options } = {}) {
  if (mode !== '--check' && mode !== '--write')
    throw new Error(
      'Usage: node scripts/syncTestManifest.mjs --check|--write [--require-trackable]'
    );

  const path = resolve(root, inventoryPath);
  const original = readFileSync(path, 'utf8');
  const inventory = parseInventory(original);
  const classification = classifyManifest({ root, ...options });
  const additions = findInventoryAdditions(classification, inventory);
  if (requireTrackable) assertTrackableTests(root, classification.files);
  if (additions.size === 0) return additions;

  const details = [...additions].map(([file, owner]) => `  ${file} -> ${owner}`).join('\n');
  if (mode === '--check')
    throw new Error(`Missing test inventory entries:\n${details}\nRun npm run test:manifest:sync.`);

  const updated = { ...inventory, ...Object.fromEntries(additions) };
  const json = `${JSON.stringify(updated, null, 2)}\n`;
  const temporaryPath = `${path}.tmp`;
  // The exclusive staging file serializes writers. Rename publishes the complete JSON at once.
  const fd = openSync(temporaryPath, 'wx');
  try {
    try {
      writeFileSync(fd, original.includes('\r\n') ? json.replaceAll('\n', '\r\n') : json);
    } finally {
      closeSync(fd);
    }
    if (readFileSync(path, 'utf8') !== original)
      throw new Error(`${inventoryPath} changed during synchronization. Run the command again.`);
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
  return additions;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, flag, ...extra] = process.argv.slice(2);
    const validArgs = extra.length === 0 && (flag === undefined || flag === '--require-trackable');
    const additions = syncTestManifest(validArgs ? mode : undefined, {
      requireTrackable: flag === '--require-trackable',
    });
    if (additions.size) {
      console.log(`Added ${additions.size} test inventory entries:`);
      for (const [file, owner] of additions) console.log(`  ${file} -> ${owner}`);
    } else {
      console.log('Test inventory is up to date.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
