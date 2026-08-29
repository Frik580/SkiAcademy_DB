#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const require = createRequire(import.meta.url);
const sharedDomain = require(join(repoRoot, 'packages', 'shared-domain', 'dist', 'index.js'));
const {
  CourseProvisioningManifestSchema,
  computeCourseProvisioningManifestFingerprint,
  deriveSchedulePlanFromManifest,
  legacyCourseDocumentFailsCanonicalParse,
  resolveProvisionedAvailableSeats,
  resolveProvisioningExpectedCourseDayIds,
} = sharedDomain;

const outDir = join(repoRoot, '.scratch', 't31b-pilot');
const manifestPath =
  process.argv[2] ?? join(outDir, 'manifest-course_1784217360616.json');
const inventoryPath = join(outDir, 'inventory-course_1784217360616.json');

const raw = JSON.parse(readFileSync(manifestPath, 'utf8'));
const manifest = CourseProvisioningManifestSchema.parse(raw);
const schedulePlan = deriveSchedulePlanFromManifest(manifest);
const availableSeats = resolveProvisionedAvailableSeats({
  totalSeats: manifest.totalSeats,
  capacityPolicy: manifest.capacityPolicy,
});
const fingerprint = computeCourseProvisioningManifestFingerprint(manifest);

let legacyParseFails = null;
try {
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  legacyParseFails = legacyCourseDocumentFailsCanonicalParse(inventory.course);
} catch {
  legacyParseFails = null;
}

const dryRunResult = {
  mode: 'dry-run-local-validation',
  manifestSchemaValid: true,
  courseId: manifest.courseId,
  plannedCourseDayCount: schedulePlan.courseDayCount,
  startAt: schedulePlan.startAt,
  finalCourseDayEndsAt: schedulePlan.finalCourseDayEndsAt,
  availableSeats,
  manifestFingerprint: fingerprint,
  expectedCourseDayIds: resolveProvisioningExpectedCourseDayIds(manifest),
  legacyCourseDocumentFailsCanonicalParse: legacyParseFails,
  capacityPolicy: manifest.capacityPolicy,
  instructorRosterIds: manifest.instructorRosterIds,
};

mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'dry-run-course_1784217360616.json');
writeFileSync(outPath, JSON.stringify(dryRunResult, null, 2));
console.log(JSON.stringify({ outPath, dryRunResult }, null, 2));
