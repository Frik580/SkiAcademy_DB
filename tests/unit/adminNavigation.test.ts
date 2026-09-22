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

  it('keeps explicit Admin Test context on Finance and drops it on other tabs', () => {
    const current = new URLSearchParams(
      `tab=system&${ADMIN_TEST_SESSION_QUERY_KEY}=test_finance_ctx_a&account=account_open_01`
    );
    const finance = adminTabSearchParams(current, 'finance');
    expect(finance.get('tab')).toBe('finance');
    expect(finance.get(ADMIN_TEST_SESSION_QUERY_KEY)).toBe('test_finance_ctx_a');
    expect(finance.get('account')).toBe('account_open_01');

    const people = adminTabSearchParams(finance, 'people');
    expect(people.get(ADMIN_TEST_SESSION_QUERY_KEY)).toBeNull();

    const system = adminTabSearchParams(finance, 'system');
    expect(system.get(ADMIN_TEST_SESSION_QUERY_KEY)).toBe('test_finance_ctx_a');
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
