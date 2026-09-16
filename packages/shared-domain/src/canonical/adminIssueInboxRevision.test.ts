import { describe, expect, it } from 'vitest';
import {
  adminIssueInboxRevisionReason,
  reduceAdminIssueInboxRevisionSignal,
} from './adminIssueInboxRevision';

describe('adminIssueInboxRevisionReason', () => {
  it('bumps for create, resolve, and reopen only', () => {
    expect(
      adminIssueInboxRevisionReason({ nextStatus: 'open' })
    ).toBe('created');
    expect(
      adminIssueInboxRevisionReason({ previousStatus: 'open', nextStatus: 'resolved' })
    ).toBe('resolved');
    expect(
      adminIssueInboxRevisionReason({ previousStatus: 'open', nextStatus: 'dismissed' })
    ).toBe('resolved');
    expect(
      adminIssueInboxRevisionReason({ previousStatus: 'resolved', nextStatus: 'open' })
    ).toBe('reopened');
    expect(
      adminIssueInboxRevisionReason({ previousStatus: 'open', nextStatus: 'open' })
    ).toBeUndefined();
    expect(
      adminIssueInboxRevisionReason({ previousStatus: 'resolved', nextStatus: 'resolved' })
    ).toBeUndefined();
  });
});

describe('reduceAdminIssueInboxRevisionSignal', () => {
  it('skips the initial snapshot and duplicate revisions, then refreshes once', () => {
    const initial = reduceAdminIssueInboxRevisionSignal({ initialized: false }, 10);
    expect(initial).toEqual({ initialized: true, lastRevision: 10, shouldRefresh: false });

    const duplicate = reduceAdminIssueInboxRevisionSignal(initial, 10);
    expect(duplicate.shouldRefresh).toBe(false);

    const changed = reduceAdminIssueInboxRevisionSignal(duplicate, 11);
    expect(changed).toEqual({ initialized: true, lastRevision: 11, shouldRefresh: true });
  });
});
