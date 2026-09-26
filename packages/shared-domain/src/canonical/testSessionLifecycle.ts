import { z } from 'zod';
import { IdempotencyKeySchema } from './commands/commandContext';
import { canonicalDeterministicHash } from './deterministicIdentity';
import {
  AccountIdSchema,
  CanonicalOpaqueIdSchema,
  CourseIdSchema,
  TestSessionIdSchema,
  type TestSessionId,
} from './identifiers';
import { KztMinorUnitsSchema } from './primitives';
import {
  TEST_SESSION_MAINTENANCE_PHASES,
  TEST_SESSION_STATUSES,
  TestSessionMaintenancePhaseSchema,
  TestSessionStatusSchema,
  type TestSessionMaintenancePhase,
  type TestSessionStatus,
} from './testSessions';

export const TEST_SESSION_LIFECYCLE_COMMANDS = [
  'create_test_session',
  'close_test_session',
  'preview_test_session_reset',
  'execute_test_session_reset',
  'preview_test_session_delete',
  'execute_test_session_delete',
  'retry_test_session_maintenance',
] as const;

export type TestSessionLifecycleCommand = (typeof TEST_SESSION_LIFECYCLE_COMMANDS)[number];

export const TEST_SESSION_LIFECYCLE_SUPPORT_STATES = [
  'LIFECYCLE_SUPPORTED',
  'LIFECYCLE_FORBIDDEN',
] as const;

export type TestSessionLifecycleSupportState =
  (typeof TEST_SESSION_LIFECYCLE_SUPPORT_STATES)[number];

/**
 * Lifecycle commands are admin maintenance callables, not product CommandKinds.
 * Unknown names fail closed. Product commands are forbidden on this surface.
 */
export const TEST_SESSION_LIFECYCLE_COMMAND_SUPPORT = {
  create_test_session: 'LIFECYCLE_SUPPORTED',
  close_test_session: 'LIFECYCLE_SUPPORTED',
  preview_test_session_reset: 'LIFECYCLE_SUPPORTED',
  execute_test_session_reset: 'LIFECYCLE_SUPPORTED',
  preview_test_session_delete: 'LIFECYCLE_SUPPORTED',
  execute_test_session_delete: 'LIFECYCLE_SUPPORTED',
  retry_test_session_maintenance: 'LIFECYCLE_SUPPORTED',
} as const satisfies Record<TestSessionLifecycleCommand, 'LIFECYCLE_SUPPORTED'>;

export function resolveTestSessionLifecycleCommandSupport(
  command: string
): TestSessionLifecycleSupportState {
  if (Object.prototype.hasOwnProperty.call(TEST_SESSION_LIFECYCLE_COMMAND_SUPPORT, command)) {
    return 'LIFECYCLE_SUPPORTED';
  }
  return 'LIFECYCLE_FORBIDDEN';
}

export const TEST_SESSION_MAINTENANCE_ERROR_CODES = [
  'TEST_SESSION_ACTIVE_LIMIT',
  'TEST_SESSION_NOT_ACTIVE',
  'TEST_SESSION_NOT_FOUND',
  'TEST_SESSION_TRANSITION_FORBIDDEN',
  'TEST_MAINTENANCE_IN_PROGRESS',
  'TEST_MAINTENANCE_SCOPE_VIOLATION',
  'TEST_MAINTENANCE_MANIFEST_STALE',
  'TEST_MAINTENANCE_MANIFEST_EXPIRED',
  'TEST_MAINTENANCE_LEASE_CONFLICT',
  'TEST_MAINTENANCE_FAILED',
  'TEST_MAINTENANCE_CONFIRMATION_INVALID',
  'TEST_ACTOR_INVALID',
  'TEST_ACTOR_ASSIGNMENT_CONFLICT',
  'TEST_INSTRUCTOR_INVALID',
  'LIFECYCLE_FORBIDDEN',
] as const;

export type TestSessionMaintenanceErrorCode =
  (typeof TEST_SESSION_MAINTENANCE_ERROR_CODES)[number];

