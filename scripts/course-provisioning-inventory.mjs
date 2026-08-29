#!/usr/bin/env node
/**
 * Inventory helper for canonical course provisioning.
 * Reads legacy course documents and prints a review-oriented summary.
 *
 * Usage:
 *   node scripts/course-provisioning-inventory.mjs --project <firebase-project-id>
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = readArg('--project');
if (!projectId) {
  console.error('Missing required --project <firebase-project-id>');
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const firestore = getFirestore();
const coursesSnap = await firestore.collection('courses').limit(50).get();

const report = [];
for (const courseDoc of coursesSnap.docs) {
  const data = courseDoc.data();
  const daysSnap = await courseDoc.ref.collection('days').get();
  const legacyBookingsSnap = await firestore
    .collection('bookings')
    .where('instructorId', '==', `course_${courseDoc.id}`)
    .limit(20)
    .get();

  report.push({
    courseId: courseDoc.id,
    legacyShape: Boolean(data.dates && data.totalSeats !== undefined),
    canonicalShape: Boolean(data.courseId && data.scheduleProjection),
    instructorIds: data.instructorIds ?? data.instructorRosterIds ?? [],
    totalSeats: data.totalSeats ?? data.capacity?.totalSeats,
    availableSeats: data.availableSeats ?? data.capacity?.availableSeats,
    daysCount: daysSnap.size,
    legacyCourseBookings: legacyBookingsSnap.size,
    proposedManifestStatus: daysSnap.size > 0 ? 'review_existing_days' : 'needs_reviewed_schedule',
  });
}

console.log(JSON.stringify({ projectId, courses: report }, null, 2));

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}
