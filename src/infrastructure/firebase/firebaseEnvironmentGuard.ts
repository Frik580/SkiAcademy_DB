export const STAGING_FIREBASE_PROJECT_ID = 'ski-school-staging';
export const PRODUCTION_FIREBASE_PROJECT_ID = 'ski-school-8f3ca';

const STAGING_HOSTS = new Set(['ski-school-staging.web.app', 'ski-school-staging.firebaseapp.com']);

const PRODUCTION_HOSTS = new Set(['ski-school-8f3ca.web.app', 'ski-school-8f3ca.firebaseapp.com']);

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export class FirebaseEnvironmentGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirebaseEnvironmentGuardError';
  }
}

export interface FirebaseEnvironmentGuardInput {
  readonly hostname: string;
  readonly projectId: string;
  readonly useEmulators: boolean;
}

/**
 * Fail before Firebase services are created when the page host and the
 * baked project id do not belong together. Local development may use the
 * staging project, or the Firebase emulators. It may not use production.
 */
export function assertFirebaseEnvironment(input: FirebaseEnvironmentGuardInput): void {
  const hostname = input.hostname.trim().toLowerCase();
  const projectId = input.projectId.trim();
  const onStagingHost = STAGING_HOSTS.has(hostname);
  const onProductionHost = PRODUCTION_HOSTS.has(hostname);
  const onLocalHost = LOCAL_HOSTS.has(hostname);

  if (onStagingHost && projectId !== STAGING_FIREBASE_PROJECT_ID) {
    throw new FirebaseEnvironmentGuardError(
      `Refusing to start on ${hostname}: Firebase project is "${projectId}", expected ${STAGING_FIREBASE_PROJECT_ID}.`
    );
  }

  if (onProductionHost && projectId !== PRODUCTION_FIREBASE_PROJECT_ID) {
    throw new FirebaseEnvironmentGuardError(
      `Refusing to start on ${hostname}: Firebase project is "${projectId}", expected ${PRODUCTION_FIREBASE_PROJECT_ID}.`
    );
  }

  if (onStagingHost || onProductionHost) return;

  if (onLocalHost && input.useEmulators) return;

  if (onLocalHost && projectId === STAGING_FIREBASE_PROJECT_ID) return;

  if (onLocalHost) {
    throw new FirebaseEnvironmentGuardError(
      `Refusing to start on ${hostname}: local development may use ${STAGING_FIREBASE_PROJECT_ID} or the Firebase emulators, not "${projectId}".`
    );
  }

  if (projectId === PRODUCTION_FIREBASE_PROJECT_ID) {
    throw new FirebaseEnvironmentGuardError(
      `Refusing to start on ${hostname}: production Firebase project ${PRODUCTION_FIREBASE_PROJECT_ID} is only allowed on the production hosting host.`
    );
  }
}
