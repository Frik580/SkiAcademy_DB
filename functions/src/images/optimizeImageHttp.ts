import { onRequest } from 'firebase-functions/v2/https';
import {
  optimizeImageFromParams,
  parseOptimizeImageQuery,
} from './optimizeImage';

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
      const result = await optimizeImageFromParams(parsed);
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
      console.error('optimizeImage failed', err);
      res.status(500).send('Image optimization failed');
    }
  }
);
