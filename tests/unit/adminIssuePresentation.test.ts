import { describe, expect, it } from 'vitest';
import type { AdminIssueInboxItem } from '@ski-academy/shared-domain';
import {
  adminIssueHasGuestPresentation,
  adminIssueMatchesCategory,
  adminIssuePrimaryDestination,
  adminIssueSearchHaystack,
} from '../../src/features/admin/issues/adminIssuePresentation';

const issue = {
  kind: 'missing_attendance',
  subjectRef: { subjectKind: 'booking', bookingId: 'booking_presentation_01' },
  subjectDisplayName: 'Maya Snow',
  courseTitle: undefined,
  presentationOrigin: undefined,
} as const satisfies Pick<
  AdminIssueInboxItem,
  'kind' | 'subjectRef' | 'subjectDisplayName' | 'courseTitle' | 'presentationOrigin'
>;

describe('adminIssuePresentation', () => {
  it('keeps guest category off unless source presentation origin exists', () => {
    expect(adminIssueHasGuestPresentation([issue])).toBe(false);
    expect(adminIssueMatchesCategory(issue, 'guest')).toBe(false);
    expect(
      adminIssueHasGuestPresentation([{ ...issue, presentationOrigin: 'guest' }])
    ).toBe(true);
    expect(adminIssueMatchesCategory({ ...issue, presentationOrigin: 'guest' }, 'guest')).toBe(
      true
    );
  });

  it('chooses the existing navigation destination instead of a resolve command', () => {
    expect(adminIssuePrimaryDestination(issue)).toBe('lesson');
    expect(
      adminIssuePrimaryDestination({
        kind: 'attendance_payment_conflict',
        subjectRef: { subjectKind: 'course_enrollment', enrollmentId: 'course_enrollment_01' },
        payment: { paymentId: 'payment_01' },
      } as Parameters<typeof adminIssuePrimaryDestination>[0])
    ).toBe('payment');
    expect(
      adminIssuePrimaryDestination({
        kind: 'attendance_payment_conflict',
        subjectRef: { subjectKind: 'course_enrollment', enrollmentId: 'course_enrollment_01' },
      })
    ).toBe('enrollment');
  });

  it('indexes human list fields for search without requiring extra queries', () => {
    expect(adminIssueSearchHaystack(issue)).toContain('maya snow');
  });
});
