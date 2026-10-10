'use strict';

const PRODUCTION_PROJECT_ID = 'ski-school-8f3ca';
class MigrationGuardError extends Error {}

// Pure preflight: no Admin SDK, credentials, network or Firestore initialization.
function parseMigrationArguments(argv, env) {
  const values = new Map();
  const flags = new Set(['--apply', '--allow-production']);
  const options = new Set([
    '--project',
    '--action',
    '--confirm-project',
    '--evidence',
    '--epoch',
    '--after-booking',
    '--after-enrollment',
    '--after-quarantine',
  ]);
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    if ((!flags.has(name) && !options.has(name)) || values.has(name))
      throw new MigrationGuardError('Unknown or duplicate migration argument.');
    if (flags.has(name)) values.set(name, true);
    else {
      const value = argv[++index];
      if (!value || value.startsWith('--'))
        throw new MigrationGuardError(`Missing value for ${name}.`);
      values.set(name, value);
    }
  }
  const option = (name) => values.get(name);
  const projectId = option('--project');
  const action = option('--action') ?? 'dry-run';
  if (!['demo-ski-school-e2e', 'ski-school-staging', PRODUCTION_PROJECT_ID].includes(projectId))
    throw new MigrationGuardError('Use an exact supported Firebase project ID with --project.');
  if (
    !['status', 'dry-run', 'begin', 'restart', 'page', 'repair', 'cutover', 'rollback'].includes(
      action
    )
  )
    throw new MigrationGuardError('Unknown migration action.');
  if (projectId === PRODUCTION_PROJECT_ID) {
    if (!option('--allow-production') || option('--confirm-project') !== PRODUCTION_PROJECT_ID)
      throw new MigrationGuardError(
        'Production requires --allow-production --confirm-project ski-school-8f3ca, including reads.'
      );
    if (Object.keys(env).some((name) => /EMULATOR|^FIRESTORE_HOST$/i.test(name)))
      throw new MigrationGuardError(
        'Production refuses emulator environment variables; unset them first.'
      );
    for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'GCP_PROJECT']) {
      if (env[name] !== undefined && env[name] !== projectId)
        throw new MigrationGuardError(`Production project mismatch in ${name}.`);
    }
    if (env.FIREBASE_CONFIG !== undefined) {
      let config;
      try {
        config = JSON.parse(env.FIREBASE_CONFIG);
      } catch {
        throw new MigrationGuardError(
          'Production requires inline JSON FIREBASE_CONFIG or an unset variable.'
        );
      }
      if (
        !config ||
        typeof config !== 'object' ||
        Array.isArray(config) ||
        (config.projectId !== undefined && config.projectId !== projectId)
      )
        throw new MigrationGuardError('Production project mismatch in FIREBASE_CONFIG.');
    }
  } else {
    if (option('--allow-production'))
      throw new MigrationGuardError('--allow-production requires the production project ID.');
    if (option('--confirm-project') !== undefined && option('--confirm-project') !== projectId)
      throw new MigrationGuardError('--confirm-project must exactly match --project.');
    if (projectId.startsWith('demo-') && !env.FIRESTORE_EMULATOR_HOST)
      throw new MigrationGuardError('Demo migration requires FIRESTORE_EMULATOR_HOST.');
  }
  if (!['status', 'dry-run'].includes(action) && !option('--apply'))
    throw new MigrationGuardError(
      'Mutation requires --apply and separate migration authorization.'
    );
  if (['begin', 'restart', 'cutover'].includes(action) && !option('--evidence')?.trim())
    throw new MigrationGuardError('Deployment/readiness --evidence is required.');
  if (action === 'cutover' && !option('--epoch')?.trim())
    throw new MigrationGuardError('Cutover requires --epoch from current status.');
  return { projectId, action, option };
}

function loadRuntime() {
  return {
    ...require('firebase-admin/app'),
    ...require('firebase-admin/firestore'),
    migration: require('../lib/canonical/guestConfirmation/guestConfirmationRecovery.js'),
  };
}

async function runCli(
  argv = process.argv.slice(2),
  env = process.env,
  runtimeLoader = loadRuntime
) {
  const { projectId, action, option } = parseMigrationArguments(argv, env);
  const { initializeApp, getFirestore, migration } = runtimeLoader();
  const app = initializeApp({ projectId });
  if (app.options.projectId !== projectId)
    throw new MigrationGuardError('Firebase Admin project mismatch.');
  const firestore = getFirestore(app);
  if (firestore.projectId !== projectId)
    throw new MigrationGuardError('Firestore project mismatch.');
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
  // Bounded readiness probes; do not drain the work/quarantine collections.
  const blockers =
    action === 'status'
      ? await Promise.all([
          firestore
            .collection('guest_confirmation_reconciliation_work')
            .where('status', '==', 'blocked')
            .limit(1)
            .get(),
          firestore.collection('guest_confirmation_reconciliation_quarantine').limit(1).get(),
        ])
      : undefined;
  console.log(
    JSON.stringify({
      projectId,
      action,
      mode: state?.mode ?? 'legacy',
      epoch: state?.epoch,
      backfillPass: state?.backfillPass ?? 0,
      ready: Boolean(state?.readyEvidence),
      ...(action === 'status'
        ? {
            backfill: state?.backfill,
            leaseToken: state?.leaseToken,
            leaseUntilMs: state?.leaseUntilMs,
            deploymentEvidence: state?.deploymentEvidence,
            readyEvidence: state?.readyEvidence,
            blockedWork: !blockers[0].empty,
            quarantine: !blockers[1].empty,
          }
        : {}),
    })
  );
}
module.exports = { parseMigrationArguments, runCli };
if (require.main === module)
  runCli().catch((error) => {
    if (error instanceof MigrationGuardError) console.error(error.message);
    console.error(
      'Migration failed; inspect deployment, transfer, lease and blocked-work gates. Cursor retained.'
    );
    process.exitCode = 1;
  });
