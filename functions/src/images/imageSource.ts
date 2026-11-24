import { lookup } from 'node:dns';
import { Agent, get } from 'node:https';
import { BlockList, type LookupFunction } from 'node:net';
import type { IncomingMessage } from 'node:http';

export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export type ImageFailure = { ok: false; status: number; message: string; retryAfter?: number };
export type ImageSource = { body: Buffer; url: string };

const SOURCE_ORIGIN = 'https://storage.yandexcloud.net';

/** Only unsigned, anonymous Carve bucket URLs may enter the public cache. */
export function canonicalImageSource(rawUrl: string): string | undefined {
  if (rawUrl.length > 4096) return undefined;
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== 'https:' ||
      url.origin !== SOURCE_ORIGIN ||
      url.username ||
      url.password ||
      /[?#]/.test(url.href)
    ) {
      return undefined;
    }
    if (!url.pathname.startsWith('/carve/')) return undefined;

    // Yandex's S3 endpoint addresses the object by its decoded key. Encode it once
    // and reject ambiguous path segments before using it in the cache or on the wire.
    const path = decodeURIComponent(url.pathname);
    // eslint-disable-next-line no-control-regex -- Decoded control characters are invalid in URL paths.
    if (/[\\\u0000-\u001f\u007f]/u.test(path)) return undefined;
    const segments = path.split('/');
    if (segments.some((segment) => segment === '.' || segment === '..')) return undefined;
    const canonicalPath = segments.map(encodeURIComponent).join('/');
    if (canonicalPath === '/carve/' || canonicalPath.length > 1024) return undefined;
    return SOURCE_ORIGIN + canonicalPath;
  } catch {
    return undefined;
  }
}

const nonPublic = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) {
  nonPublic.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const) {
  nonPublic.addSubnet(address, prefix, 'ipv6');
}
const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');

// The socket uses this DNS result directly. HTTPS still verifies the original
// hostname, and the lookup runs again on every new connection.
export const lookupPublicImageHost: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { family: options.family, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0);
    const allowed = addresses.filter(({ address, family }) =>
      family === 4
        ? !nonPublic.check(address, 'ipv4')
        : globalIpv6.check(address, 'ipv6') && !nonPublic.check(address, 'ipv6')
    );
    if (!allowed.length) return callback(new Error('Image source has no public address'), '', 0);
    if (options.all) return callback(null, allowed);
    callback(null, allowed[0].address, allowed[0].family);
  });
};

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const sourceAgent = new Agent({ keepAlive: true });
const upstreamError = (): ImageFailure => ({
  ok: false,
  status: 502,
  message: 'Upstream image unavailable',
});

export async function fetchImageSource(sourceUrl: string): Promise<ImageSource | ImageFailure> {
  const signal = AbortSignal.timeout(10_000);
  let url = canonicalImageSource(sourceUrl);
  try {
    for (let redirects = 0; url && redirects <= 3; redirects++) {
      const requestUrl = url;
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        get(
          requestUrl,
          {
            agent: sourceAgent,
            signal,
            lookup: lookupPublicImageHost,
            headers: { Accept: 'image/*' },
          },
          resolve
        ).once('error', reject);
      });
      const status = response.statusCode ?? 0;
      if (redirectStatuses.has(status)) {
        const location = response.headers.location;
        response.destroy();
        url =
          location && redirects < 3 ? canonicalImageSource(new URL(location, url).href) : undefined;
        continue;
      }
      if (status !== 200) {
        response.destroy();
        return upstreamError();
      }
      const tooLarge: ImageFailure = { ok: false, status: 413, message: 'Source image too large' };
      if (Number(response.headers['content-length']) > MAX_SOURCE_BYTES) {
        response.destroy();
        return tooLarge;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response as AsyncIterable<Buffer>) {
        size += chunk.length;
        if (size > MAX_SOURCE_BYTES) return tooLarge;
        chunks.push(chunk);
      }
      return { body: Buffer.concat(chunks, size), url: requestUrl };
    }
  } catch {
    return upstreamError();
  }
  return upstreamError();
}
