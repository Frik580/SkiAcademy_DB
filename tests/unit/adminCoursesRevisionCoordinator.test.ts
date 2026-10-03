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

  it('reconciles the initial nonzero snapshot once and deduplicates subsequent revisions', () => {
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const listener = vi.fn();
    registerAdminCoursesRevisionListener(listener);

    emitRevision?.(10);
    emitRevision?.(10);
    expect(listener).toHaveBeenCalledTimes(1);

    emitRevision?.(11);
    expect(listener).toHaveBeenCalledTimes(2);

    emitRevision?.(11);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('notifies mounted consumers once for a command revision and deduplicates its snapshot', () => {
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const listener = vi.fn();
    registerAdminCoursesRevisionListener(listener);

    emitRevision?.(41);
    listener.mockClear();
    registerAdminCoursesRevisionFromCommand(42);
    expect(listener).toHaveBeenCalledTimes(1);
    emitRevision?.(42);
    expect(listener).toHaveBeenCalledTimes(1);

    emitRevision?.(43);
    expect(listener).toHaveBeenCalledTimes(2);
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
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('skips an empty baseline and does not repeat a command invalidation in the first snapshot', () => {
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const listener = vi.fn();
    registerAdminCoursesRevisionListener(listener);
    emitRevision?.(0);
    expect(listener).not.toHaveBeenCalled();

    resetAdminCoursesRevisionCoordinatorForTests();
    registerAdminCoursesRevisionListener(listener);
    registerAdminCoursesRevisionFromCommand(1);
    expect(listener).toHaveBeenCalledTimes(1);
    emitRevision?.(1);
    expect(listener).toHaveBeenCalledTimes(1);
    emitRevision?.(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
