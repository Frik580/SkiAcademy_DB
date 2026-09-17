import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const unsubscribeMock = vi.fn();
const subscribeMock = vi.fn();

vi.mock('../../src/features/admin/operations/subscribeAdminPlannerRevision', () => ({
  subscribeAdminPlannerRevision: (...args: unknown[]) => subscribeMock(...args),
}));

import {
  registerAdminPlannerRevisionFromCommand,
  registerAdminPlannerRevisionListener,
  resetAdminPlannerRevisionCoordinatorForTests,
} from '../../src/features/admin/operations/adminPlannerRevisionCoordinator';

describe('adminPlannerRevisionCoordinator', () => {
  beforeEach(() => {
    resetAdminPlannerRevisionCoordinatorForTests();
    unsubscribeMock.mockReset();
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => unsubscribeMock);
  });

  afterEach(() => {
    resetAdminPlannerRevisionCoordinatorForTests();
  });

  it('shares one Firestore subscription across planner consumers', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registerAdminPlannerRevisionListener(first);
    const unregisterSecond = registerAdminPlannerRevisionListener(second);

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
    registerAdminPlannerRevisionListener(listener);

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
    registerAdminPlannerRevisionListener(listener);

    emitRevision?.(43);
    registerAdminPlannerRevisionFromCommand(44);
    emitRevision?.(44);
    expect(listener).not.toHaveBeenCalled();

    emitRevision?.(45);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not register a fake revision from a failed command payload', () => {
    registerAdminPlannerRevisionFromCommand(undefined);
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const listener = vi.fn();
    registerAdminPlannerRevisionListener(listener);

    emitRevision?.(5);
    expect(listener).not.toHaveBeenCalled();
  });
});
