import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { fetchImageSource, MAX_SOURCE_BYTES, isAllowedImageSource } from './optimizeImage';

afterEach(() => vi.unstubAllGlobals());
describe('image source security and native codec regression', () => {
  it('rejects a redirect to another host before sending a second request', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/metadata' },
        })
      );
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchImageSource('https://storage.yandexcloud.net/carve/a.png')).toMatchObject({
      ok: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });
  it('accepts a bounded relative redirect within the catalog', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: '/carve/b.png' } })
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchImageSource('https://storage.yandexcloud.net/carve/a.png')).toEqual(
      Buffer.from([1, 2, 3])
    );
    expect(fetcher.mock.calls[1][0]).toBe('https://storage.yandexcloud.net/carve/b.png');
  });
  it('cancels a chunked oversized response without trusting content-length', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_SOURCE_BYTES));
        controller.enqueue(new Uint8Array(1));
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    expect(await fetchImageSource('https://storage.yandexcloud.net/carve/a.png')).toMatchObject({
      status: 413,
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('rejects credentials, alternate ports and redirect loops', async () => {
    expect(isAllowedImageSource('https://user:pass@storage.yandexcloud.net/carve/a.png')).toBe(
      false
    );
    expect(isAllowedImageSource('https://storage.yandexcloud.net:8443/carve/a.png')).toBe(false);
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: '/carve/a.png' } })
      );
    vi.stubGlobal('fetch', fetcher);
    expect(await fetchImageSource('https://storage.yandexcloud.net/carve/a.png')).toMatchObject({
      status: 502,
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('converts PNG and JPEG to bounded WebP using the installed native codecs', async () => {
    for (const format of ['png', 'jpeg'] as const) {
      const source = await sharp({
        create: { width: 16, height: 8, channels: 3, background: '#336699' },
      })
        .toFormat(format)
        .toBuffer();
      const result = await sharp(source, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 480, withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: 72, effort: 4 })
        .toBuffer();
      expect(await sharp(result).metadata()).toMatchObject({
        format: 'webp',
        width: 16,
        height: 8,
      });
    }
    await expect(sharp(Buffer.from('invalid')).webp().toBuffer()).rejects.toThrow();
  });
});
