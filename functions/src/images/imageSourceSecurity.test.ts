import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchImageSource, lookupPublicImageHost, MAX_SOURCE_BYTES } from './imageSource';

const { get, lookup } = vi.hoisted(() => ({ get: vi.fn(), lookup: vi.fn() }));
vi.mock('node:https', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:https')>()),
  get,
}));
vi.mock('node:dns', () => ({ lookup }));

const SOURCE = 'https://storage.yandexcloud.net/carve/a.png';
function queueResponse(statusCode: number, headers = {}, body: Buffer[] = []) {
  const response = Object.assign(Readable.from(body), { statusCode, headers });
  get.mockImplementationOnce((_url, _options, callback) => {
    queueMicrotask(() => callback(response));
    return new EventEmitter();
  });
  return response;
}
afterEach(() => vi.resetAllMocks());

describe('public image transport', () => {
  it('rejects redirects across the origin, bucket, or unsigned URL boundary', async () => {
    for (const location of [
      'https://example.com/carve/a.png',
      '/other/a.png',
      '/carve/b.png?token=fake',
    ]) {
      get.mockClear();
      queueResponse(302, { location });
      expect(await fetchImageSource(SOURCE)).toMatchObject({ ok: false, status: 502 });
      expect(get).toHaveBeenCalledTimes(1);
    }
  });

  it('checks each bounded same-bucket redirect using the same pinned lookup and deadline', async () => {
    queueResponse(302, { location: '/carve/b.png' });
    queueResponse(200, {}, [Buffer.from([1, 2, 3])]);
    expect(await fetchImageSource(SOURCE)).toEqual({
      body: Buffer.from([1, 2, 3]),
      url: 'https://storage.yandexcloud.net/carve/b.png',
    });
    expect(get.mock.calls[1][0]).toBe('https://storage.yandexcloud.net/carve/b.png');
    expect(get.mock.calls[0][1].lookup).toBe(lookupPublicImageHost);
    expect(get.mock.calls[1][1].signal).toBe(get.mock.calls[0][1].signal);

    get.mockClear();
    for (let index = 0; index < 4; index++) queueResponse(302, { location: '/carve/a.png' });
    expect(await fetchImageSource(SOURCE)).toMatchObject({ ok: false, status: 502 });
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('closes oversized responses with or without content-length and reports upstream failure', async () => {
    const declared = queueResponse(200, { 'content-length': String(MAX_SOURCE_BYTES + 1) });
    expect(await fetchImageSource(SOURCE)).toMatchObject({ status: 413 });
    expect(declared.destroyed).toBe(true);
    const chunked = queueResponse(200, {}, [Buffer.alloc(MAX_SOURCE_BYTES), Buffer.alloc(1)]);
    expect(await fetchImageSource(SOURCE)).toMatchObject({ status: 413 });
    expect(chunked.destroyed).toBe(true);
    queueResponse(404);
    expect(await fetchImageSource(SOURCE)).toMatchObject({ status: 502 });
  });

  it('passes only public IPv4 and IPv6 candidates to the TLS socket', () => {
    lookup.mockImplementation((_host, _opts, callback) =>
      callback(null, [
        { address: '10.0.0.1', family: 4 },
        { address: '127.0.0.1', family: 4 },
        { address: '169.254.169.254', family: 4 },
        { address: '::1', family: 6 },
        { address: 'fc00::1', family: 6 },
        { address: 'fe80::1', family: 6 },
        { address: '::ffff:169.254.169.254', family: 6 },
        { address: '8.8.8.8', family: 4 },
        { address: '2606:4700::1111', family: 6 },
      ])
    );
    const callback = vi.fn();
    lookupPublicImageHost('storage.yandexcloud.net', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700::1111', family: 6 },
    ]);
    lookup.mockImplementationOnce((_host, _opts, done) =>
      done(null, [{ address: '127.0.0.2', family: 4 }])
    );
    lookupPublicImageHost('storage.yandexcloud.net', {}, callback);
    expect(callback).toHaveBeenLastCalledWith(expect.any(Error), '', 0);
  });
});
