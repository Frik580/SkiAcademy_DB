export const STAGING_FIREBASE_PROJECT_ID = 'ski-school-staging' as const;

export interface StagingProjectResolutionInput {
  readonly explicitProjectId?: string;
  readonly adminAppProjectId?: string;
  readonly googleCloudProject?: string;
  readonly gcloudProject?: string;
}

function normalized(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveStagingProjectId(input: StagingProjectResolutionInput): string {
  const candidates = [
    normalized(input.explicitProjectId),
    normalized(input.adminAppProjectId),
    normalized(input.googleCloudProject),
    normalized(input.gcloudProject),
  ].filter((value): value is string => value !== undefined);

  if (candidates.length === 0) {
    throw new Error('STAGING ONLY: refusing to mutate project <missing>');
  }

  const distinct = [...new Set(candidates)];
  if (distinct.length !== 1) {
    throw new Error(`STAGING ONLY: refusing conflicting project ids ${distinct.join(', ')}`);
  }

  const projectId = distinct[0]!;
  if (projectId !== STAGING_FIREBASE_PROJECT_ID) {
    throw new Error(`STAGING ONLY: refusing to mutate project ${projectId}`);
  }
  return projectId;
}

export function assertNoFirebaseEmulatorTargets(input: {
  readonly firestoreEmulatorHost?: string;
  readonly authEmulatorHost?: string;
  readonly storageEmulatorHost?: string;
}): void {
  const configured = [
    normalized(input.firestoreEmulatorHost),
    normalized(input.authEmulatorHost),
    normalized(input.storageEmulatorHost),
  ].some((value) => value !== undefined);
  if (configured) {
    throw new Error('STAGING ONLY: refusing mutation while Firebase emulator hosts are configured');
  }
}

export function assertStagingMutationEnvironment(input: {
  readonly explicitProjectId?: string;
  readonly adminAppProjectId?: string;
  readonly env?: NodeJS.ProcessEnv;
}): string {
  const env = input.env ?? process.env;
  const projectId = resolveStagingProjectId({
    explicitProjectId: input.explicitProjectId,
    adminAppProjectId: input.adminAppProjectId,
    googleCloudProject: env.GOOGLE_CLOUD_PROJECT,
    gcloudProject: env.GCLOUD_PROJECT,
  });
  assertNoFirebaseEmulatorTargets({
    firestoreEmulatorHost: env.FIRESTORE_EMULATOR_HOST,
    authEmulatorHost: env.FIREBASE_AUTH_EMULATOR_HOST,
    storageEmulatorHost: env.FIREBASE_STORAGE_EMULATOR_HOST,
  });
  return projectId;
}
