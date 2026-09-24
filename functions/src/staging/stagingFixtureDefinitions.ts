import {
  AccountIdSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  CourseProvisioningManifestSchema,
  InstructorIdSchema,
  KztMinorUnitsSchema,
  MonetaryEventIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  accountCommandActor,
  activityLogIdFromCommandId,
  canonicalPaths,
  expandUtcGuardBuckets,
  monetaryEventIdFromCommandEffect,
  participantManagementIdFromSelfProvisioning,
  resolveCommandIdempotencyIdentity,
  resolveManifestDayInterval,
  resourceClaimGuardIdFromBucketIdentity,
  selfParticipantIdFromAccountId,
  type CommandEnvelope,
  type CommandKind,
  type CourseProvisioningManifest,
} from '@ski-academy/shared-domain';
import { courseDayInstructorClaimIdentity } from '../canonical/courses/courseDayClaimOperations';

export const STAGING_FIXTURE_ID = 'carve_academy_staging_v2' as const;
export const STAGING_FIXTURE_VERSION = 2 as const;
export const STAGING_FIXTURE_MANIFEST_PATH =
  `staging_fixture_manifests/${STAGING_FIXTURE_ID}` as const;

export const LEGACY_STAGING_FIXTURE_ID = 'carve_academy_staging_v1' as const;
export const LEGACY_STAGING_FIXTURE_VERSION = 1 as const;
export const LEGACY_STAGING_FIXTURE_MANIFEST_PATH =
  `staging_fixture_manifests/${LEGACY_STAGING_FIXTURE_ID}` as const;

export const STAGING_ACCOUNT_IDS = {
  admin: AccountIdSchema.parse('staging-admin'),
  parent: AccountIdSchema.parse('staging-parent'),
} as const;

const LEGACY_STAGING_ACCOUNT_IDS = {
  admin: STAGING_ACCOUNT_IDS.admin,
  instructor: AccountIdSchema.parse('staging-instructor'),
  parent: STAGING_ACCOUNT_IDS.parent,
} as const;

type FixtureAccountId =
  | (typeof STAGING_ACCOUNT_IDS)[keyof typeof STAGING_ACCOUNT_IDS]
  | (typeof LEGACY_STAGING_ACCOUNT_IDS)[keyof typeof LEGACY_STAGING_ACCOUNT_IDS];

const LEGACY_STAGING_INSTRUCTOR_ID = InstructorIdSchema.parse('staging-instructor-catalog');

export const STAGING_DEPENDENT_PARTICIPANTS = [
  {
    participantId: ParticipantIdSchema.parse('staging-participant-alex'),
    participantManagementId: ParticipantManagementIdSchema.parse('staging-management-alex'),
    displayName: 'Alex Staging',
    age: { kind: 'birth_date' as const, birthDate: '2014-02-10' },
    skillLevel: 'beginner',
    discipline: 'ski' as const,
  },
  {
    participantId: ParticipantIdSchema.parse('staging-participant-mia'),
    participantManagementId: ParticipantManagementIdSchema.parse('staging-management-mia'),
    displayName: 'Mia Staging',
    age: { kind: 'birth_date' as const, birthDate: '2016-07-18' },
    skillLevel: 'beginner',
    discipline: 'snowboard' as const,
  },
] as const;

export const STAGING_AUTH_FIXTURES = [
  {
    uid: STAGING_ACCOUNT_IDS.admin,
    email: 'staging-admin@carveacademy.local',
    displayName: 'Staging Admin (internal fixture actor)',
    passwordEnvironmentVariable: 'STAGING_ADMIN_PASSWORD',
  },
  {
    uid: STAGING_ACCOUNT_IDS.parent,
    email: 'staging-parent@carveacademy.local',
    displayName: 'Staging Parent',
    passwordEnvironmentVariable: 'STAGING_PARENT_PASSWORD',
  },
] as const;

const LEGACY_STAGING_AUTH_FIXTURES = [
  {
    uid: LEGACY_STAGING_ACCOUNT_IDS.admin,
    email: 'staging-admin@carveacademy.local',
    displayName: 'Staging Admin',
    passwordEnvironmentVariable: 'STAGING_ADMIN_PASSWORD',
  },
  {
    uid: LEGACY_STAGING_ACCOUNT_IDS.instructor,
    email: 'staging-instructor@carveacademy.local',
    displayName: 'Staging Instructor',
    passwordEnvironmentVariable: 'STAGING_INSTRUCTOR_PASSWORD',
  },
  {
    uid: LEGACY_STAGING_ACCOUNT_IDS.parent,
    email: 'staging-parent@carveacademy.local',
    displayName: 'Staging Parent',
    passwordEnvironmentVariable: 'STAGING_PARENT_PASSWORD',
  },
] as const;

