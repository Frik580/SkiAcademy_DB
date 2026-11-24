import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Writable } from 'node:stream';
import sharp from 'sharp';
import { optimizeImageFromParams } from './optimizeImage';

const mocks = vi.hoisted(() => ({
  download: vi.fn(),
  createWriteStream: vi.fn(),
  write: vi.fn(),
  file: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ file: mocks.file }) }),
}));
vi.mock('../adminApp', () => ({ getOrInitApp: vi.fn() }));
vi.mock('./imageSource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./imageSource')>()),
  fetchImageSource: mocks.fetch,
}));

const params = { sourceUrl: 'https://storage.yandexcloud.net/carve/a.png', width: 960 };
const admit = vi.fn(async () => ({ status: 'admitted' as const, until: Date.now() + 65_000 }));
const error = (code: number) => Object.assign(new Error('Storage error'), { code });
const upstream = (body: Buffer, url = params.sourceUrl) => ({ body, url });
const upload = (failure?: Error) =>
  new Writable({
    write(body: Buffer, _encoding, callback) {
      mocks.write(body);
      callback(failure);
    },
  });
let source: Buffer;
beforeEach(async () => {
  mocks.file.mockReturnValue(mocks);
  mocks.download.mockRejectedValue(error(404));
  mocks.createWriteStream.mockImplementation(() => upload());
  source = await sharp({
    create: { width: 16, height: 8, channels: 3, background: '#336699' },
  })
    .png()
    .toBuffer();
  mocks.fetch.mockResolvedValue(upstream(source));
});
afterEach(() => vi.resetAllMocks());

describe('public image cache and processing', () => {
  it('downloads a hit once without a Firestore operation or source fetch', async () => {
    mocks.download.mockResolvedValue([Buffer.from('cached-image')]);
    expect(await optimizeImageFromParams(params, admit)).toMatchObject({
      ok: true,
      cacheHit: true,
    });
    expect(mocks.download).toHaveBeenCalledTimes(1);
    expect(admit).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('coalesces concurrent hits and misses for the same cache path and conditionally publishes WebP', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => optimizeImageFromParams(params, admit))
    );
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toMatchObject({ ok: true, cacheHit: false });
    expect(mocks.file.mock.calls[0][0]).toMatch(/^image-cache\/[a-f0-9]{64}_w960_q72\.webp$/);
    expect(admit).toHaveBeenCalledWith(mocks.file.mock.calls[0][0]);
    for (const work of [admit, mocks.fetch, mocks.download, mocks.createWriteStream]) {
      expect(work).toHaveBeenCalledTimes(1);
    }
    const [[body]] = mocks.write.mock.calls;
    expect(mocks.createWriteStream).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 5_000,
        preconditionOpts: { ifGenerationMatch: 0 },
      })
    );
    expect(await sharp(body).metadata()).toMatchObject({ format: 'webp', width: 16, height: 8 });
  });

  it('allows cached work during one transform and declines additional expensive work locally', async () => {
    let done!: (image: ReturnType<typeof upstream>) => void;
    let started!: () => void;
    const fetching = new Promise<void>((resolve) => {
      started = resolve;
    });
    mocks.fetch.mockImplementationOnce(() => {
      started();
      return new Promise((resolve) => {
        done = resolve;
      });
    });
    const first = optimizeImageFromParams(params, admit);
    await fetching;
    try {
      await expect(
        optimizeImageFromParams({ ...params, width: 480 }, admit)
      ).resolves.toMatchObject({ status: 503, retryAfter: 1 });
      mocks.download.mockResolvedValueOnce([Buffer.from('cached other variant')]);
      await expect(
        optimizeImageFromParams({ ...params, width: 1280 }, admit)
      ).resolves.toMatchObject({ ok: true, cacheHit: true });
      expect(admit).toHaveBeenCalledTimes(1);
    } finally {
      done(upstream(source));
      await first;
    }
    await expect(optimizeImageFromParams({ ...params, width: 480 }, admit)).resolves.toMatchObject({
      ok: true,
      cacheHit: false,
    });
  });

  it('checks the global quota and the cross-instance lease before fetching', async () => {
    const quota = async () => ({ status: 'quota-full' as const, until: Date.now() + 60_000 });
    const leased = async () => ({ status: 'in-flight' as const, until: Date.now() + 65_000 });
    expect(await optimizeImageFromParams(params, quota)).toMatchObject({ status: 429 });
    expect(await optimizeImageFromParams(params, leased)).toMatchObject({ status: 503 });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('fails closed on Firestore or Storage errors, with no stuck local work', async () => {
    mocks.download.mockRejectedValueOnce(error(403));
    await expect(optimizeImageFromParams(params, admit)).rejects.toMatchObject({ code: 403 });
    expect(admit).not.toHaveBeenCalled();
    admit.mockRejectedValueOnce(new Error('Firestore unavailable'));
    await expect(optimizeImageFromParams(params, admit)).rejects.toThrow('Firestore unavailable');
    expect(mocks.fetch).not.toHaveBeenCalled();
    mocks.createWriteStream.mockImplementationOnce(() => upload(error(503)));
    await expect(optimizeImageFromParams(params, admit)).rejects.toMatchObject({ code: 503 });
    await expect(optimizeImageFromParams(params, admit)).resolves.toMatchObject({ ok: true });
  });

  it('returns the existing generation after a conditional-write conflict', async () => {
    mocks.download.mockRejectedValueOnce(error(404)).mockResolvedValueOnce([Buffer.from('winner')]);
    mocks.createWriteStream.mockImplementationOnce(() => upload(error(412)));
    expect(await optimizeImageFromParams(params, admit)).toEqual({
      ok: true,
      body: Buffer.from('winner'),
      cacheHit: true,
    });
  });

  it('rejects unavailable, mislabeled, invalid and oversized-pixel sources without publishing', async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 502, message: 'Unavailable' });
    expect(await optimizeImageFromParams(params, admit)).toMatchObject({ status: 502 });
    mocks.fetch.mockResolvedValueOnce(
      upstream(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))
    );
    expect(await optimizeImageFromParams(params, admit)).toMatchObject({ status: 415 });
    mocks.fetch.mockResolvedValueOnce(upstream(source.subarray(0, 12)));
    expect(await optimizeImageFromParams(params, admit)).toMatchObject({ status: 422 });

    const oversized = await sharp({
      create: { width: 6400, height: 6400, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    mocks.fetch.mockResolvedValueOnce(upstream(oversized));
    expect(await optimizeImageFromParams(params, admit)).toMatchObject({ status: 422 });
    expect(mocks.createWriteStream).not.toHaveBeenCalled();
    await expect(optimizeImageFromParams(params, admit)).resolves.toMatchObject({ ok: true });
  });

  it('renders safe redirects without publishing another variant of the final object', async () => {
    mocks.fetch.mockResolvedValueOnce(upstream(source, params.sourceUrl.replace('a.png', 'b.png')));
    expect(await optimizeImageFromParams(params, admit)).toMatchObject({
      ok: true,
      cacheHit: false,
    });
    expect(mocks.createWriteStream).not.toHaveBeenCalled();
  });
});
