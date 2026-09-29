import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const unsubscribeMock = vi.fn();
const subscribeMock = vi.fn();

vi.mock('../../src/features/admin/finance/subscribeAdminFinanceRevision', () => ({
  subscribeAdminFinanceRevision: (...args: unknown[]) => subscribeMock(...args),
}));

import {
  registerAdminFinanceRevisionFromCommand,
  registerAdminFinanceRevisionListener,
  resetAdminFinanceRevisionCoordinatorForTests,
} from '../../src/features/admin/finance/adminFinanceRevisionCoordinator';
import { applyAdminFinanceCommandResult } from '../../src/features/admin/finance/adminFinanceLocalSync';
import type { CommandResult } from '@ski-academy/shared-domain';

describe('adminFinanceRevisionCoordinator', () => {
  beforeEach(() => {
    resetAdminFinanceRevisionCoordinatorForTests();
    unsubscribeMock.mockReset();
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => unsubscribeMock);
  });

  afterEach(() => {
    resetAdminFinanceRevisionCoordinatorForTests();
  });

  it('shares one Firestore subscription across finance consumers', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unregisterFirst = registerAdminFinanceRevisionListener(first);
    const unregisterSecond = registerAdminFinanceRevisionListener(second);

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
    registerAdminFinanceRevisionListener(listener);

    emitRevision?.(10);
    emitRevision?.(10);
    expect(listener).not.toHaveBeenCalled();

    emitRevision?.(11);
    expect(listener).toHaveBeenCalledTimes(1);

    emitRevision?.(11);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('notifies mounted consumers once for a command revision and deduplicates its snapshot', () => {
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const listener = vi.fn();
    registerAdminFinanceRevisionListener(listener);

    emitRevision?.(69);
    registerAdminFinanceRevisionFromCommand(70);
    expect(listener).toHaveBeenCalledTimes(1);
    emitRevision?.(70);
    expect(listener).toHaveBeenCalledTimes(1);

    emitRevision?.(71);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('fans a command result out to mounted booking and finance consumers exactly once', () => {
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const bookingDetail = vi.fn();
    const schoolMovement = vi.fn();
    registerAdminFinanceRevisionListener(bookingDetail);
    registerAdminFinanceRevisionListener(schoolMovement);

    emitRevision?.(10);
    applyAdminFinanceCommandResult({
      status: 'success',
      payload: { adminFinanceRevision: 11 },
    } as unknown as CommandResult);
    expect(bookingDetail).toHaveBeenCalledTimes(1);
    expect(schoolMovement).toHaveBeenCalledTimes(1);

    emitRevision?.(11);
    emitRevision?.(11);
    expect(bookingDetail).toHaveBeenCalledTimes(1);
    expect(schoolMovement).toHaveBeenCalledTimes(1);
  });

  it('deduplicates a command result when its advancing snapshot arrived first', () => {
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const first = vi.fn();
    const second = vi.fn();
    registerAdminFinanceRevisionListener(first);
    registerAdminFinanceRevisionListener(second);

    emitRevision?.(10);
    emitRevision?.(11);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    applyAdminFinanceCommandResult({
      status: 'success',
      payload: { adminFinanceRevision: 11 },
    } as unknown as CommandResult);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('delivers a command result after the initial snapshot established the same baseline', () => {
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const listener = vi.fn();
    registerAdminFinanceRevisionListener(listener);

    emitRevision?.(11);
    expect(listener).not.toHaveBeenCalled();

    applyAdminFinanceCommandResult({
      status: 'success',
      payload: { adminFinanceRevision: 11 },
    } as unknown as CommandResult);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not replay an old command invalidation to a later subscriber', () => {
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const existingConsumer = vi.fn();
    const laterConsumer = vi.fn();
    registerAdminFinanceRevisionListener(existingConsumer);
    emitRevision?.(10);

    registerAdminFinanceRevisionFromCommand(11);
    registerAdminFinanceRevisionListener(laterConsumer);
    emitRevision?.(11);

    expect(existingConsumer).toHaveBeenCalledTimes(1);
    expect(laterConsumer).not.toHaveBeenCalled();
  });

  it('does not register a fake revision from a failed command payload', () => {
    registerAdminFinanceRevisionFromCommand(undefined);
    let emitRevision: ((revision: number) => void) | undefined;
    subscribeMock.mockImplementation((onRevision: (revision: number) => void) => {
      emitRevision = onRevision;
      return unsubscribeMock;
    });
    const listener = vi.fn();
    registerAdminFinanceRevisionListener(listener);

    emitRevision?.(5);
    expect(listener).not.toHaveBeenCalled();
  });
});
