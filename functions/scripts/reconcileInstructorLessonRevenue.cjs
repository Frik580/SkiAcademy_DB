'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');
const {
  reconcileInstructorLessonRevenue,
} = require('../lib/canonical/readModels/instructorLessonRevenueProjection.js');

const projectIndex = process.argv.indexOf('--project');
const projectId = projectIndex >= 0 ? process.argv[projectIndex + 1] : undefined;
if (!projectId) throw new Error('An explicit --project is required.');
initializeApp({ projectId });
const firestore = getFirestore();

async function run() {
  if (process.argv.includes('--release-stale-lock')) {
    if (!process.argv.includes('--apply')) {
      throw new Error('Verify no reconciliation process is running, then explicitly pass --apply.');
    }
    await firestore.doc('instructor_lesson_revenue/reconciliation_lock').delete();
    console.log(
      'Operator released the derived reconciliation lock. Readiness unchanged; rerun reconciliation.'
    );
    return;
  }
  if (process.argv.includes('--apply')) {
    await reconcileInstructorLessonRevenue(firestore);
    console.log('Revenue projection reconciled; ready=true. Canonical data unchanged.');
    return;
  }
  // Read-only inventory is the default. No automatic production execution.
  for (const collection of ['bookings', 'instructor_lesson_revenue_contributions']) {
    let cursor;
    let count = 0;
    for (;;) {
      let query = firestore.collection(collection).orderBy(FieldPath.documentId()).limit(100);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      count += page.size;
      if (page.size < 100) break;
      cursor = page.docs.at(-1).id;
    }
    console.log(JSON.stringify({ mode: 'dry-run', collection, count, pageSize: 100 }));
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