export class TestSessionMaintenanceError extends Error {
  constructor(readonly code: TestSessionMaintenanceErrorCode) {
    super(code);
    this.name = 'TestSessionMaintenanceError';
  }
}

const TRANSITIONS: Readonly<Record<TestSessionStatus, readonly TestSessionStatus[]>> = {
  provisioning: ['active', 'failed'],
  active: ['closed', 'locked'],
  locked: ['resetting', 'deleting', 'failed'],
  resetting: ['active', 'closed', 'failed'],
  deleting: ['failed'],
  closed: ['locked'],
  failed: ['provisioning', 'locked'],
};

export function assertTestSessionStatusTransition(
  from: TestSessionStatus,
  to: TestSessionStatus
): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new TestSessionMaintenanceError('TEST_SESSION_TRANSITION_FORBIDDEN');
  }
}

export function assertResetCompletionStatus(
  resumeStatus: 'active' | 'closed',
  nextStatus: TestSessionStatus
): void {
  if (nextStatus !== resumeStatus) {
    throw new TestSessionMaintenanceError('TEST_SESSION_TRANSITION_FORBIDDEN');
  }
  assertTestSessionStatusTransition('resetting', nextStatus);
}

export const TEST_SESSION_RESET_CONFIRMATION = 'RESET TEST DATA';
export const TEST_SESSION_DELETE_CONFIRMATION = 'DELETE TEST SESSION';
export const TEST_SESSION_MAINTENANCE_LEASE_MS = 5 * 60 * 1000;
export const TEST_SESSION_MANIFEST_TTL_MS = 10 * 60 * 1000;

export function assertMaintenanceConfirmation(operation: 'reset' | 'delete', token: string): void {
  const expected =
    operation === 'reset' ? TEST_SESSION_RESET_CONFIRMATION : TEST_SESSION_DELETE_CONFIRMATION;
  if (token !== expected) {
    throw new TestSessionMaintenanceError('TEST_MAINTENANCE_CONFIRMATION_INVALID');
  }
}

export function maintenanceLeaseExpiresAt(startedAt: Date): Date {
  return new Date(startedAt.getTime() + TEST_SESSION_MAINTENANCE_LEASE_MS);
}

export function maintenanceLeaseIsExpired(
  leaseExpiresAt: { readonly seconds: number; readonly nanoseconds?: number } | undefined,
  now: Date
): boolean {
  if (!leaseExpiresAt) return true;
  const expiresAtMs =
    leaseExpiresAt.seconds * 1_000 + Math.floor((leaseExpiresAt.nanoseconds ?? 0) / 1_000_000);
  return expiresAtMs <= now.getTime();
}

export function manifestExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + TEST_SESSION_MANIFEST_TTL_MS);
}

/**
 * A different operation never takes over, including after lease expiry.
 * Expiry only allows the same operation to resume.
 */
export function evaluateMaintenanceLease(input: {
  readonly currentOperationId?: string;
  readonly requestedOperationId: string;
}): 'owner' | 'conflict' {
  if (input.currentOperationId && input.currentOperationId !== input.requestedOperationId) {
    return 'conflict';
  }
  return 'owner';
}

export interface TestSessionMaintenanceCandidate {
  readonly path: string;
  readonly revision: number | null;
  readonly dataScope: string | null;
  readonly testSessionId: string | null;
}

const DISPOSABLE_ROOTS = new Set([
  'bookings',
  'guest_contacts',
  'booking_proposals',
  'booking_change_requests',
  'attendance',
  'course_enrollments',
  'payments',
  'monetary_events',
  'admin_issues',
  'resource_claims',
  'resource_claim_guards',
  'active_course_enrollment_guards',
  'command_idempotency',
  'domain_outbox',
  'activity_logs',
  'notifications',
  'instructor_reviews',
  'participant_lesson_feedback',
  'administrative_availability_blocks',
  'courses',
  'course_catalog_content',
  'booking_attendance_outcome_work',
  'course_enrollment_outcome_work',
  'provider_event_receipts',
  'course_chat_access',
  'homework',
  'participant_progress',
  'participant_achievements',
  'instructor_rating_summaries',
]);

