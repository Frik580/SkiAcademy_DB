import { describe, expect, it } from 'vitest';
import {
  ADMIN_CLIENT_ACCOUNT_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_QUERY_KEY,
  ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY,
  ADMIN_TAB_IDS,
  ADMIN_TEST_SESSION_QUERY_KEY,
  DEFAULT_ADMIN_TAB,
  adminClientAccountSearchParams,
  adminCourseEnrollmentSearchParams,
  adminTabSearchParams,
  isAdminTabId,
  parseAdminRequestedTestSessionId,
  parseAdminTabId,
} from '../../src/features/admin/adminNavigation';

describe('adminNavigation', () => {
  it('exposes five top-level tabs with operations as default', () => {
    expect(ADMIN_TAB_IDS).toEqual(['operations', 'finance', 'people', 'product', 'system']);
    expect(DEFAULT_ADMIN_TAB).toBe('operations');
  });

  it('parses known tab ids and falls back for unknown values', () => {
    expect(isAdminTabId('finance')).toBe(true);
    expect(isAdminTabId('nope')).toBe(false);
    expect(parseAdminTabId('people')).toBe('people');
    expect(parseAdminTabId(null)).toBe('operations');
    expect(parseAdminTabId('unknown')).toBe('operations');
  });

  it('preserves selected Admin TestSession passively across every top-level tab', () => {
    const current = new URLSearchParams(
      `tab=system&${ADMIN_TEST_SESSION_QUERY_KEY}=test_finance_ctx_a&account=account_open_01`
    );
    const visited = ADMIN_TAB_IDS.reduce(
      (params, tab) => adminTabSearchParams(params, tab),
      current
    );

    expect(visited.get('tab')).toBe('system');
    expect(visited.get(ADMIN_TEST_SESSION_QUERY_KEY)).toBe('test_finance_ctx_a');
    expect(visited.get('account')).toBe('account_open_01');
  });

  it('preserves session A through People and Operations before returning to Testing', () => {
    const testing = new URLSearchParams(
      `tab=system&${ADMIN_TEST_SESSION_QUERY_KEY}=test_session_a&unrelated=keep-me`
    );
    const people = adminTabSearchParams(testing, 'people');
    const lessonsAndPlanner = adminTabSearchParams(people, 'operations');
    const backToTesting = adminTabSearchParams(lessonsAndPlanner, 'system');

    expect(people.get(ADMIN_TEST_SESSION_QUERY_KEY)).toBe('test_session_a');
    expect(lessonsAndPlanner.get(ADMIN_TEST_SESSION_QUERY_KEY)).toBe('test_session_a');
    expect(backToTesting.get(ADMIN_TEST_SESSION_QUERY_KEY)).toBe('test_session_a');
    expect(backToTesting.get('unrelated')).toBe('keep-me');
  });

  it('preserves only the latest selected TestSession during route reconstruction', () => {
    const sessionA = new URLSearchParams('tab=system&testSession=test_session_a');
    const sessionB = new URLSearchParams(sessionA);
    sessionB.set(ADMIN_TEST_SESSION_QUERY_KEY, 'test_session_b');

    const finance = adminTabSearchParams(sessionB, 'finance');
    const people = adminTabSearchParams(finance, 'people');

    expect(people.getAll(ADMIN_TEST_SESSION_QUERY_KEY)).toEqual(['test_session_b']);
  });

  it('does not recreate Test context after explicit exit removed it', () => {
    const afterExit = new URLSearchParams('tab=system&unrelated=keep-me');
    const people = adminTabSearchParams(afterExit, 'people');
    const backToTesting = adminTabSearchParams(people, 'system');

    expect(backToTesting.has(ADMIN_TEST_SESSION_QUERY_KEY)).toBe(false);
    expect(backToTesting.get('unrelated')).toBe('keep-me');
  });

  it('ignores a missing or malformed Admin Test context', () => {
    expect(parseAdminRequestedTestSessionId(null)).toBeUndefined();
    expect(parseAdminRequestedTestSessionId('live')).toBeUndefined();
    expect(parseAdminRequestedTestSessionId('test_finance_ctx_a')).toBe('test_finance_ctx_a');
  });

  it('deep-links People → Clients with canonical clientAccount', () => {
    const next = adminClientAccountSearchParams(
      new URLSearchParams('tab=operations'),
      'account_open_client_01'
    );
    expect(next.get('tab')).toBe('people');
    expect(next.get(ADMIN_CLIENT_ACCOUNT_QUERY_KEY)).toBe('account_open_client_01');
  });

  it('deep-links a Course detail to its canonical enrollment roster', () => {
    const next = adminCourseEnrollmentSearchParams(
      new URLSearchParams('tab=product&enrollment=enrollment_old_01'),
      'course_open_enrollments_01'
    );
    expect(next.get('tab')).toBe('operations');
    expect(next.get(ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY)).toBe('roster');
    expect(next.get(ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY)).toBe('course_open_enrollments_01');
    expect(next.get('trainingKind')).toBe('course');
    expect(next.has(ADMIN_COURSE_ENROLLMENT_QUERY_KEY)).toBe(false);
  });
});
