import { describe, expect, it } from 'vitest';
import { TestSessionIdSchema } from './identifiers';
import { LIVE_CANONICAL_EXECUTION_SCOPE, testCanonicalExecutionScope } from './canonicalScope';
import {
  TEST_STORAGE_CLIENT_REACHABILITY,
  TestStoragePathError,
  accountAvatarStoragePath,
  assertExactTestSessionStoragePrefix,
  assertTestStorageClientReachable,
  bookingChatStoragePath,
  courseAssetStoragePath,
  instructorAssetStoragePath,
  liveCourseCoverStoragePath,
  participantAvatarStoragePath,
  testActorStorageRoot,
  testSessionStoragePrefix,
  testSessionStorageRoot,
} from './testStoragePaths';

const sessionA = TestSessionIdSchema.parse('test_session_storage_a');
const sessionB = TestSessionIdSchema.parse('test_session_storage_b');
const scopeA = testCanonicalExecutionScope(sessionA);
const scopeB = testCanonicalExecutionScope(sessionB);

describe('T42B-4 storage path helpers', () => {
  it('keeps LIVE chat, course, avatar, and instructor prefixes unchanged', () => {
    expect(bookingChatStoragePath(LIVE_CANONICAL_EXECUTION_SCOPE, 'booking_chat_01', 'photo.jpg')).toBe(
      'chat/booking_chat_01/photo.jpg'
    );
    expect(liveCourseCoverStoragePath('course_image_01')).toBe('courses/course_image_01.webp');
    expect(participantAvatarStoragePath(LIVE_CANONICAL_EXECUTION_SCOPE, 'participant_avatar_01')).toBe(
      'participant-avatars/participant_avatar_01/avatar.jpg'
    );
    expect(accountAvatarStoragePath(LIVE_CANONICAL_EXECUTION_SCOPE, 'account_avatar_01')).toBe(
      'avatars/account_avatar_01'
    );
    expect(instructorAssetStoragePath(LIVE_CANONICAL_EXECUTION_SCOPE, 'instructor_avatar_01')).toBe(
      'instructors/instructor_avatar_01.jpg'
    );
  });

  it('namespaces TEST disposable assets by session and persistent actor assets outside the session', () => {
    expect(bookingChatStoragePath(scopeA, 'booking_chat_01', 'photo.jpg')).toBe(
      'test-sessions/test_session_storage_a/booking-chat/booking_chat_01/photo.jpg'
    );
    expect(courseAssetStoragePath(scopeA, 'course_image_01')).toBe(
      'test-sessions/test_session_storage_a/course-assets/course_image_01/cover.webp'
    );
    expect(participantAvatarStoragePath(scopeA, 'participant_avatar_01')).toBe(
      'test-actors/participant_avatar_01/avatar.jpg'
    );
    expect(testActorStorageRoot('account_avatar_01')).toBe('test-actors/account_avatar_01');
    expect(testSessionStorageRoot(sessionA)).toBe('test-sessions/test_session_storage_a');
    expect(testSessionStoragePrefix(sessionA)).toBe('test-sessions/test_session_storage_a/');
  });

  it('does not collide equal booking/file names across sessions or with LIVE', () => {
    const fileName = 'photo.jpg';
    const bookingId = 'booking_chat_01';
    expect(bookingChatStoragePath(scopeA, bookingId, fileName)).not.toBe(
      bookingChatStoragePath(scopeB, bookingId, fileName)
    );
    expect(bookingChatStoragePath(scopeA, bookingId, fileName)).not.toBe(
      bookingChatStoragePath(LIVE_CANONICAL_EXECUTION_SCOPE, bookingId, fileName)
    );
    expect(courseAssetStoragePath(scopeA, 'course_image_01')).not.toBe(
      liveCourseCoverStoragePath('course_image_01')
    );
  });

  it('rejects malformed IDs, path traversal, and cleanup prefixes outside the session', () => {
    expect(() => bookingChatStoragePath(scopeA, '../etc', 'photo.jpg')).toThrow(
      new TestStoragePathError('MALFORMED_STORAGE_SEGMENT')
    );
    expect(() => bookingChatStoragePath(scopeA, 'booking_chat_01', '../photo.jpg')).toThrow(
      new TestStoragePathError('MALFORMED_STORAGE_SEGMENT')
    );
    expect(() => testSessionStorageRoot('live_session_01' as never)).toThrow(
      new TestStoragePathError('MALFORMED_STORAGE_SEGMENT')
    );
    expect(() =>
      assertExactTestSessionStoragePrefix(sessionA, 'test-sessions/test_session_storage_b/photo.jpg')
    ).toThrow(new TestStoragePathError('MALFORMED_STORAGE_SCOPE'));
    expect(assertExactTestSessionStoragePrefix(sessionA, 'test-sessions/test_session_storage_a/a.jpg')).toBe(
      'test-sessions/test_session_storage_a/'
    );
  });

  it('keeps TEST client Storage uploads unreachable until Rules rollout', () => {
    expect(TEST_STORAGE_CLIENT_REACHABILITY).toBe('deferred_until_rules_rollout');
    expect(() => assertTestStorageClientReachable(LIVE_CANONICAL_EXECUTION_SCOPE)).not.toThrow();
    expect(() => assertTestStorageClientReachable(scopeA)).toThrow(
      new TestStoragePathError('TEST_STORAGE_CLIENT_UNREACHABLE')
    );
  });
});
