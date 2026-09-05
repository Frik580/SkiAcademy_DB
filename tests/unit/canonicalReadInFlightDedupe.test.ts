import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  QUERY_COURSE_CATALOG_READ_MODELS_CALLABLE,
  QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE,
  __getCanonicalReadTransportInvocationCountForTests,
  __resetCanonicalReadInFlightRegistryForTests,
  __setCanonicalReadSessionKeyResolverForTests,
  queryCourseCatalogReadModels,
  queryLessonBookingReadModels,
} from '../../src/lib/canonical/canonicalReadModelClient';
import { callFunction } from '../../src/lib/functions/functionsClient';

const callFunctionMock = vi.fn();

vi.mock('../../src/lib/functions/functionsClient', () => ({
  callFunction: (...args: unknown[]) => callFunctionMock(...args),
}));

describe('canonical read in-flight dedupe', () => {
  beforeEach(() => {
    callFunctionMock.mockReset();
    __resetCanonicalReadInFlightRegistryForTests();
    __setCanonicalReadSessionKeyResolverForTests(() => 'session_test_user');
  });

  it('dedupes identical concurrent reads to one transport invocation', async () => {
    let resolveTransport!: (value: unknown) => void;
    callFunctionMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTransport = resolve;
        })
    );

    const first = queryCourseCatalogReadModels({ scope: 'public' });
    const second = queryCourseCatalogReadModels({ scope: 'public' });

    expect(callFunctionMock).toHaveBeenCalledTimes(1);
    expect(__getCanonicalReadTransportInvocationCountForTests()).toBe(1);

    resolveTransport({ scope: 'public', items: [{ courseId: 'course_1' }] });
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(a).toEqual({ scope: 'public', items: [{ courseId: 'course_1' }] });
  });

  it('propagates shared rejection and clears the registry for retry', async () => {
    let rejectTransport!: (reason: unknown) => void;
    callFunctionMock.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectTransport = reject;
        })
    );

    const first = queryCourseCatalogReadModels({ scope: 'public' });
    const second = queryCourseCatalogReadModels({ scope: 'public' });
    const failure = new Error('catalog unavailable');
    rejectTransport(failure);

    await expect(first).rejects.toBe(failure);
    await expect(second).rejects.toBe(failure);
    expect(callFunctionMock).toHaveBeenCalledTimes(1);

    callFunctionMock.mockResolvedValueOnce({ scope: 'public', items: [] });
    await queryCourseCatalogReadModels({ scope: 'public' });
    expect(callFunctionMock).toHaveBeenCalledTimes(2);
    expect(__getCanonicalReadTransportInvocationCountForTests()).toBe(2);
  });

  it('issues a fresh transport call after the previous request completes', async () => {
    callFunctionMock
      .mockResolvedValueOnce({ scope: 'public', items: [{ courseId: 'a' }] })
      .mockResolvedValueOnce({ scope: 'public', items: [{ courseId: 'b' }] });

    const first = await queryCourseCatalogReadModels({ scope: 'public' });
    const second = await queryCourseCatalogReadModels({ scope: 'public' });

    expect(callFunctionMock).toHaveBeenCalledTimes(2);
    expect(first).not.toEqual(second);
  });

  it('does not dedupe different scopes or cursors', async () => {
    callFunctionMock.mockResolvedValue({ scope: 'account_hot', items: [], hasMore: false });

    await Promise.all([
      queryLessonBookingReadModels({ scope: 'account_hot' }),
      queryLessonBookingReadModels({ scope: 'account_history' }),
      queryLessonBookingReadModels({ scope: 'account_history', cursor: 'cursor_a' }),
      queryLessonBookingReadModels({ scope: 'account_history', cursor: 'cursor_b' }),
    ]);

    expect(callFunctionMock).toHaveBeenCalledTimes(4);
    expect(callFunctionMock.mock.calls.map((call) => call[0])).toEqual([
      QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE,
      QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE,
      QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE,
      QUERY_LESSON_BOOKING_READ_MODELS_CALLABLE,
    ]);
  });

  it('does not share in-flight reads across auth sessions', async () => {
    let resolveFirst!: (value: unknown) => void;
    callFunctionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          if (!resolveFirst) {
            resolveFirst = resolve;
            return;
          }
          resolve({ scope: 'public', items: [{ courseId: 'second_session' }] });
        })
    );

    __setCanonicalReadSessionKeyResolverForTests(() => 'user_a');
    const first = queryCourseCatalogReadModels({ scope: 'public' });
    __setCanonicalReadSessionKeyResolverForTests(() => 'user_b');
    const second = queryCourseCatalogReadModels({ scope: 'public' });

    expect(callFunctionMock).toHaveBeenCalledTimes(2);
    resolveFirst({ scope: 'public', items: [{ courseId: 'first_session' }] });
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({ scope: 'public', items: [{ courseId: 'first_session' }] });
    expect(b).toEqual({ scope: 'public', items: [{ courseId: 'second_session' }] });
  });

  it('does not dedupe different guest-fund filters', async () => {
    const { queryAdminFinanceReadModels } =
      await import('../../src/lib/canonical/canonicalReadModelClient');
    callFunctionMock.mockResolvedValue({ scope: 'admin_guest_funds', items: [], hasMore: false });

    await Promise.all([
      queryAdminFinanceReadModels({ scope: 'admin_guest_funds', filter: 'unlinked' }),
      queryAdminFinanceReadModels({ scope: 'admin_guest_funds', filter: 'linked' }),
    ]);

    expect(callFunctionMock).toHaveBeenCalledTimes(2);
  });

  it('suppresses StrictMode-like concurrent remount of the same in-flight key', async () => {
    let resolveTransport!: (value: unknown) => void;
    callFunctionMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTransport = resolve;
        })
    );

    const mounts = [
      queryCourseCatalogReadModels({ scope: 'public' }),
      queryCourseCatalogReadModels({ scope: 'public' }),
      queryCourseCatalogReadModels({ scope: 'public' }),
    ];
    expect(callFunctionMock).toHaveBeenCalledTimes(1);
    resolveTransport({ scope: 'public', items: [] });
    await Promise.all(mounts);
    expect(callFunctionMock).toHaveBeenCalledWith(
      QUERY_COURSE_CATALOG_READ_MODELS_CALLABLE,
      { scope: 'public' },
      expect.objectContaining({ idempotencyKey: 'read:course_catalog:public:all' })
    );
  });
});

describe('canonical command path isolation', () => {
  it('keeps command client on callFunction without read in-flight registry', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(process.cwd(), 'src/lib/canonical/canonicalCommandClient.ts'),
      'utf8'
    );
    expect(source).toContain("import { callFunction } from '../functions/functionsClient'");
    expect(source).not.toContain('invokeCanonicalReadCallable');
    expect(source).not.toContain('inFlightCanonicalReads');
    expect(typeof callFunction).toBe('function');
  });
});
