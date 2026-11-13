import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), callable: vi.fn(), call: vi.fn() }));
vi.mock('../../src/infrastructure/firebase', () => ({
  db: {},
  functions: {},
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: mocks.snapshot,
}));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
import {
  subscribeErrorLogs,
  deleteErrorLog,
  clearErrorLogs,
} from '../../src/features/admin/adminService';

describe('error log service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callable.mockReturnValue(mocks.call);
  });
  it('surfaces subscription failures without reporting them back into error_logs', () => {
    const onError = vi.fn();
    subscribeErrorLogs(vi.fn(), onError);
    const error = new Error('permission denied');
    mocks.snapshot.mock.calls[0][2](error);
    expect(onError).toHaveBeenCalledWith(error);
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('uses real document IDs for both new and old logs and preserves pagination', () => {
    const onLogs = vi.fn();
    subscribeErrorLogs(onLogs, vi.fn(), 2);
    mocks.snapshot.mock.calls[0][1]({
      docs: ['sha256', 'legacy', 'extra'].map((id) => ({
        id,
        data: () => ({ id: 'wrong', message: 'redacted' }),
      })),
    });
    expect(onLogs).toHaveBeenCalledWith(
      [
        { id: 'sha256', message: 'redacted' },
        { id: 'legacy', message: 'redacted' },
      ],
      true
    );
  });
  it('only confirms single deletion after server success and propagates not-found', async () => {
    mocks.call.mockRejectedValueOnce({ code: 'functions/not-found' });
    await expect(deleteErrorLog('missing')).rejects.toMatchObject({ code: 'functions/not-found' });
    mocks.call.mockResolvedValueOnce({ data: { deleted: false } });
    await expect(deleteErrorLog('wrong')).rejects.toThrow('not confirmed');
    mocks.call.mockResolvedValueOnce({ data: { deleted: true } });
    await deleteErrorLog('sha256');
    expect(mocks.call).toHaveBeenLastCalledWith({ id: 'sha256' });
  });
  it('sends cleanup continuation to the server without UI IDs and rejects unconfirmed results', async () => {
    mocks.call.mockResolvedValueOnce({ data: { deleted: 200, done: false, cursor: 'next' } });
    expect(await clearErrorLogs('previous')).toEqual({ deleted: 200, done: false, cursor: 'next' });
    expect(mocks.call).toHaveBeenCalledWith({ cursor: 'previous' });
    mocks.call.mockResolvedValueOnce({ data: { deleted: 200, done: false, cursor: null } });
    await expect(clearErrorLogs()).rejects.toThrow('not confirmed');
  });
});