const PRESERVE_ROOTS = new Set([
  'settings',
  'lesson_pricing_settings',
  'resort_data',
  'system_migrations',
  'admin_runtime',
  'test_actors',
  'participants',
  'instructors',
  'participant_management',
  'participant_management_active_owner',
  'instructor_relationships',
  'participant_blocks',
  'admin_maintenance_events',
  'test_session_active_slots',
  'test_session_lifecycle_idempotency',
  'test_session_deletions',
  'skill_definitions',
  'achievement_definitions',
  'users',
  'test_actor_assignments',
]);

function normalizedPath(path: string): string {
  return path.replace(/^\/+/, '');
}

function isWalletStatePath(path: string): boolean {
  return /^users\/[^/]+\/wallet\/state$/.test(path);
}

function isSessionMembershipPath(path: string, testSessionId: string): boolean {
  const prefix = `test_sessions/${testSessionId}/membership/`;
  if (!path.startsWith(prefix)) return false;
  const accountId = path.slice(prefix.length);
  return accountId.length > 0 && !accountId.includes('/');
}

export function assertCandidateDeletable(
  candidate: TestSessionMaintenanceCandidate,
  requestedTestSessionId: string,
  operation: 'reset' | 'delete'
): void {
  const path = normalizedPath(candidate.path);
  const root = path.split('/')[0] ?? '';
  const wallet = isWalletStatePath(path);
  const membership = isSessionMembershipPath(path, requestedTestSessionId);
  if (membership && operation === 'delete') {
    if (
      candidate.dataScope === 'live' ||
      (candidate.testSessionId !== null && candidate.testSessionId !== requestedTestSessionId)
    ) {
      throw new TestSessionMaintenanceError('TEST_MAINTENANCE_SCOPE_VIOLATION');
    }
    return;
  }
  if (
    path.startsWith('test_actors/') ||
    path === `test_sessions/${requestedTestSessionId}` ||
    (path.startsWith('users/') && !wallet) ||
    membership ||
    (PRESERVE_ROOTS.has(root) && !wallet)
  ) {
    throw new TestSessionMaintenanceError('TEST_MAINTENANCE_SCOPE_VIOLATION');
  }
  const disposable = DISPOSABLE_ROOTS.has(root) || wallet || (operation === 'delete' && membership);
  if (!disposable || candidate.dataScope !== 'test' || candidate.testSessionId !== requestedTestSessionId) {
    throw new TestSessionMaintenanceError('TEST_MAINTENANCE_SCOPE_VIOLATION');
  }
}

export function preflightDestructiveCandidates(
  candidates: readonly TestSessionMaintenanceCandidate[],
  requestedTestSessionId: string,
  operation: 'reset' | 'delete'
): void {
  for (const candidate of candidates) {
    assertCandidateDeletable(candidate, requestedTestSessionId, operation);
  }
}

export function fingerprintMaintenanceCandidates(
  candidates: readonly TestSessionMaintenanceCandidate[]
): string {
  const rows = candidates
    .map(
      (candidate) =>
        `${normalizedPath(candidate.path)}|${candidate.revision ?? ''}|${candidate.dataScope ?? ''}|${candidate.testSessionId ?? ''}`
    )
    .sort();
  return canonicalDeterministicHash(['test-maintenance-fingerprint:v1', ...rows]);
}

export function buildMaintenanceManifestHash(input: {
  readonly operation: 'reset' | 'delete';
  readonly testSessionId: string;
  readonly inventoryRevision: number;
  readonly fingerprint: string;
}): string {
  return canonicalDeterministicHash([
    'test-maintenance-manifest:v1',
    input.operation,
    input.testSessionId,
    String(input.inventoryRevision),
    input.fingerprint,
  ]);
}

export function assertManifestFresh(input: {
  readonly previewHash: string;
  readonly currentHash: string;
  readonly previewInventoryRevision: number;
  readonly inventoryRevision: number;
  readonly expiresAt: Date;
  readonly now: Date;
}): void {
  if (input.now.getTime() >= input.expiresAt.getTime()) {
    throw new TestSessionMaintenanceError('TEST_MAINTENANCE_MANIFEST_EXPIRED');
  }
  if (
    input.previewHash !== input.currentHash ||
    input.previewInventoryRevision !== input.inventoryRevision
  ) {
    throw new TestSessionMaintenanceError('TEST_MAINTENANCE_MANIFEST_STALE');
  }
}

