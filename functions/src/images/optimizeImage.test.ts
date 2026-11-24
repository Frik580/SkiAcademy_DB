import { describe, expect, it } from 'vitest';
import { parseOptimizeImageQuery } from './optimizeImage';

const u = 'https://storage.yandexcloud.net/carve/images/café.jpg';

describe('public image variants', () => {
  it('supports the production navigation and responsive widths, with the existing defaults', () => {
    expect(parseOptimizeImageQuery({ u })).toEqual({
      sourceUrl: 'https://storage.yandexcloud.net/carve/images/caf%C3%A9.jpg',
      width: 1920,
    });
    for (const width of [480, 960, 1280, 1920]) {
      expect(parseOptimizeImageQuery({ u, w: String(width), q: '72' })).toHaveProperty(
        'width',
        width
      );
    }
  });

  it('maps all 204 legacy width/quality pairs to exactly four variants', () => {
    const variants = new Set<string>();
    for (const width of [480, 960, 1280, 1920]) {
      for (let q = 40; q <= 90; q++) {
        const parsed = parseOptimizeImageQuery({ u, w: `0${width}`, q: `0${q}` });
        expect(parsed).not.toHaveProperty('error');
        variants.add(JSON.stringify(parsed));
      }
    }
    expect(variants.size).toBe(4);
    expect(
      parseOptimizeImageQuery({
        u: 'https://STORAGE.YANDEXCLOUD.NET:443/carve/%69mages%2Fcaf%c3%a9.jpg',
        w: '00960',
        q: '090',
      })
    ).toEqual(parseOptimizeImageQuery({ u, w: '960' }));
    expect(parseOptimizeImageQuery({ u })).not.toEqual(
      parseOptimizeImageQuery({ u: u.replace('café', 'Café') })
    );
  });

  it('rejects unsupported and ambiguous inputs before reading the cache', () => {
    for (const args of [
      { w: '320' },
      { w: '960junk' },
      { w: ['960'] },
      { w: '1e3' },
      { w: '960.0' },
      { q: '39' },
      { q: '91' },
      { q: '72.5' },
      { q: ['72'] },
      { q: '' },
      { h: '360' },
      { format: 'png' },
      { nonce: '1' },
    ]) {
      expect(parseOptimizeImageQuery({ u, ...args })).toHaveProperty('error');
    }
    expect(parseOptimizeImageQuery({})).toEqual({ error: 'Missing u parameter' });
  });

  it('isolates private and signed sources from the unsigned public cache', () => {
    for (const url of [
      `${u}?nonce=1`,
      `${u}?`,
      `${u}#v`,
      `${u}#`,
      `${u}?X-Amz-Signature=fake`,
      'https://firebasestorage.googleapis.com/v0/b/example/o/chat.jpg?token=fake',
      'https://storage.yandexcloud.net/other/wall.webp',
      'https://evil.example/carve/wall.webp',
      'http://storage.yandexcloud.net/carve/wall.webp',
      'https://user:pass@storage.yandexcloud.net/carve/wall.webp',
      'https://storage.yandexcloud.net:8443/carve/wall.webp',
      'https://storage.yandexcloud.net/carve/a%2F..%2F..%2Fb.jpg',
      'https://storage.yandexcloud.net/carve/a%5Cb.jpg',
    ]) {
      expect(parseOptimizeImageQuery({ u: url })).toHaveProperty('error');
    }
  });
});
