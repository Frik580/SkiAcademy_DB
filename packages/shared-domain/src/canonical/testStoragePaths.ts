import {
  AccountIdSchema,
  BookingIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  TestSessionIdSchema,
  type TestSessionId,
} from './identifiers';
import {
  LIVE_CANONICAL_EXECUTION_SCOPE,
  parsePersistedCanonicalScope,
  type CanonicalExecutionScope,
} from './canonicalScope';

export const TEST_SESSION_STORAGE_ROOT = 'test-sessions' as const;
export const TEST_ACTOR_STORAGE_ROOT = 'test-actors' as const;
export const LIVE_BOOKING_CHAT_STORAGE_ROOT = 'chat' as const;
export const LIVE_COURSE_ASSET_STORAGE_ROOT = 'courses' as const;
export const LIVE_INSTRUCTOR_ASSET_STORAGE_ROOT = 'instructors' as const;
export const LIVE_ACCOUNT_AVATAR_STORAGE_ROOT = 'avatars' as const;
export const LIVE_PARTICIPANT_AVATAR_STORAGE_ROOT = 'participant-avatars' as const;

export const TEST_STORAGE_CLIENT_REACHABILITY = 'deferred_until_rules_rollout' as const;

export type TestStoragePathErrorCode =
  | 'MALFORMED_STORAGE_SCOPE'
  | 'MALFORMED_STORAGE_SEGMENT'
  | 'TEST_STORAGE_CLIENT_UNREACHABLE';

export class TestStoragePathError extends Error {
  constructor(readonly code: TestStoragePathErrorCode) {
    super(code);
    this.name = 'TestStoragePathError';
  }
}

const STORAGE_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;

function assertStorageFileName(fileName: string): void {
  if (!STORAGE_FILE_NAME_PATTERN.test(fileName) || fileName.includes('..')) {
    throw new TestStoragePathError('MALFORMED_STORAGE_SEGMENT');
  }
}

export function testSessionStorageRoot(testSessionId: TestSessionId): string {
  const parsed = TestSessionIdSchema.safeParse(testSessionId);
  if (!parsed.success) {
    throw new TestStoragePathError('MALFORMED_STORAGE_SEGMENT');
  }
  return `${TEST_SESSION_STORAGE_ROOT}/${parsed.data}`;
}

export function testSessionStoragePrefix(testSessionId: TestSessionId): string {
  return `${testSessionStorageRoot(testSessionId)}/`;
}

export function testActorStorageRoot(actorOrParticipantId: string): string {
  const parsed = AccountIdSchema.safeParse(actorOrParticipantId);
  const participant = ParticipantIdSchema.safeParse(actorOrParticipantId);
  const instructor = InstructorIdSchema.safeParse(actorOrParticipantId);
  if (!parsed.success && !participant.success && !instructor.success) {
    throw new TestStoragePathError('MALFORMED_STORAGE_SEGMENT');
  }
  return `${TEST_ACTOR_STORAGE_ROOT}/${actorOrParticipantId}`;
}

export function assertExactTestSessionStoragePrefix(
  testSessionId: TestSessionId,
  objectPath: string
): string {
  const prefix = testSessionStoragePrefix(testSessionId);
  if (!objectPath.startsWith(prefix) || objectPath.includes('..') || objectPath.includes('\\')) {
    throw new TestStoragePathError('MALFORMED_STORAGE_SCOPE');
  }
  if (objectPath === prefix) {
    throw new TestStoragePathError('MALFORMED_STORAGE_SEGMENT');
  }
  return prefix;
}

