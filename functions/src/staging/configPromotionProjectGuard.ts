import {
  PRODUCTION_PROJECT_ID,
  STAGING_PROJECT_ID,
} from './configPromotionContract';

export type ConfigPromotionProjectRole = 'source' | 'target';

export function assertConfigPromotionProject(input: {
  readonly role: ConfigPromotionProjectRole;
  readonly explicitProjectId?: string;
  readonly adminAppProjectId?: string;
  readonly env?: NodeJS.ProcessEnv;
}): string {
  const env = input.env ?? process.env;
  const expected = input.role === 'source' ? STAGING_PROJECT_ID : PRODUCTION_PROJECT_ID;
  const candidates = [
    input.explicitProjectId,
    input.adminAppProjectId,
    env.GOOGLE_CLOUD_PROJECT,
    env.GCLOUD_PROJECT,
    firebaseConfigProjectId(env.FIREBASE_CONFIG),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (!candidates.length) {
    throw new Error(`PROMOTION: refusing ${input.role} project <missing>`);
  }
  const distinct = [...new Set(candidates)];
  if (distinct.length !== 1) {
    throw new Error(`PROMOTION: refusing conflicting ${input.role} project ids ${distinct.join(', ')}`);
  }
  if (distinct[0] !== expected) {
    throw new Error(`PROMOTION: refusing ${input.role} project ${distinct[0]}; expected ${expected}`);
  }
  assertNoEmulatorTargets(env);
  return expected;
}

function firebaseConfigProjectId(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('PROMOTION: refusing malformed FIREBASE_CONFIG');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('PROMOTION: refusing malformed FIREBASE_CONFIG');
  }
  const projectId = (parsed as Record<string, unknown>).projectId;
  if (typeof projectId !== 'string' || !projectId.trim()) {
    throw new Error('PROMOTION: refusing FIREBASE_CONFIG without projectId');
  }
  return projectId.trim();
}

function assertNoEmulatorTargets(env: NodeJS.ProcessEnv): void {
  const configured = [
    env.FIRESTORE_EMULATOR_HOST,
    env.FIREBASE_AUTH_EMULATOR_HOST,
    env.FIREBASE_STORAGE_EMULATOR_HOST,
  ].some((value) => Boolean(value?.trim()));
  if (configured) throw new Error('PROMOTION: refusing Firebase emulator routing');
}
