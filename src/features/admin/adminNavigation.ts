import type { TranslationKey } from '../../lib/i18n/translations';
import {
  ADMIN_FINANCIAL_OVERVIEW_PERIODS,
  ADMIN_ISSUE_SEVERITIES,
  TestSessionIdSchema,
  type AdminFinancialOverviewPeriod,
  type AdminIssueSeverity,
  type TestSessionId,
} from '@ski-academy/shared-domain';

export const ADMIN_TAB_IDS = ['operations', 'finance', 'people', 'product', 'system'] as const;

export type AdminTabId = (typeof ADMIN_TAB_IDS)[number];

export const DEFAULT_ADMIN_TAB: AdminTabId = 'operations';

export const ADMIN_TAB_QUERY_KEY = 'tab';
export const ADMIN_ISSUE_QUERY_KEY = 'issue';
export const ADMIN_ISSUE_VIEW_QUERY_KEY = 'issueView';
export const ADMIN_ISSUE_SEVERITY_QUERY_KEY = 'issueSeverity';
export const ADMIN_ISSUE_CATEGORY_QUERY_KEY = 'issueCategory';
export const ADMIN_CHANGE_REQUEST_QUERY_KEY = 'changeRequest';
export const ADMIN_FINANCE_ACCOUNT_QUERY_KEY = 'account';
export const ADMIN_FINANCE_PAYMENT_QUERY_KEY = 'payment';
export const ADMIN_FINANCE_MOVEMENT_FOCUS_QUERY_KEY = 'movement';
export const ADMIN_FINANCE_MOVEMENT_PERIOD_QUERY_KEY = 'movementPeriod';
export const ADMIN_CLIENT_ACCOUNT_QUERY_KEY = 'clientAccount';
export const ADMIN_LESSON_BOOKING_QUERY_KEY = 'booking';
export const ADMIN_LESSON_BOOKING_VIEW_QUERY_KEY = 'bookingView';
/** DOM id for the unified lessons+courses collapsible section in AdminPanel. */
export const ADMIN_TRAINING_RECORDS_SECTION_ID = 'canonical_training_records';
/** Compatibility alias: deep links still scroll the unified section. */
export const ADMIN_LESSON_BOOKINGS_SECTION_ID = ADMIN_TRAINING_RECORDS_SECTION_ID;
export const ADMIN_COURSE_ENROLLMENTS_SECTION_ID = ADMIN_TRAINING_RECORDS_SECTION_ID;
export const ADMIN_TRAINING_KIND_QUERY_KEY = 'trainingKind';
export const ADMIN_TRAINING_SCOPE_QUERY_KEY = 'trainingScope';

export function scrollAdminElementIntoView(
  elementId: string,
  options?: ScrollIntoViewOptions
): void {
  window.requestAnimationFrame(() => {
    document.getElementById(elementId)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      ...options,
    });
  });
}

/** Scroll after collapsible section expand animation (~250ms). */
export function scrollAdminLessonBookingsSectionIntoView(delayMs = 320): void {
  window.setTimeout(() => scrollAdminElementIntoView(ADMIN_TRAINING_RECORDS_SECTION_ID), delayMs);
}

export function scrollAdminTrainingRecordsSectionIntoView(delayMs = 320): void {
  scrollAdminLessonBookingsSectionIntoView(delayMs);
}
export const ADMIN_PLANNER_DATE_QUERY_KEY = 'plannerDate';
export const ADMIN_PLANNER_FOCUS_QUERY_KEY = 'plannerBooking';
export const ADMIN_COURSE_ENROLLMENT_QUERY_KEY = 'enrollment';
export const ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY = 'enrollmentView';
export const ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY = 'enrollmentCourse';
/** Explicit Admin Test context. Entered from System → Testing. */
export const ADMIN_TEST_SESSION_QUERY_KEY = 'testSession';

