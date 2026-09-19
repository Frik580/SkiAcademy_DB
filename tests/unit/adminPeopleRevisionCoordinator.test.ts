import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const unsubscribeMock = vi.fn();
const subscribeMock = vi.fn();

vi.mock('../../src/features/admin/identity/subscribeAdminPeopleRevision', () => ({
  subscribeAdminPeopleRevision: (...args: unknown[]) => subscribeMock(...args),
}));

import {
  registerAdminPeopleRevisionFromCommand,
  registerAdminPeopleRevisionListener,
  resetAdminPeopleRevisionCoordinatorForTests,
} from '../../src/features/admin/identity/adminPeopleRevisionCoordinator';

describe('adminPeopleRevisionCoordinator', () => {
  beforeEach(() => {
    resetAdminPeopleRevisionCoordinatorForTests();
    unsubscribeMock.mockReset();
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => unsubscribeMock);
  });

  afterEach(() => {
    resetAdminPeopleRevisionCoordinatorForTests();
  });

  it('shares one Firestore subscription across People consumers', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registerAdminPeopleRevisionListener(first);
    const unregisterSecond = registerAdminPeopleRevisionListener(second);

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
    registerAdminPeopleRevisionListener(listener);

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
    registerAdminPeopleRevisionListener(listener);

    emitRevision?.(31);
    registerAdminPeopleRevisionFromCommand(32);
    emitRevision?.(32);
    expect(listener).not.toHaveBeenCalled();

    emitRevision?.(33);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not register a fake revision from a failed command payload', () => {
    registerAdminPeopleRevisionFromCommand(undefined);
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const listener = vi.fn();
    registerAdminPeopleRevisionListener(listener);

    emitRevision?.(5);
    expect(listener).not.toHaveBeenCalled();
  });
});
