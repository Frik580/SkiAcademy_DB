#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const projectId = 'ski-school-8f3ca';
const databaseId = '(default)';
const courseId = process.argv[2] ?? 'course_1784217360616';
const outDir = join(repoRoot, '.scratch', 't31b-pilot');

const cfg = JSON.parse(
  readFileSync(join(process.env.USERPROFILE, '.config', 'configstore', 'firebase-tools.json'), 'utf8')
);
const accessToken = cfg.tokens?.access_token;
if (!accessToken) {
  console.error('No Firebase CLI access token found. Run: npx firebase login --reauth');
  process.exit(1);
}

const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;

async function firestoreGet(path) {
  const res = await fetch(`${baseUrl}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function firestoreRunQuery(structuredQuery) {
  const res = await fetch(`${baseUrl}:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`runQuery failed: ${res.status} ${body}`);
  }
  return res.json();
}

async function firestoreList(collectionPath) {
  const res = await fetch(`${baseUrl}/${collectionPath}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LIST ${collectionPath} failed: ${res.status} ${body}`);
  }
  return res.json();
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map(decodeValue);
  }
  if ('mapValue' in value) {
    const out = {};
    for (const [key, nested] of Object.entries(value.mapValue.fields ?? {})) {
      out[key] = decodeValue(nested);
    }
    return out;
  }
  return value;
}

function decodeDocument(doc) {
  if (!doc) return null;
  const id = doc.name.split('/').pop();
  const data = {};
  for (const [key, value] of Object.entries(doc.fields ?? {})) {
    data[key] = decodeValue(value);
  }
  return { id, ...data };
}

const courseDoc = await firestoreGet(`courses/${courseId}`);
if (!courseDoc) {
  console.error(`Course not found: ${courseId}`);
  process.exit(1);
}

const daysList = await firestoreList(`courses/${courseId}/days`);
const catalogDoc = await firestoreGet(`course_catalog_content/${courseId}`);
let legacyBookings = [];
let canonicalEnrollments = [];
try {
  const bookingQuery = await firestoreRunQuery({
    from: [{ collectionId: 'bookings' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'instructorId' },
        op: 'EQUAL',
        value: { stringValue: `course_${courseId}` },
      },
    },
    limit: 20,
  });
  legacyBookings = bookingQuery
    .map((row) => decodeDocument(row.document))
    .filter(Boolean);
} catch (error) {
  legacyBookings = { error: error.message };
}
try {
  const enrollmentQuery = await firestoreRunQuery({
    from: [{ collectionId: 'course_enrollments' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'courseId' },
        op: 'EQUAL',
        value: { stringValue: courseId },
      },
    },
    limit: 20,
  });
  canonicalEnrollments = enrollmentQuery
    .map((row) => decodeDocument(row.document))
    .filter(Boolean);
} catch (error) {
  canonicalEnrollments = { error: error.message };
}
const coursesList = await firestoreList('courses');

const inventory = [];
for (const doc of coursesList.documents ?? []) {
  const decoded = decodeDocument(doc);
  const days = await firestoreList(`courses/${decoded.id}/days`);
  inventory.push({
    courseId: decoded.id,
    title: decoded.title,
    legacyShape: Boolean(decoded.dates && decoded.totalSeats !== undefined),
    canonicalShape: Boolean(decoded.courseId && decoded.scheduleProjection),
    instructorIds: decoded.instructorIds ?? decoded.instructorRosterIds ?? [],
    totalSeats: decoded.totalSeats ?? decoded.capacity?.totalSeats,
    availableSeats: decoded.availableSeats ?? decoded.capacity?.availableSeats,
    price: decoded.price,
    priceKZT: decoded.priceKZT,
    daysCount: (days.documents ?? []).length,
    isHidden: decoded.isHidden ?? false,
    proposedManifestStatus:
      (days.documents ?? []).length > 0 ? 'review_existing_days' : 'needs_reviewed_schedule',
  });
}

const report = {
  projectId,
  generatedAt: new Date().toISOString(),
  pilotCourseId: courseId,
  course: decodeDocument(courseDoc),
  daysCount: (daysList.documents ?? []).length,
  days: (daysList.documents ?? []).map(decodeDocument),
  catalogExists: Boolean(catalogDoc),
  catalog: decodeDocument(catalogDoc),
  legacyBookingsCount: Array.isArray(legacyBookings) ? legacyBookings.length : null,
  legacyBookings,
  canonicalEnrollmentsCount: Array.isArray(canonicalEnrollments)
    ? canonicalEnrollments.length
    : null,
  canonicalEnrollments,
  inventory,
};

mkdirSync(outDir, { recursive: true });
const backupPath = join(outDir, `legacy-backup-${courseId}.json`);
const inventoryPath = join(outDir, `inventory-${courseId}.json`);
writeFileSync(backupPath, JSON.stringify({ courseId, course: report.course, catalog: report.catalog }, null, 2));
writeFileSync(inventoryPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      backupPath,
      inventoryPath,
      summary: {
        courseId,
        daysCount: report.daysCount,
        catalogExists: report.catalogExists,
        inventoryCourses: inventory.length,
      },
    },
    null,
    2
  )
);
