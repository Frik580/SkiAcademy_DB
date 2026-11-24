import { getAdminFirestore } from '../adminFirestore';
import { onRequest } from 'firebase-functions/v2/https';
import { admitImageCacheMiss } from './imageMissAdmission';
import { CACHE_CONTROL, optimizeImageFromParams, parseOptimizeImageQuery } from './optimizeImage';

/**
 * GET /api/img?u=<https carve url>&w=960|1920&q=72
 * Hosting rewrite caches successful responses at the edge via Cache-Control.
 */
export const optimizeImage = onRequest(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
    concurrency: 4,
    maxInstances: 10,
    cors: true,
  },
  async (req, res) => {
    // Only successful image bodies may be cached; quota/validation/upstream
    // failures must recover immediately instead of being retained by the CDN.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).set('Allow', 'GET, HEAD').send('Method Not Allowed');
      return;
    }

    const parsed = parseOptimizeImageQuery(req.query as Record<string, unknown>);
    if ('error' in parsed) {
      res.status(400).send(parsed.error);
      return;
    }

    // A first-party browser image can load the same unsigned public object
    // directly when capacity is unavailable. The function never fetches it in
    // this path. Fetch Metadata only selects the response, never admits work.
    const unavailable = (status: number, message: string, retryAfter: number) => {
      if (req.get('Sec-Fetch-Dest') === 'image' && req.get('Sec-Fetch-Site') === 'same-origin') {
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.status(307).set('Location', parsed.sourceUrl).end();
      } else {
        res.setHeader('Retry-After', String(retryAfter));
        res.status(status).send(message);
      }
    };
    try {
      const result = await optimizeImageFromParams(parsed, (key) =>
        admitImageCacheMiss(getAdminFirestore(), key)
      );
      if (!result.ok) {
        if (result.retryAfter) unavailable(result.status, result.message, result.retryAfter);
        else res.status(result.status).send(result.message);
        return;
      }

      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', CACHE_CONTROL);
      res.setHeader('X-Image-Cache', result.cacheHit ? 'HIT' : 'MISS');
      if (req.method === 'HEAD') {
        res.status(200).end();
        return;
      }
      res.status(200).send(result.body);
    } catch {
      console.error('optimizeImage cache or admission unavailable');
      unavailable(503, 'Image optimization unavailable', 5);
    }
  }
);
