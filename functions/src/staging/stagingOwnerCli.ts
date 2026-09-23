import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { assertStagingMutationEnvironment } from './stagingProjectGuard';
import { grantStagingOwner } from './stagingOwnerBootstrap';

function parseProjectArgument(argv: readonly string[]): string {
  if (argv.length !== 2 || argv[0] !== '--project' || !argv[1]) {
    throw new Error('Usage: stagingOwnerCli --project ski-school-staging');
  }
  return argv[1];
}

function initializeStagingAdminApp(projectId: string) {
  const appName = 'carve-academy-staging-owner-bootstrap';
  const existing = getApps().find((app) => app.name === appName);
  const app = existing ?? initializeApp({ credential: applicationDefault(), projectId }, appName);
  assertStagingMutationEnvironment({
    explicitProjectId: projectId,
    adminAppProjectId: app.options.projectId,
  });
  return app;
}

async function main(): Promise<void> {
  const projectId = parseProjectArgument(process.argv.slice(2));
  assertStagingMutationEnvironment({ explicitProjectId: projectId });

  const email = process.env.STAGING_OWNER_EMAIL;
  if (!email?.trim()) {
    throw new Error('STAGING_OWNER_EMAIL is required');
  }

  const app = initializeStagingAdminApp(projectId);
  const result = await grantStagingOwner({
    email,
    explicitProjectId: projectId,
    adminAppProjectId: app.options.projectId,
    auth: getAuth(app),
    firestore: getFirestore(app),
  });
  console.info(
    `Staging owner bootstrap ${result.changed ? 'updated' : 'already applied'} for Auth uid ${result.uid}.`
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
