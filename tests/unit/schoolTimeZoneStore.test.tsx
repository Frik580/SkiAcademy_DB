import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  requireSchoolTimeZone,
  retrySchoolTimeZone,
  saveSchoolTimeZone,
  useSchoolTimeZone,
} from '../../src/features/settings/schoolTimeZone';

const mock = vi.hoisted(() => ({
  next: undefined as undefined | ((snapshot: unknown) => void),
  error: undefined as undefined | ((error: Error) => void),
  stop: vi.fn(),
  listen: vi.fn(),
  set: vi.fn(),
  current: { timeZone: 'Asia/Almaty', nameEn: 'Preserved' } as Record<string, unknown>,
}));
vi.mock('../../src/infrastructure/firebase', () => ({
  db: {},
  doc: () => 'resort_data/config',
  onSnapshot: (
    _ref: unknown,
    _options: unknown,
    next: typeof mock.next,
    error: typeof mock.error
  ) => {
    mock.listen();
    mock.next = next;
    mock.error = error;
    return mock.stop;
  },
  runTransaction: async (_db: unknown, callback: (tx: unknown) => Promise<void>) =>
    callback({
      get: async () => ({ exists: () => true, data: () => mock.current }),
      set: mock.set,
    }),
}));
const emit = (data: unknown, fromCache = false, hasPendingWrites = false) =>
  act(() =>
    mock.next?.({
      exists: () => data !== undefined,
      data: () => data,
      metadata: { fromCache, hasPendingWrites },
    })
  );
describe('confirmed school timezone subscription and compare-and-set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.current = { timeZone: 'Asia/Almaty', nameEn: 'Preserved' };
  });
  it('shares one subscription and requires a server-confirmed snapshot', () => {
    const first = renderHook(useSchoolTimeZone);
    const second = renderHook(useSchoolTimeZone);
    expect(mock.listen).toHaveBeenCalledTimes(1);
    expect(() => requireSchoolTimeZone()).toThrow();
    emit({ timeZone: 'UTC' }, true);
    expect(first.result.current.ready).toBe(false);
    emit({ timeZone: 'UTC' });
    expect(requireSchoolTimeZone()).toBe('UTC');
    expect(second.result.current.timeZone).toBe('UTC');
    emit({ timeZone: 'Europe/Paris' }, false, true);
    expect(() => requireSchoolTimeZone()).toThrow();
    first.unmount();
    expect(mock.stop).not.toHaveBeenCalled();
    second.unmount();
    expect(mock.stop).toHaveBeenCalledTimes(1);
  });
  it('distinguishes missing settings from invalid settings and read failures', () => {
    const view = renderHook(useSchoolTimeZone);
    emit(undefined);
    expect(requireSchoolTimeZone()).toBe('Asia/Almaty');
    emit({ timeZone: 'invalid' });
    expect(view.result.current.error).toBeDefined();
    expect(() => requireSchoolTimeZone()).toThrow();
    act(() => mock.error?.(new Error('offline')));
    expect(() => requireSchoolTimeZone()).toThrow('offline');
    view.unmount();
  });
  it('publishes live season changes using the same shared config listener', () => {
    const first = renderHook(useSchoolTimeZone);
    const second = renderHook(useSchoolTimeZone);
    emit({ timeZone: 'Asia/Almaty', season: { startDate: '2026-12-01', endDate: '2027-04-15' } });
    expect(first.result.current.season).toEqual({
      kind: 'configured',
      startDate: '2026-12-01',
      endDate: '2027-04-15',
    });
    emit({ timeZone: 'Asia/Almaty', season: { startDate: 'bad' } });
    expect(second.result.current.season?.kind).toBe('invalid');
    expect(mock.listen).toHaveBeenCalledTimes(1);
    first.unmount();
    second.unmount();
  });
  it('merges only timezone and rejects a concurrent admin change', async () => {
    await saveSchoolTimeZone('Europe/Paris', 'Asia/Almaty');
    expect(mock.set).toHaveBeenCalledWith(
      'resort_data/config',
      { timeZone: 'Europe/Paris' },
      { merge: true }
    );
    mock.current.timeZone = 'UTC';
    mock.set.mockClear();
    await expect(saveSchoolTimeZone('Europe/Moscow', 'Asia/Almaty')).rejects.toThrow('changed');
    expect(mock.set).not.toHaveBeenCalled();
  });
  it('restarts the shared subscription after an error and confirms the retry', () => {
    const first = renderHook(useSchoolTimeZone);
    const second = renderHook(useSchoolTimeZone);
    act(() => mock.error?.(new Error('offline')));
    act(() => retrySchoolTimeZone());
    expect(mock.stop).toHaveBeenCalledOnce();
    expect(mock.listen).toHaveBeenCalledTimes(2);
    expect(first.result.current.ready).toBe(false);
    emit({ timeZone: 'Europe/Paris' });
    expect(first.result.current.ready).toBe(true);
    expect(second.result.current.timeZone).toBe('Europe/Paris');
  });
});
