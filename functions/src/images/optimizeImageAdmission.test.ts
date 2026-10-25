import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
const mocks = vi.hoisted(() => ({ exists: vi.fn(), download: vi.fn(), file: vi.fn() }));
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ file: mocks.file }) }),
}));
vi.mock('../adminApp', () => ({ getOrInitApp: vi.fn() }));
import { optimizeImageFromParams } from './optimizeImage';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
const params = {
  sourceUrl: 'https://storage.yandexcloud.net/carve/a.png',
  width: 960,
  quality: 72,
};
describe('public image cost admission', () => {
  it('serves cached images without consuming the transform quota', async () => {
    mocks.exists.mockResolvedValue([true]);
    mocks.download.mockResolvedValue([Buffer.from('cached-image')]);
    mocks.file.mockReturnValue(mocks);
    const admitCacheMiss = vi.fn();
    expect(await optimizeImageFromParams({ ...params, admitCacheMiss })).toMatchObject({
      ok: true,
      cacheHit: true,
    });
    expect(admitCacheMiss).not.toHaveBeenCalled();
  });
  it('rejects an exhausted transform quota before fetching an uncached source', async () => {
    mocks.exists.mockResolvedValue([false]);
    mocks.file.mockReturnValue(mocks);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const admitCacheMiss = vi
      .fn()
      .mockRejectedValue(new HttpsError('resource-exhausted', 'Limited'));
    await expect(optimizeImageFromParams({ ...params, admitCacheMiss })).rejects.toMatchObject({
      code: 'resource-exhausted',
    });
    expect(admitCacheMiss).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