export const CreateTestSessionIntentSchema = z
  .object({
    command: z.literal('create_test_session'),
    idempotencyKey: IdempotencyKeySchema,
    label: z.string().trim().min(1).max(120),
    startingBalanceKzt: KztMinorUnitsSchema,
    actorAccountIds: z.array(AccountIdSchema).min(1).max(32),
    testInstructorAccountId: AccountIdSchema,
    sourceCourseIds: z.array(CourseIdSchema).min(1).max(64),
  })
  .strict();

const SessionTargetSchema = {
  idempotencyKey: IdempotencyKeySchema,
  testSessionId: TestSessionIdSchema,
};

export const ExecuteTestSessionLifecycleInputSchema = z.discriminatedUnion('command', [
  CreateTestSessionIntentSchema,
  z.object({ command: z.literal('close_test_session'), ...SessionTargetSchema }).strict(),
  z.object({ command: z.literal('preview_test_session_reset'), ...SessionTargetSchema }).strict(),
  z
    .object({
      command: z.literal('execute_test_session_reset'),
      ...SessionTargetSchema,
      manifestId: CanonicalOpaqueIdSchema,
      confirmation: z.string().trim().min(1).max(80),
    })
    .strict(),
  z.object({ command: z.literal('preview_test_session_delete'), ...SessionTargetSchema }).strict(),
  z
    .object({
      command: z.literal('execute_test_session_delete'),
      ...SessionTargetSchema,
      manifestId: CanonicalOpaqueIdSchema,
      confirmation: z.string().trim().min(1).max(80),
    })
    .strict(),
  z
    .object({ command: z.literal('retry_test_session_maintenance'), ...SessionTargetSchema })
    .strict(),
]);

export type ExecuteTestSessionLifecycleInput = z.output<
  typeof ExecuteTestSessionLifecycleInputSchema
>;

export const TEST_SESSION_MAINTENANCE_COUNT_KEYS = [
  'bookings',
  'guestContacts',
  'bookingProposals',
  'bookingChangeRequests',
  'attendance',
  'enrollments',
  'payments',
  'monetaryEvents',
  'progress',
  'achievements',
  'reviews',
  'feedback',
  'issues',
  'claims',
  'guards',
  'activeEnrollmentGuards',
  'courseClones',
  'courseDays',
  'catalog',
  'notifications',
  'outbox',
  'idempotency',
  'outcomeWork',
  'availabilityBlocks',
  'activityLogs',
  'providerReceipts',
  'courseChatAccess',
  'homework',
  'ratingSummaries',
  'wallets',
  'memberships',
  'storageObjects',
] as const;

export type TestSessionMaintenanceCountKey = (typeof TEST_SESSION_MAINTENANCE_COUNT_KEYS)[number];

export const MAINTENANCE_COLLECTION_COUNT_KEYS: Readonly<
  Record<string, TestSessionMaintenanceCountKey>
> = {
  bookings: 'bookings',
  guest_contacts: 'guestContacts',
  booking_proposals: 'bookingProposals',
  booking_change_requests: 'bookingChangeRequests',
  attendance: 'attendance',
  course_enrollments: 'enrollments',
  payments: 'payments',
  monetary_events: 'monetaryEvents',
  participant_progress: 'progress',
  participant_achievements: 'achievements',
  instructor_reviews: 'reviews',
  participant_lesson_feedback: 'feedback',
  admin_issues: 'issues',
  resource_claims: 'claims',
  resource_claim_guards: 'guards',
  active_course_enrollment_guards: 'activeEnrollmentGuards',
  courses: 'courseClones',
  course_catalog_content: 'catalog',
  notifications: 'notifications',
  domain_outbox: 'outbox',
  command_idempotency: 'idempotency',
  booking_attendance_outcome_work: 'outcomeWork',
  course_enrollment_outcome_work: 'outcomeWork',
  administrative_availability_blocks: 'availabilityBlocks',
  activity_logs: 'activityLogs',
  provider_event_receipts: 'providerReceipts',
  course_chat_access: 'courseChatAccess',
  homework: 'homework',
  instructor_rating_summaries: 'ratingSummaries',
};