export function parseAdminRequestedTestSessionId(
  value: string | null | undefined
): TestSessionId | undefined {
  if (!value) return undefined;
  const parsed = TestSessionIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Tab changes keep an explicit Test context only on System and Finance.
 * Every other tab drops it, so those surfaces stay LIVE.
 */
export function adminTabSearchParams(
  previous: URLSearchParams,
  tab: AdminTabId
): URLSearchParams {
  const next = new URLSearchParams(previous);
  next.set(ADMIN_TAB_QUERY_KEY, tab);
  if (tab !== 'system' && tab !== 'finance') {
    next.delete(ADMIN_TEST_SESSION_QUERY_KEY);
  }
  return next;
}

export function adminFinanceAccountSearchParams(
  previous: URLSearchParams,
  accountId: string
): URLSearchParams {
  const next = new URLSearchParams(previous);
  next.set(ADMIN_TAB_QUERY_KEY, 'finance');
  next.set(ADMIN_FINANCE_ACCOUNT_QUERY_KEY, accountId);
  next.delete(ADMIN_FINANCE_PAYMENT_QUERY_KEY);
  next.delete(ADMIN_FINANCE_MOVEMENT_FOCUS_QUERY_KEY);
  next.delete(ADMIN_FINANCE_MOVEMENT_PERIOD_QUERY_KEY);
  return next;
}

/**
 * People → Clients account deep-link.
 * Opens the People tab and sets clientAccount for AdminClientDirectory to consume.
 */
export function adminClientAccountSearchParams(
  previous: URLSearchParams,
  accountId: string
): URLSearchParams {
  const next = new URLSearchParams(previous);
  next.set(ADMIN_TAB_QUERY_KEY, 'people');
  next.set(ADMIN_CLIENT_ACCOUNT_QUERY_KEY, accountId);
  return next;
}

/**
 * AdminPlannerBoard reads plannerDate / plannerBooking only — no instructor filter query param.
 * Opens Operations with an optional planner date (defaults to today upstream).
 */
export function adminPlannerSearchParams(
  previous: URLSearchParams,
  options?: {
    readonly localDate?: string;
    readonly instructorId?: string;
  }
): URLSearchParams {
  const next = new URLSearchParams(previous);
  next.set(ADMIN_TAB_QUERY_KEY, 'operations');
  if (options?.localDate) {
    next.set(ADMIN_PLANNER_DATE_QUERY_KEY, options.localDate);
  }
  // instructorId reserved for a future planner filter; intentionally unused today.
  void options?.instructorId;
  return next;
}

/** Product → Operations CourseEnrollment handoff with a canonical Course filter. */
export function adminCourseEnrollmentSearchParams(
  previous: URLSearchParams,
  courseId: string
): URLSearchParams {
  const next = new URLSearchParams(previous);
  next.set(ADMIN_TAB_QUERY_KEY, 'operations');
  next.set(ADMIN_TRAINING_KIND_QUERY_KEY, 'course');
  next.set(ADMIN_TRAINING_SCOPE_QUERY_KEY, 'current');
  next.set(ADMIN_COURSE_ENROLLMENT_VIEW_QUERY_KEY, 'roster');
  next.set(ADMIN_COURSE_ENROLLMENT_COURSE_QUERY_KEY, courseId);
  next.delete(ADMIN_COURSE_ENROLLMENT_QUERY_KEY);
  return next;
}

export const ADMIN_TAB_LABEL_KEYS: Record<AdminTabId, TranslationKey> = {
  operations: 'adminTabOperations',
  finance: 'adminTabFinance',
  people: 'adminTabPeople',
  product: 'adminTabProduct',
  system: 'adminTabSystem',
};

export function isAdminTabId(value: string | null | undefined): value is AdminTabId {
  return value != null && (ADMIN_TAB_IDS as readonly string[]).includes(value);
}

export function parseAdminTabId(value: string | null | undefined): AdminTabId {
  return isAdminTabId(value) ? value : DEFAULT_ADMIN_TAB;
}

export function parseAdminIssueView(value: string | null | undefined): 'open' | 'history' {
  return value === 'history' || value === 'resolved' ? 'history' : 'open';
}

export function parseAdminIssueCategory(
  value: string | null | undefined
):
  | 'attendance'
  | 'payment'
  | 'cancellation'
  | 'reconciliation'
  | 'change_request'
  | 'guest'
  | undefined {
  if (
    value === 'attendance' ||
    value === 'payment' ||
    value === 'cancellation' ||
    value === 'reconciliation' ||
    value === 'change_request' ||
    value === 'guest'
  ) {
    return value;
  }
  return undefined;
}

export function parseAdminIssueSeverity(
  value: string | null | undefined
): AdminIssueSeverity | undefined {
  return value != null && (ADMIN_ISSUE_SEVERITIES as readonly string[]).includes(value)
    ? (value as AdminIssueSeverity)
    : undefined;
}

export function parseAdminFinanceMovementPeriod(
  value: string | null | undefined
): AdminFinancialOverviewPeriod | undefined {
  return value != null && (ADMIN_FINANCIAL_OVERVIEW_PERIODS as readonly string[]).includes(value)
    ? (value as AdminFinancialOverviewPeriod)
    : undefined;
}