function dateFromIsoDate(value: string): Date {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid staging schedule anchor date: ${value}`);
  }
  return parsed;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = dateFromIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function buildLegacyStagingCourseManifestsV1(
  scheduleAnchorDate: string
): readonly CourseProvisioningManifest[] {
  dateFromIsoDate(scheduleAnchorDate);
  const courseOneId = CourseIdSchema.parse('staging-course-ski-foundations');
  const courseTwoId = CourseIdSchema.parse('staging-course-snowboard-progress');
  return [
    CourseProvisioningManifestSchema.parse({
      courseId: courseOneId,
      title: 'Staging Ski Foundations',
      price: KztMinorUnitsSchema.parse(120_000),
      totalSeats: 8,
      capacityPolicy: { kind: 'seed_full' },
      instructorRosterIds: [LEGACY_STAGING_INSTRUCTOR_ID],
      timeZone: 'Asia/Almaty',
      days: [0, 2, 4].map((offset, index) => ({
        courseDayId: CourseDayIdSchema.parse(`staging-ski-day-${index + 1}`),
        dayOrder: index + 1,
        localDate: addDays(scheduleAnchorDate, offset),
        localTime: '09:00',
        durationMinutes: 120,
        instructorId: LEGACY_STAGING_INSTRUCTOR_ID,
      })),
      presentation: {
        duration: '3 занятия по 2 часа',
        description: 'Синтетический staging-курс для ручной и E2E-проверки записи.',
        dates: `${addDays(scheduleAnchorDate, 0)} — ${addDays(scheduleAnchorDate, 4)}`,
        bgImageUrl: 'https://placehold.co/1200x800/png?text=Staging+Ski',
        badge: 'STAGING',
        level: 'beginner',
        order: 10,
      },
    }),
    CourseProvisioningManifestSchema.parse({
      courseId: courseTwoId,
      title: 'Staging Snowboard Progress',
      price: KztMinorUnitsSchema.parse(150_000),
      totalSeats: 6,
      capacityPolicy: { kind: 'seed_full' },
      instructorRosterIds: [LEGACY_STAGING_INSTRUCTOR_ID],
      timeZone: 'Asia/Almaty',
      days: [1, 3, 5].map((offset, index) => ({
        courseDayId: CourseDayIdSchema.parse(`staging-snowboard-day-${index + 1}`),
        dayOrder: index + 1,
        localDate: addDays(scheduleAnchorDate, offset),
        localTime: '14:00',
        durationMinutes: 120,
        instructorId: LEGACY_STAGING_INSTRUCTOR_ID,
      })),
      presentation: {
        duration: '3 занятия по 2 часа',
        description: 'Синтетический staging-курс для проверки каталога и enrollment.',
        dates: `${addDays(scheduleAnchorDate, 1)} — ${addDays(scheduleAnchorDate, 5)}`,
        bgImageUrl: 'https://placehold.co/1200x800/png?text=Staging+Snowboard',
        badge: 'STAGING',
        level: 'intermediate',
        order: 20,
      },
    }),
  ];
}

function selfParticipantEnvelope(accountId: FixtureAccountId, version: 1 | 2) {
  return {
    kind: 'provision_self_participant',
    context: {
      actor: accountCommandActor(accountId),
      exercisedCapability: 'account_owner',
      idempotencyKey: `staging-fixture-v${version}:self:${accountId}`,
      correlationId: CorrelationIdSchema.parse(`staging-self-${accountId}`),
      source: 'client_callable',
    },
    intent: {},
  } satisfies CommandEnvelope<'provision_self_participant'>;
}

function adminContext(idempotencyKey: string, correlationId: string, expectedRevision?: number) {
  return {
    actor: accountCommandActor(STAGING_ACCOUNT_IDS.admin),
    exercisedCapability: 'administrator' as const,
    idempotencyKey,
    correlationId: CorrelationIdSchema.parse(correlationId),
    source: 'admin_callable' as const,
    ...(expectedRevision === undefined
      ? {}
      : { expectedRevision: AggregateRevisionSchema.parse(expectedRevision) }),
  };
}

export function buildStagingCommandEnvelopes(): readonly CommandEnvelope<CommandKind>[] {
  const selfCommand = selfParticipantEnvelope(STAGING_ACCOUNT_IDS.parent, STAGING_FIXTURE_VERSION);
  const dependentCommands = STAGING_DEPENDENT_PARTICIPANTS.map(
    (dependent) =>
      ({
        kind: 'create_managed_dependent_participant',
        context: adminContext(
          `staging-fixture-v${STAGING_FIXTURE_VERSION}:dependent:${dependent.participantId}`,
          `staging-dependent-${dependent.participantId}`
        ),
        intent: {
          ...dependent,
          accountId: STAGING_ACCOUNT_IDS.parent,
          reasonExplanation: 'Create deterministic staging smoke fixture participant',
        },
      }) satisfies CommandEnvelope<'create_managed_dependent_participant'>
  );
  const walletCommand = {
    kind: 'record_manual_wallet_funding',
    context: adminContext(
      `staging-fixture-v${STAGING_FIXTURE_VERSION}:wallet-funding`,
      'staging-wallet-funding-v2'
    ),
    intent: {
      accountId: STAGING_ACCOUNT_IDS.parent,
      amount: KztMinorUnitsSchema.parse(1_000_000),
      reasonExplanation: 'Deterministic staging smoke fixture opening balance',
    },
  } satisfies CommandEnvelope<'record_manual_wallet_funding'>;
  return [selfCommand, ...dependentCommands, walletCommand];
}

function buildLegacyStagingCommandEnvelopesV1(
  scheduleAnchorDate: string
): readonly CommandEnvelope<CommandKind>[] {
  const selfCommands = Object.values(LEGACY_STAGING_ACCOUNT_IDS).map((accountId) =>
    selfParticipantEnvelope(accountId, LEGACY_STAGING_FIXTURE_VERSION)
  );
  const dependentCommands = STAGING_DEPENDENT_PARTICIPANTS.map(
    (dependent) =>
      ({
        kind: 'create_managed_dependent_participant',
        context: adminContext(
          `staging-fixture-v1:dependent:${dependent.participantId}`,
          `staging-dependent-${dependent.participantId}`
        ),
        intent: {
          ...dependent,
          accountId: LEGACY_STAGING_ACCOUNT_IDS.parent,
          reasonExplanation: 'Create deterministic staging fixture participant',
        },
      }) satisfies CommandEnvelope<'create_managed_dependent_participant'>
  );
  const instructorCommand = {
    kind: 'create_instructor_catalog_entry',
    context: adminContext('staging-fixture-v1:instructor-catalog', 'staging-instructor-catalog', 1),
    intent: {
      instructorId: LEGACY_STAGING_INSTRUCTOR_ID,
      accountId: LEGACY_STAGING_ACCOUNT_IDS.instructor,
      name: 'Staging Instructor',
      specialty: 'both',
      languages: ['ru', 'en'],
      experienceYears: 8,
      bio: 'Synthetic staging instructor for manual and E2E testing.',
      pricePerHourKZT: 25_000,
      reasonExplanation: 'Create deterministic staging fixture instructor',
    },
  } satisfies CommandEnvelope<'create_instructor_catalog_entry'>;
  const walletCommand = {
    kind: 'record_manual_wallet_funding',
    context: adminContext('staging-fixture-v1:wallet-funding', 'staging-wallet-funding'),
    intent: {
      accountId: LEGACY_STAGING_ACCOUNT_IDS.parent,
      amount: KztMinorUnitsSchema.parse(1_000_000),
      reasonExplanation: 'Deterministic staging fixture opening balance',
    },
  } satisfies CommandEnvelope<'record_manual_wallet_funding'>;
  const courseCommands = buildLegacyStagingCourseManifestsV1(scheduleAnchorDate).map(
    (manifest) =>
      ({
        kind: 'apply_canonical_course_provisioning_manifest',
        context: adminContext(
          `staging-fixture-v1:course:${manifest.courseId}`,
          `staging-course-${manifest.courseId}`
        ),
        intent: { manifest, dryRun: false },
      }) satisfies CommandEnvelope<'apply_canonical_course_provisioning_manifest'>
  );
  return [...selfCommands, ...dependentCommands, instructorCommand, walletCommand, ...courseCommands];
}

export interface ResourceClaimOwnership {
  readonly claimPath: string;
  readonly guardPaths: readonly string[];
}

export interface StagingFixturePlan {
  readonly fixtureId: typeof STAGING_FIXTURE_ID | typeof LEGACY_STAGING_FIXTURE_ID;
  readonly version: typeof STAGING_FIXTURE_VERSION | typeof LEGACY_STAGING_FIXTURE_VERSION;
  readonly scheduleAnchorDate?: string;
  readonly commandEnvelopes: readonly CommandEnvelope<CommandKind>[];
  readonly ownedFirestorePaths: readonly string[];
  readonly resourceClaimOwnership: readonly ResourceClaimOwnership[];
  readonly authUids: readonly string[];
  readonly storagePrefixes: readonly string[];
}

export interface StagingFixtureManifestOwnership {
  readonly fixtureId: string;
  readonly version: number;
  readonly scheduleAnchorDate?: string;
  readonly ownedFirestorePaths: readonly string[];
  readonly resourceClaimOwnership: readonly ResourceClaimOwnership[];
  readonly authUids: readonly string[];
  readonly storagePrefixes: readonly string[];
}

function transactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

function resourceClaimOwnershipForManifests(
  manifests: readonly CourseProvisioningManifest[]
): ResourceClaimOwnership[] {
  return manifests.flatMap((manifest) =>
    manifest.days.map((day) => {
      const interval = resolveManifestDayInterval(day, manifest.timeZone).interval;
      const identity = courseDayInstructorClaimIdentity({
        courseDayId: day.courseDayId,
        instructorId: day.instructorId,
        occurrenceRevision: 1,
      });
      const guardPaths = expandUtcGuardBuckets('instructor', day.instructorId, interval).map(
        (bucket) =>
          transactionPath(
            canonicalPaths.resourceClaimGuard(
              resourceClaimGuardIdFromBucketIdentity(bucket.bucketIdentity, bucket.scope)
            )
          )
      );
      return {
        claimPath: transactionPath(canonicalPaths.resourceClaim(identity.instructorClaimId)),
        guardPaths,
      };
    })
  );
}

function assembleFixturePlan(input: {
  readonly fixtureId: StagingFixturePlan['fixtureId'];
  readonly version: StagingFixturePlan['version'];
  readonly scheduleAnchorDate?: string;
  readonly accountIds: readonly FixtureAccountId[];
  readonly selfParticipantAccountIds: readonly FixtureAccountId[];
  readonly parentAccountId: FixtureAccountId;
  readonly instructorId?: ReturnType<typeof InstructorIdSchema.parse>;
  readonly courseManifests: readonly CourseProvisioningManifest[];
  readonly commandEnvelopes: readonly CommandEnvelope<CommandKind>[];
  readonly authFixtures: readonly { readonly uid: string }[];
}): StagingFixturePlan {
  const selfParticipants = input.selfParticipantAccountIds.map((accountId) => ({
    participantId: selfParticipantIdFromAccountId(accountId),
    participantManagementId: participantManagementIdFromSelfProvisioning(accountId),
  }));
  const resourceClaimOwnership = resourceClaimOwnershipForManifests(input.courseManifests);
  const commandPaths = input.commandEnvelopes.flatMap((envelope) => {
    const identity = resolveCommandIdempotencyIdentity(envelope);
    return [
      transactionPath(identity.recordPath),
      transactionPath(canonicalPaths.activityLog(activityLogIdFromCommandId(identity.commandKey))),
    ];
  });
  const walletEnvelope = input.commandEnvelopes.find(
    (envelope) => envelope.kind === 'record_manual_wallet_funding'
  );
  if (!walletEnvelope) throw new Error('Staging wallet command is missing');
  const walletIdentity = resolveCommandIdempotencyIdentity(walletEnvelope);
  const walletEventId = MonetaryEventIdSchema.parse(
    monetaryEventIdFromCommandEffect(walletIdentity.commandKey, 0)
  );

  const paths = new Set<string>([
    ...input.accountIds.map((accountId) => transactionPath(canonicalPaths.account(accountId))),
    ...selfParticipants.flatMap(({ participantId, participantManagementId }) => [
      transactionPath(canonicalPaths.participant(participantId)),
      transactionPath(canonicalPaths.participantManagement(participantManagementId)),
      transactionPath(canonicalPaths.participantManagementActiveOwner(participantId)),
    ]),
    ...STAGING_DEPENDENT_PARTICIPANTS.flatMap(({ participantId, participantManagementId }) => [
      transactionPath(canonicalPaths.participant(participantId)),
      transactionPath(canonicalPaths.participantManagement(participantManagementId)),
      transactionPath(canonicalPaths.participantManagementActiveOwner(participantId)),
    ]),
    ...(input.instructorId ? [transactionPath(canonicalPaths.instructor(input.instructorId))] : []),
    transactionPath(canonicalPaths.wallet(input.parentAccountId)),
    transactionPath(canonicalPaths.monetaryEvent(walletEventId)),
    ...input.courseManifests.flatMap((manifest) => [
      transactionPath(canonicalPaths.course(manifest.courseId)),
      `course_catalog_content/${manifest.courseId}`,
      ...manifest.days.map((day) =>
        transactionPath(canonicalPaths.courseDay(manifest.courseId, day.courseDayId))
      ),
    ]),
    ...resourceClaimOwnership.map(({ claimPath }) => claimPath),
    ...commandPaths,
  ]);

  return {
    fixtureId: input.fixtureId,
    version: input.version,
    ...(input.scheduleAnchorDate ? { scheduleAnchorDate: input.scheduleAnchorDate } : {}),
    commandEnvelopes: input.commandEnvelopes,
    ownedFirestorePaths: [...paths].sort(),
    resourceClaimOwnership,
    authUids: input.authFixtures.map(({ uid }) => uid),
    storagePrefixes: [],
  };
}

export function buildStagingFixturePlan(): StagingFixturePlan {
  const commandEnvelopes = buildStagingCommandEnvelopes();
  return assembleFixturePlan({
    fixtureId: STAGING_FIXTURE_ID,
    version: STAGING_FIXTURE_VERSION,
    accountIds: Object.values(STAGING_ACCOUNT_IDS),
    selfParticipantAccountIds: [STAGING_ACCOUNT_IDS.parent],
    parentAccountId: STAGING_ACCOUNT_IDS.parent,
    courseManifests: [],
    commandEnvelopes,
    authFixtures: STAGING_AUTH_FIXTURES,
  });
}

export function buildLegacyStagingFixturePlanV1(scheduleAnchorDate: string): StagingFixturePlan {
  const courseManifests = buildLegacyStagingCourseManifestsV1(scheduleAnchorDate);
  const commandEnvelopes = buildLegacyStagingCommandEnvelopesV1(scheduleAnchorDate);
  return assembleFixturePlan({
    fixtureId: LEGACY_STAGING_FIXTURE_ID,
    version: LEGACY_STAGING_FIXTURE_VERSION,
    scheduleAnchorDate,
    accountIds: Object.values(LEGACY_STAGING_ACCOUNT_IDS),
    selfParticipantAccountIds: Object.values(LEGACY_STAGING_ACCOUNT_IDS),
    parentAccountId: LEGACY_STAGING_ACCOUNT_IDS.parent,
    instructorId: LEGACY_STAGING_INSTRUCTOR_ID,
    courseManifests,
    commandEnvelopes,
    authFixtures: LEGACY_STAGING_AUTH_FIXTURES,
  });
}

export function buildStagingFixturePlanForManifest(identity: {
  readonly fixtureId: unknown;
  readonly version: unknown;
  readonly scheduleAnchorDate?: unknown;
}): StagingFixturePlan {
  if (identity.fixtureId === STAGING_FIXTURE_ID && identity.version === STAGING_FIXTURE_VERSION) {
    if (identity.scheduleAnchorDate !== undefined) {
      throw new Error('Invalid current staging fixture manifest schedule anchor');
    }
    return buildStagingFixturePlan();
  }
  if (
    identity.fixtureId === LEGACY_STAGING_FIXTURE_ID &&
    identity.version === LEGACY_STAGING_FIXTURE_VERSION &&
    typeof identity.scheduleAnchorDate === 'string'
  ) {
    return buildLegacyStagingFixturePlanV1(identity.scheduleAnchorDate);
  }
  throw new Error('Invalid or unsupported staging fixture definition version');
}

function normalizedClaimOwnership(
  ownership: readonly ResourceClaimOwnership[]
): readonly ResourceClaimOwnership[] {
  return ownership
    .map((item) => ({ claimPath: item.claimPath, guardPaths: [...item.guardPaths].sort() }))
    .sort((left, right) => left.claimPath.localeCompare(right.claimPath));
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

export function assertStagingFixtureManifestMatchesPlan(
  manifest: StagingFixtureManifestOwnership,
  plan: StagingFixturePlan
): void {
  if (
    manifest.fixtureId !== plan.fixtureId ||
    manifest.version !== plan.version ||
    manifest.scheduleAnchorDate !== plan.scheduleAnchorDate ||
    !sameStrings(manifest.ownedFirestorePaths, plan.ownedFirestorePaths) ||
    !sameStrings(manifest.authUids, plan.authUids) ||
    !sameStrings(manifest.storagePrefixes, plan.storagePrefixes) ||
    JSON.stringify(normalizedClaimOwnership(manifest.resourceClaimOwnership)) !==
      JSON.stringify(normalizedClaimOwnership(plan.resourceClaimOwnership))
  ) {
    throw new Error('STAGING ONLY: fixture manifest ownership does not match its definition version');
  }
}
