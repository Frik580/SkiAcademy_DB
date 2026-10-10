'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const migration = require('../lib/canonical/guestConfirmation/guestConfirmationRecovery.js');

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const projectId = option('--project');
const action = option('--action') ?? 'dry-run';
const apply = process.argv.includes('--apply');
if (!['demo-ski-school-e2e', 'ski-school-staging'].includes(projectId)) {
  throw new Error(
    'Use --project demo-ski-school-e2e or ski-school-staging. Production is excluded.'
  );
}
if (projectId.startsWith('demo-') && !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Demo migration requires FIRESTORE_EMULATOR_HOST.');
}
if (
  !['status', 'dry-run', 'begin', 'restart', 'page', 'repair', 'cutover', 'rollback'].includes(
    action
  )
) {
  throw new Error('Unknown migration action.');
}
if (!['status', 'dry-run'].includes(action) && !apply) {
  throw new Error('Mutation requires --apply and separate migration authorization.');
}
initializeApp({ projectId });
const firestore = getFirestore();

async function main() {
  if (action === 'repair')
    console.log(
      JSON.stringify(
        await migration.repairGuestConfirmationQuarantinePage(
          firestore,
          new Date(),
          option('--after-quarantine')
        )
      )
    );
  if (action === 'begin')
    await migration.beginGuestConfirmationBackfill(firestore, option('--evidence') ?? '');
  if (action === 'restart')
    await migration.beginGuestConfirmationBackfill(firestore, option('--evidence') ?? '', {
      restart: true,
    });
  if (action === 'page' || action === 'dry-run') {
    const page = await migration.runGuestConfirmationRecoveryPage(firestore, new Date(), {
      backfill: true,
      dryRun: action === 'dry-run',
      startAfter: {
        bookings: option('--after-booking'),
        course_enrollments: option('--after-enrollment'),
      },
    });
    console.log(JSON.stringify({ action, ...page }));
  }
  if (action === 'cutover')
    await migration.cutoverGuestConfirmationQueue(
      firestore,
      option('--epoch') ?? '',
      option('--evidence') ?? ''
    );
  if (action === 'rollback') await migration.rollbackGuestConfirmationQueue(firestore);
  const state = await migration.readGuestConfirmationControl(firestore);
  console.log(
    JSON.stringify({
      action,
      mode: state?.mode ?? 'legacy',
      epoch: state?.epoch,
      backfillPass: state?.backfillPass ?? 0,
      ready: Boolean(state?.readyEvidence),
    })
  );
}
main().catch(() => {
  console.error(
    'Migration failed; inspect deployment, transfer, lease and blocked-work gates. Cursor retained.'
  );
  process.exitCode = 1;
});
