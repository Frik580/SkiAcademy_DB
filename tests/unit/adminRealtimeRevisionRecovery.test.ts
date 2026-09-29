import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => ({
  doc: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('../../src/infrastructure/firebase', () => ({
  db: {},
  doc: firebaseMocks.doc,
  onSnapshot: firebaseMocks.onSnapshot,
}));

import {
  registerAdminFinanceRevisionListener,
  resetAdminFinanceRevisionCoordinatorForTests,
} from '../../src/features/admin/finance/adminFinanceRevisionCoordinator';

interface RevisionSnapshot {
  exists: () => boolean;
  data: () => unknown;
}

interface MockRevisionListener {
  readonly next: (snapshot: RevisionSnapshot) => void;
  readonly error: (error: { readonly code: string; readonly message: string }) => void;
  readonly unsubscribe: ReturnType<typeof vi.fn>;
  active: boolean;
}

const listeners: MockRevisionListener[] = [];

function createSnapshot(revision: number): RevisionSnapshot {
  return {
    exists: () => true,
    data: () => ({ revision, updatedAt: { seconds: 1, nanoseconds: 0 } }),
  };
}

function emitRevision(listener: MockRevisionListener, revision: number): void {
  if (listener.active) listener.next(createSnapshot(revision));
}

function failListener(listener: MockRevisionListener, code: string): void {
  if (!listener.active) return;
  listener.active = false;
  listener.error({ code, message: `mock ${code}` });
}

describe('Admin realtime revision listener recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listeners.length = 0;
    resetAdminFinanceRevisionCoordinatorForTests();
    firebaseMocks.doc.mockReset().mockReturnValue({ path: 'admin_runtime/admin_finance' });
    firebaseMocks.onSnapshot
      .mockReset()
      .mockImplementation(
        (
          _ref: unknown,
          next: MockRevisionListener['next'],
          error: MockRevisionListener['error']
        ) => {
          const listener: MockRevisionListener = {
            next,
            error,
            unsubscribe: vi.fn(() => {
              listener.active = false;
            }),
            active: true,
          };
          listeners.push(listener);
          return listener.unsubscribe;
        }
      );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    resetAdminFinanceRevisionCoordinatorForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('recovers after a terminal listener error and delivers later revisions once', async () => {
    const firstRefresh = vi.fn();
    const unregisterFirst = registerAdminFinanceRevisionListener(firstRefresh);
    expect(firebaseMocks.onSnapshot).toHaveBeenCalledTimes(1);

    emitRevision(listeners[0], 10);
    emitRevision(listeners[0], 11);
    expect(firstRefresh).toHaveBeenCalledTimes(1);

    failListener(listeners[0], 'unavailable');

    const secondRefresh = vi.fn();
    const unregisterSecond = registerAdminFinanceRevisionListener(secondRefresh);
    expect(firebaseMocks.onSnapshot).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    emitRevision(listeners[0], 12);
    expect(firstRefresh).toHaveBeenCalledTimes(1);
    expect(firebaseMocks.onSnapshot).toHaveBeenCalledTimes(2);
    expect(listeners.filter((listener) => listener.active)).toHaveLength(1);

    const racingRefresh = vi.fn();
    const unregisterRacing = registerAdminFinanceRevisionListener(racingRefresh);
    expect(firebaseMocks.onSnapshot).toHaveBeenCalledTimes(2);

    emitRevision(listeners[1], 11);
    expect(firstRefresh).toHaveBeenCalledTimes(1);
    expect(secondRefresh).not.toHaveBeenCalled();
    expect(racingRefresh).not.toHaveBeenCalled();

    emitRevision(listeners[1], 12);
    emitRevision(listeners[1], 12);
    expect(firstRefresh).toHaveBeenCalledTimes(2);
    expect(secondRefresh).toHaveBeenCalledTimes(1);
    expect(racingRefresh).toHaveBeenCalledTimes(1);

    unregisterFirst();
    unregisterSecond();
    unregisterRacing();
    expect(listeners[1].unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('cancels a scheduled retry when the last consumer stops', async () => {
    const unregister = registerAdminFinanceRevisionListener(vi.fn());
    failListener(listeners[0], 'unavailable');

    unregister();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(firebaseMocks.onSnapshot).toHaveBeenCalledTimes(1);
    expect(listeners.filter((listener) => listener.active)).toHaveLength(0);
  });

  it('does not hot-retry permanent permission errors and logs the stop', async () => {
    const unregisterFirst = registerAdminFinanceRevisionListener(vi.fn());
    failListener(listeners[0], 'permission-denied');

    const unregisterSecond = registerAdminFinanceRevisionListener(vi.fn());
    await vi.advanceTimersByTimeAsync(60_000);

    expect(firebaseMocks.onSnapshot).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('recovery stopped'),
      expect.objectContaining({
        signal: 'admin_runtime/admin_finance',
        code: 'permission-denied',
        recovery: 'stopped',
      })
    );

    unregisterFirst();
    unregisterSecond();
  });

  it('backs off repeated terminal errors and resets the delay after a snapshot', async () => {
    const unregister = registerAdminFinanceRevisionListener(vi.fn());
    failListener(listeners[0], 'unavailable');
    await vi.advanceTimersByTimeAsync(1_000);

    failListener(listeners[1], 'unavailable');
    await vi.advanceTimersByTimeAsync(1_999);
    expect(firebaseMocks.onSnapshot).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(firebaseMocks.onSnapshot).toHaveBeenCalledTimes(3);

    emitRevision(listeners[2], 10);
    failListener(listeners[2], 'unavailable');
    await vi.advanceTimersByTimeAsync(999);
    expect(firebaseMocks.onSnapshot).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(firebaseMocks.onSnapshot).toHaveBeenCalledTimes(4);

    unregister();
    expect(listeners[3].unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes once on stop and ignores events after stop', () => {
    const refresh = vi.fn();
    const unregister = registerAdminFinanceRevisionListener(refresh);
    emitRevision(listeners[0], 10);

    unregister();
    unregister();
    emitRevision(listeners[0], 11);

    expect(listeners[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});
