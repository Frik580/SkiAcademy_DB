import { HttpsError } from 'firebase-functions/v2/https';
import { admitRequest } from '../security/requestAdmission';
import { getAdminFirestore } from '../adminFirestore';
import { onRequest } from 'firebase-functions/v2/https';
import { optimizeImageFromParams, parseOptimizeImageQuery } from './optimizeImage';

/**
 * GET /api/img?u=<https carve url>&w=960|1920&q=72
 * Hosting rewrite caches successful responses at the edge via Cache-Control.
 */
export const optimizeImage = onRequest(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
    cors: true,
  },
  async (req, res) => {
    // Only successful image bodies may be cached; quota/validation/upstream
    // failures must recover immediately instead of being retained by the CDN.
    res.setHeader('Cache-Control', 'no-store');
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

    try {
      const result = await optimizeImageFromParams({
        ...parsed,
        admitCacheMiss: async () => {
          await admitRequest(getAdminFirestore(), 'image_global_misses', 120);
        },
      });
      if (!result.ok) {
        res.status(result.status).send(result.message);
        return;
      }

      res.setHeader('Content-Type', result.contentType);
      res.setHeader(
        'Cache-Control',
        'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400'
      );
      res.setHeader('X-Image-Cache', result.cacheHit ? 'HIT' : 'MISS');
      if (req.method === 'HEAD') {
        res.status(200).end();
        return;
      }
      res.status(200).send(result.body);
    } catch (err) {
      if (err instanceof HttpsError && err.code === 'resource-exhausted') {
        res.setHeader('Retry-After', '60');
        res.status(429).send('Image rate limit exceeded');
        return;
      }
      console.error('optimizeImage failed', {
        code: err instanceof HttpsError ? err.code : 'processing_error',
      });
      res.status(500).send('Image optimization failed');
    }
  }
);
