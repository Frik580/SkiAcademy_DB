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
  courseScheduleIsComplete,
  evaluateCourseCatalogEnrollmentEligibility,
  isCourseCapacityFrozen,
  isCourseEnrollmentAllowedBeforeStart,
  isCourseOperationalForEnrollment,
  normalizeFirestoreDocument,
  sortedCourseDays,
  timestampFromDate,
  verifyProvisionedCourseSchedule,
  CourseSchema,
  CourseDaySchema,
} = sharedDomain;

const projectId = 'ski-school-8f3ca';
const region = 'us-central1';
const courseId = process.argv[2] ?? 'course_1784217360616';
const inventoryPath =
  process.argv[3] ?? join(repoRoot, '.scratch', 't31b-pilot', `inventory-${courseId}.json`);
const outDir = join(repoRoot, '.scratch', 't31b-pilot');

function parseCourse(data) {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = CourseSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

function parseCourseDay(data) {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = CourseDaySchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

function diagnoseOperationalGate(course, courseDays) {
  const sortedDays = sortedCourseDays(courseDays);
  const sortedActualIds = sortedDays.map((day) => day.courseDayId);
  const expectedIds = course.provisioningExpectedCourseDayIds ?? [];

  const scheduleComplete = courseScheduleIsComplete(course, courseDays);
  const verifySchedule = verifyProvisionedCourseSchedule(course, courseDays);

  let expectedIdsMatch = true;
  let expectedIdsMismatch = null;
  if (course.provisioningExpectedCourseDayIds) {
    if (sortedActualIds.length !== expectedIds.length) {
      expectedIdsMatch = false;
      expectedIdsMismatch = {
        reason: 'length_mismatch',
        expectedLength: expectedIds.length,
        actualLength: sortedActualIds.length,
      };
    } else {
      for (let index = 0; index < expectedIds.length; index += 1) {
        if (sortedActualIds[index] !== expectedIds[index]) {
          expectedIdsMatch = false;
          expectedIdsMismatch = {
            reason: 'id_mismatch_at_index',
            index,
            expected: expectedIds[index],
            actual: sortedActualIds[index],
          };
          break;
        }
      }
    }
  }

  const operational = isCourseOperationalForEnrollment(course, courseDays);

  return {
    scheduleComplete,
    verifySchedule,
    expectedIdsMatch,
    expectedIdsMismatch,
    operational,
    sortedActualIds,
    expectedIds,
    firestoreListOrderIds: courseDays.map((day) => day.courseDayId),
  };
}

function diagnoseEligibility(course, now) {
  const availableSeatsOk = course.capacity.availableSeats > 0;
  const capacityFrozen = isCourseCapacityFrozen({ now, courseStartAt: course.startAt });
  const beforeStart = isCourseEnrollmentAllowedBeforeStart({
    now,
    courseStartsAt: course.startAt,
  });
  const isEligible = evaluateCourseCatalogEnrollmentEligibility({ now, course });

  return {
    availableSeatsOk,
    availableSeats: course.capacity.availableSeats,
    capacityFrozen,
    beforeStart,
    isEligible,
    now: {
      seconds: now.seconds,
      nanoseconds: now.nanoseconds,
      iso: new Date(now.seconds * 1000 + now.nanoseconds / 1_000_000).toISOString(),
    },
    courseStartAt: course.startAt,
  };
}

async function callProductionCatalogCallable() {
  const cfg = JSON.parse(
    readFileSync(join(process.env.USERPROFILE, '.config', 'configstore', 'firebase-tools.json'), 'utf8')
  );
  const accessToken = cfg.tokens?.access_token;
  if (!accessToken) {
    return { error: 'No Firebase CLI access token. Run: npx firebase login --reauth' };
  }

  const url = `https://${region}-${projectId}.cloudfunctions.net/queryCourseCatalogReadModels`;
  const body = { data: { scope: 'public' } };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    return { error: `Callable failed: ${res.status}`, response: parsed };
  }
  const result = parsed.result ?? parsed;
  const baseItem = Array.isArray(result.items)
    ? result.items.find((item) => item.courseId === courseId)
    : undefined;
  return {
    callableStatus: res.status,
    totalItems: Array.isArray(result.items) ? result.items.length : null,
    courseIds: Array.isArray(result.items) ? result.items.map((item) => item.courseId) : [],
    baseItem: baseItem ?? null,
    baseAbsent: baseItem === undefined,
    rawResult: result,
  };
}

const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const courseRaw = { ...inventory.course };
delete courseRaw.id;
const course = parseCourse(courseRaw);
const courseDays = inventory.days
  .map((day) => {
    const raw = { ...day };
    delete raw.id;
    return parseCourseDay(raw);
  })
  .filter(Boolean);

const now = timestampFromDate(new Date());
const gate = course
  ? diagnoseOperationalGate(course, courseDays)
  : { error: 'parseCourse failed', courseRaw };
const eligibility = course ? diagnoseEligibility(course, now) : null;

let productionCatalog;
try {
  productionCatalog = await callProductionCatalogCallable();
} catch (error) {
  productionCatalog = { error: error instanceof Error ? error.message : String(error) };
}

const report = {
  generatedAt: new Date().toISOString(),
  projectId,
  courseId,
  parseCourseSucceeded: Boolean(course),
  parsedCourseDaysCount: courseDays.length,
  courseSummary: course
    ? {
        courseId: course.courseId,
        revision: course.revision,
        capacity: course.capacity,
        startAt: course.startAt,
        scheduleProjection: course.scheduleProjection,
        provisioningManifestFingerprint: course.provisioningManifestFingerprint,
        provisioningExpectedCourseDayIds: course.provisioningExpectedCourseDayIds,
      }
    : null,
  operationalGate: gate,
  eligibility,
  productionCatalog,
};

mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `catalog-diagnose-${courseId}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outPath, report }, null, 2));
