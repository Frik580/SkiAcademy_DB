import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const unsubscribeMock = vi.fn();
const subscribeMock = vi.fn();

vi.mock('../../src/features/admin/issues/subscribeAdminIssueInboxRevision', () => ({
  subscribeAdminIssueInboxRevision: (...args: unknown[]) => subscribeMock(...args),
}));

import {
  registerAdminIssueInboxRevisionFromCommand,
  registerAdminIssueInboxRevisionListener,
  resetAdminIssueInboxRevisionCoordinatorForTests,
} from '../../src/features/admin/issues/adminIssueInboxRevisionCoordinator';

describe('adminIssueInboxRevisionCoordinator', () => {
  beforeEach(() => {
    resetAdminIssueInboxRevisionCoordinatorForTests();
    unsubscribeMock.mockReset();
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => unsubscribeMock);
  });

  afterEach(() => {
    resetAdminIssueInboxRevisionCoordinatorForTests();
  });

  it('shares one Firestore subscription across inbox consumers', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registerAdminIssueInboxRevisionListener(first);
    const unregisterSecond = registerAdminIssueInboxRevisionListener(second);

    expect(subscribeMock).toHaveBeenCalledTimes(1);

    unregisterFirst();
    expect(unsubscribeMock).not.toHaveBeenCalled();

    unregisterSecond();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('skips the initial snapshot and duplicate revisions, then notifies once', () => {
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const listener = vi.fn();
    registerAdminIssueInboxRevisionListener(listener);

    emitRevision?.(10);
    emitRevision?.(10);
    expect(listener).not.toHaveBeenCalled();

    emitRevision?.(11);
    expect(listener).toHaveBeenCalledTimes(1);

    emitRevision?.(11);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('suppresses the listener refresh for the same-client command revision', () => {
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const listener = vi.fn();
    registerAdminIssueInboxRevisionListener(listener);

    emitRevision?.(20);
    registerAdminIssueInboxRevisionFromCommand(21);
    emitRevision?.(21);
    expect(listener).not.toHaveBeenCalled();

    emitRevision?.(22);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not register a fake revision from a failed command payload', () => {
    registerAdminIssueInboxRevisionFromCommand(undefined);
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const listener = vi.fn();
    registerAdminIssueInboxRevisionListener(listener);

    emitRevision?.(5);
    expect(listener).not.toHaveBeenCalled();
  });
});
