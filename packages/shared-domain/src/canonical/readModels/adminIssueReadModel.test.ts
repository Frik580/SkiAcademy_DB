import { describe, expect, it } from 'vitest';
import {
  AdminIssueInboxItemSchema,
  QueryAdminIssueReadModelsInputSchema,
  decodeAdminIssueReadModelCursor,
  encodeAdminIssueReadModelCursor,
} from './adminIssueReadModel';

describe('AdminIssue read-model transport', () => {
  it('requires an issue id only for detail and bounds list pagination', () => {
    expect(
      QueryAdminIssueReadModelsInputSchema.safeParse({
        scope: 'admin_detail',
      }).success
    ).toBe(false);
    expect(
      QueryAdminIssueReadModelsInputSchema.safeParse({
        scope: 'admin_open',
        issueId: 'admin_issue_invalid_for_list',
      }).success
    ).toBe(false);
    expect(
      QueryAdminIssueReadModelsInputSchema.safeParse({
        scope: 'admin_history',
        pageSize: 51,
      }).success
    ).toBe(false);
  });

  it('round-trips a stable timestamp and id cursor', () => {
    const cursor = {
      scope: 'admin_open',
      severity: 'critical',
      updatedAtSeconds: 1_788_000_000,
      updatedAtNanoseconds: 123_000_000,
      issueId: 'admin_issue_cursor_fixture_01',
    } as const;
    expect(decodeAdminIssueReadModelCursor(encodeAdminIssueReadModelCursor(cursor))).toEqual(
      cursor
    );
    expect(decodeAdminIssueReadModelCursor('not-a-cursor')).toBeUndefined();
  });

  it('accepts optional inbox presentation fields without requiring a second source of truth', () => {
    expect(
      AdminIssueInboxItemSchema.safeParse({
        issueId: 'admin_issue_presentation_01',
        revision: 1,
        kind: 'missing_attendance',
        severity: 'normal',
        lifecycle: {
          status: 'open',
          openedAt: { seconds: 1, nanoseconds: 0 },
          lastDetectedAt: { seconds: 1, nanoseconds: 0 },
        },
        subjectRef: { subjectKind: 'booking', bookingId: 'booking_presentation_01' },
        summaryCode: 'missing_attendance',
        actionRequirement: 'action_required',
        blockingCondition: 'outcome',
        subjectDisplayName: 'Maya Snow',
        lessonStartsAt: { seconds: 2, nanoseconds: 0 },
        lessonEndsAt: { seconds: 3, nanoseconds: 0 },
        lessonTimeZone: 'Asia/Almaty',
        presentationOrigin: 'guest',
        createdAt: { seconds: 1, nanoseconds: 0 },
        updatedAt: { seconds: 1, nanoseconds: 0 },
      }).success
    ).toBe(true);
  });
});