export function countKeyForMaintenancePath(path: string): TestSessionMaintenanceCountKey | undefined {
  const normalized = normalizedPath(path);
  if (isWalletStatePath(normalized)) return 'wallets';
  if (/^test_sessions\/[^/]+\/membership\/[^/]+$/.test(normalized)) return 'memberships';
  if (/^courses\/[^/]+\/days\/[^/]+$/.test(normalized)) return 'courseDays';
  const root = normalized.split('/')[0] ?? '';
  return MAINTENANCE_COLLECTION_COUNT_KEYS[root];
}

export function summarizeMaintenanceCounts(
  candidates: readonly TestSessionMaintenanceCandidate[],
  storageObjects: number
): Partial<Record<TestSessionMaintenanceCountKey, number>> {
  const counts: Partial<Record<TestSessionMaintenanceCountKey, number>> = {};
  for (const candidate of candidates) {
    const key = countKeyForMaintenancePath(candidate.path);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  if (storageObjects > 0) counts.storageObjects = storageObjects;
  return counts;
}

export const TEST_SESSION_RESET_PRESERVE = [
  'test_session',
  'test_actors',
  'test_identities',
  'membership',
  'maintenance_audit',
  'live_resources',
  'shared_configuration',
] as const;

export const TEST_SESSION_DELETE_PRESERVE = [
  'test_actors',
  'test_identities',
  'persistent_actor_avatars',
  'maintenance_audit',
  'live_resources',
  'shared_configuration',
] as const;

export function lifecycleStatuses(): readonly TestSessionStatus[] {
  return TEST_SESSION_STATUSES;
}

export function parseLifecycleInput(value: unknown): ExecuteTestSessionLifecycleInput {
  const command =
    value && typeof value === 'object' && 'command' in value && typeof value.command === 'string'
      ? value.command
      : '';
  if (resolveTestSessionLifecycleCommandSupport(command) !== 'LIFECYCLE_SUPPORTED') {
    throw new TestSessionMaintenanceError('LIFECYCLE_FORBIDDEN');
  }
  const parsed = ExecuteTestSessionLifecycleInputSchema.safeParse(value);
  if (!parsed.success) {
    throw new TestSessionMaintenanceError('TEST_MAINTENANCE_FAILED');
  }
  return parsed.data;
}

export function sessionIdBrand(value: string): TestSessionId {
  return TestSessionIdSchema.parse(value);
}

export const TestSessionLifecycleManifestSchema = z
  .object({
    manifestId: CanonicalOpaqueIdSchema,
    manifestHash: z.string().min(16).max(128),
    inventoryRevision: z.number().int().nonnegative(),
    createdAt: z.string().min(1),
    expiresAt: z.string().min(1),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    preserve: z.array(z.string().min(1)).max(16),
    warnings: z.array(z.string().min(1)).max(16),
  })
  .strict();

export const TestSessionLifecycleResultSchema = z
  .object({
    command: z.enum(TEST_SESSION_LIFECYCLE_COMMANDS),
    outcome: z.enum([
      'created',
      'resumed',
      'already_completed',
      'preview',
      'executed',
      'closed',
    ]),
    testSessionId: TestSessionIdSchema.optional(),
    status: TestSessionStatusSchema.optional(),
    phase: TestSessionMaintenancePhaseSchema.optional(),
    manifest: TestSessionLifecycleManifestSchema.optional(),
    verifier: z
      .object({
        ok: z.boolean(),
        failedChecks: z.array(z.string()).max(32),
      })
      .strict()
      .optional(),
  })
  .strict();

export type TestSessionLifecycleResult = z.output<typeof TestSessionLifecycleResultSchema>;

export function maintenancePhaseIndex(phase: TestSessionMaintenancePhase | undefined): number {
  if (!phase) return -1;
  return TEST_SESSION_MAINTENANCE_PHASES.indexOf(phase);
}
