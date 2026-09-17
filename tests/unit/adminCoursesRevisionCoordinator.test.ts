import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const unsubscribeMock = vi.fn();
const subscribeMock = vi.fn();

vi.mock('../../src/features/admin/courses/subscribeAdminCoursesRevision', () => ({
  subscribeAdminCoursesRevision: (...args: unknown[]) => subscribeMock(...args),
}));

import {
  registerAdminCoursesRevisionFromCommand,
  registerAdminCoursesRevisionListener,
  resetAdminCoursesRevisionCoordinatorForTests,
} from '../../src/features/admin/courses/adminCoursesRevisionCoordinator';

describe('adminCoursesRevisionCoordinator', () => {
  beforeEach(() => {
    resetAdminCoursesRevisionCoordinatorForTests();
    unsubscribeMock.mockReset();
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => unsubscribeMock);
  });

  afterEach(() => {
    resetAdminCoursesRevisionCoordinatorForTests();
  });

  it('shares one Firestore subscription across course consumers', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registerAdminCoursesRevisionListener(first);
    const unregisterSecond = registerAdminCoursesRevisionListener(second);

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
    registerAdminCoursesRevisionListener(listener);

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
    registerAdminCoursesRevisionListener(listener);

    emitRevision?.(41);
    registerAdminCoursesRevisionFromCommand(42);
    emitRevision?.(42);
    expect(listener).not.toHaveBeenCalled();

    emitRevision?.(43);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not register a fake revision from a failed command payload', () => {
    registerAdminCoursesRevisionFromCommand(undefined);
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const listener = vi.fn();
    registerAdminCoursesRevisionListener(listener);

    emitRevision?.(5);
    expect(listener).not.toHaveBeenCalled();
  });
});
