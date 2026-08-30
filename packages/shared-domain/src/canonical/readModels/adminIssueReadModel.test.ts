import { describe, expect, it } from 'vitest';
import {
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
});
