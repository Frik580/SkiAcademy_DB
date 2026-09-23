export const STAGING_FIREBASE_PROJECT_ID = 'ski-school-staging' as const;

export interface StagingProjectResolutionInput {
  readonly explicitProjectId?: string;
  readonly adminAppProjectId?: string;
  readonly firebaseConfigProjectId?: string;
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
    normalized(input.firebaseConfigProjectId),
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
  let firebaseConfigProjectId: string | undefined;
  const firebaseConfig = normalized(env.FIREBASE_CONFIG);
  if (firebaseConfig) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(firebaseConfig);
    } catch {
      throw new Error('STAGING ONLY: refusing to resolve malformed FIREBASE_CONFIG');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('STAGING ONLY: refusing to resolve malformed FIREBASE_CONFIG');
    }
    const configuredProjectId = (parsed as Record<string, unknown>).projectId;
    if (typeof configuredProjectId !== 'string') {
      throw new Error('STAGING ONLY: refusing FIREBASE_CONFIG without a projectId');
    }
    firebaseConfigProjectId = normalized(configuredProjectId);
    if (!firebaseConfigProjectId) {
      throw new Error('STAGING ONLY: refusing FIREBASE_CONFIG without a projectId');
    }
  }
  const projectId = resolveStagingProjectId({
    explicitProjectId: input.explicitProjectId,
    adminAppProjectId: input.adminAppProjectId,
    firebaseConfigProjectId,
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
