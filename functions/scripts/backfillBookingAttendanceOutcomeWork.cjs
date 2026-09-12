'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const {
  backfillLessonBookingAttendanceOutcomeWork,
  markLessonBookingAttendanceOutcomeWorkMigrationReady,
} = require('../lib/canonical/bookings/bookingAttendanceOutcomeWorkSync.js');

function readOption(name) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const apply = process.argv.includes('--apply');
const projectId = readOption('--project');
const pageSize = Number(readOption('--page-size') ?? '100');
const nowText = readOption('--now');
const now = nowText ? new Date(nowText) : new Date();

if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
  throw new Error('--page-size must be an integer between 1 and 500.');
}
if (Number.isNaN(now.getTime())) {
  throw new Error('--now must be an ISO-8601 date.');
}

initializeApp(projectId ? { projectId } : undefined);
const firestore = getFirestore();

async function dryRun() {
  let cursor;
  let scannedBookings = 0;
  while (true) {
    let query = firestore.collection('bookings').orderBy('bookingId', 'asc').limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    scannedBookings += snapshot.size;
    const lastDocument = snapshot.docs.at(-1);
    const lastBookingId = lastDocument?.get('bookingId');
    cursor = typeof lastBookingId === 'string' ? lastBookingId : lastDocument?.id;
    if (snapshot.size < pageSize) break;
  }
  console.log(
    JSON.stringify({ mode: 'dry-run', scannedBookings, pageSize, now: now.toISOString() })
  );
}

async function applyBackfill() {
  let cursor;
  let scannedBookings = 0;
  const outcomes = { created: 0, updated: 0, unchanged: 0, deleted: 0, blocked: 0 };
  while (true) {
    const page = await backfillLessonBookingAttendanceOutcomeWork(firestore, {
      maxBookings: pageSize,
      ...(cursor ? { startAfterBookingId: cursor } : {}),
      now,
    });
    scannedBookings += page.scannedBookings;
    for (const [key, value] of Object.entries(page.outcomes)) outcomes[key] += value;
    cursor = page.cursor;
    console.log(
      JSON.stringify({
        mode: 'apply-page',
        scannedBookings,
        cursor,
        outcomes,
        now: now.toISOString(),
      })
    );
    if (!page.truncated) break;
  }
  await markLessonBookingAttendanceOutcomeWorkMigrationReady(firestore, now);
  console.log(
    JSON.stringify({ mode: 'complete', scannedBookings, outcomes, migrationReady: true })
  );
}

(apply ? applyBackfill() : dryRun()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
