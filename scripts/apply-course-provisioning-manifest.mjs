#!/usr/bin/env node
/**
 * Dry-run or apply a reviewed canonical course provisioning manifest.
 *
 * Usage:
 *   node scripts/apply-course-provisioning-manifest.mjs --manifest path/to/manifest.json --dry-run
 *   node scripts/apply-course-provisioning-manifest.mjs --manifest path/to/manifest.json --apply --course-id <courseId>
 */
import { readFile } from 'node:fs/promises';

const manifestPath = readArg('--manifest');
const courseIdFilter = readArg('--course-id');
const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');

if (!manifestPath) {
  console.error('Missing required --manifest <path>');
  process.exit(1);
}
if (!dryRun && !apply) {
  console.error('Specify exactly one of --dry-run or --apply');
  process.exit(1);
}
if (dryRun && apply) {
  console.error('Use only one of --dry-run or --apply');
  process.exit(1);
}

const raw = JSON.parse(await readFile(manifestPath, 'utf8'));
const manifests = Array.isArray(raw) ? raw : [raw];
const selected = courseIdFilter
  ? manifests.filter((manifest) => manifest.courseId === courseIdFilter)
  : manifests;

if (selected.length === 0) {
  console.error('No manifest entries matched the requested courseId filter.');
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      mode: dryRun ? 'dry-run' : 'apply',
      manifestCount: selected.length,
      manifests: selected,
      note:
        'This script validates and prints the reviewed manifest. Runtime apply must be executed through the canonical admin callable in the deployed Functions environment.',
    },
    null,
    2
  )
);

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}
