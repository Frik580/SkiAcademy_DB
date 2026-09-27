import { describe, expect, it, vi } from 'vitest';
import { runPostCreateRefresh } from '../../src/lib/canonical/runPostCreateRefresh';

const warnMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/shared', () => ({
  logger: { warn: warnMock },
}));

describe('runPostCreateRefresh', () => {
  it('returns refreshFailed without throwing when refresh rejects', async () => {
    warnMock.mockReset();
    const result = await runPostCreateRefresh(async () => {
      throw new Error('network');
    }, 'booking_created_refresh_failed');
    expect(result).toEqual({ refreshFailed: true });
    expect(warnMock).toHaveBeenCalledWith('booking_created_refresh_failed', expect.any(Error));
  });

  it('returns empty result when refresh succeeds', async () => {
    const result = await runPostCreateRefresh(async () => undefined, 'booking_created_refresh_failed');
    expect(result).toEqual({});
  });
});