export function bookingChatStoragePath(
  scope: CanonicalExecutionScope,
  bookingId: string,
  fileName: string
): string {
  const parsedBookingId = BookingIdSchema.safeParse(bookingId);
  const courseThreadId = CourseIdSchema.safeParse(bookingId);
  if (!parsedBookingId.success && !courseThreadId.success) {
    throw new TestStoragePathError('MALFORMED_STORAGE_SEGMENT');
  }
  assertStorageFileName(fileName);
  if (scope.dataScope === 'live') {
    return `${LIVE_BOOKING_CHAT_STORAGE_ROOT}/${bookingId}/${fileName}`;
  }
  return `${testSessionStorageRoot(scope.testSessionId)}/booking-chat/${bookingId}/${fileName}`;
}

export function participantAvatarStoragePath(
  identityScope: CanonicalExecutionScope,
  participantId: string
): string {
  const parsed = ParticipantIdSchema.safeParse(participantId);
  if (!parsed.success) {
    throw new TestStoragePathError('MALFORMED_STORAGE_SEGMENT');
  }
  if (identityScope.dataScope === 'live') {
    return `${LIVE_PARTICIPANT_AVATAR_STORAGE_ROOT}/${parsed.data}/avatar.jpg`;
  }
  return `${testActorStorageRoot(parsed.data)}/avatar.jpg`;
}

export function accountAvatarStoragePath(
  identityScope: CanonicalExecutionScope,
  accountId: string
): string {
  const parsed = AccountIdSchema.safeParse(accountId);
  if (!parsed.success) {
    throw new TestStoragePathError('MALFORMED_STORAGE_SEGMENT');
  }
  if (identityScope.dataScope === 'live') {
    return `${LIVE_ACCOUNT_AVATAR_STORAGE_ROOT}/${parsed.data}`;
  }
  return `${testActorStorageRoot(parsed.data)}/avatar`;
}

export function instructorAssetStoragePath(
  identityScope: CanonicalExecutionScope,
  instructorId: string
): string {
  const parsed = InstructorIdSchema.safeParse(instructorId);
  if (!parsed.success) {
    throw new TestStoragePathError('MALFORMED_STORAGE_SEGMENT');
  }
  if (identityScope.dataScope === 'live') {
    return `${LIVE_INSTRUCTOR_ASSET_STORAGE_ROOT}/${parsed.data}.jpg`;
  }
  return `${testActorStorageRoot(parsed.data)}/avatar.jpg`;
}

export function courseAssetStoragePath(
  scope: CanonicalExecutionScope,
  courseId: string,
  fileName = 'cover.webp'
): string {
  const parsed = CourseIdSchema.safeParse(courseId);
  if (!parsed.success) {
    throw new TestStoragePathError('MALFORMED_STORAGE_SEGMENT');
  }
  assertStorageFileName(fileName);
  if (scope.dataScope === 'live') {
    return `${LIVE_COURSE_ASSET_STORAGE_ROOT}/${parsed.data}.webp`;
  }
  return `${testSessionStorageRoot(scope.testSessionId)}/course-assets/${parsed.data}/${fileName}`;
}

export function liveCourseCoverStoragePath(courseId: string): string {
  return courseAssetStoragePath(LIVE_CANONICAL_EXECUTION_SCOPE, courseId);
}

export function parseResourceStorageScope(resource: unknown): CanonicalExecutionScope {
  try {
    return parsePersistedCanonicalScope(resource, { allowLegacyLive: true });
  } catch {
    throw new TestStoragePathError('MALFORMED_STORAGE_SCOPE');
  }
}

export function assertTestStorageClientReachable(scope: CanonicalExecutionScope): void {
  if (scope.dataScope === 'test') {
    throw new TestStoragePathError('TEST_STORAGE_CLIENT_UNREACHABLE');
  }
}

/**
 * Immutable public catalog images (for example Yandex `/carve/` URLs) may be
 * referenced by a TEST Course clone. Mutable TEST uploads must use the session
 * namespace and must never overwrite `courses/{liveCourseId}/...`.
 */
export const TEST_COURSE_ASSET_STRATEGY = {
  immutablePublicReference: 'shared_read_only',
  mutableSessionOwnedUpload: 'test_session_namespace',
} as const;
