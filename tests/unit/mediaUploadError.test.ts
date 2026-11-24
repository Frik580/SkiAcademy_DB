import { describe, expect, it } from 'vitest';
import {
  formatMediaUploadLimit,
  readMediaUploadLimit,
} from '../../src/lib/mediaUploadError';

describe('media upload quota presentation', () => {
  it('shows the quota and a known retry time in Russian and English', async () => {
    const retryAt = Date.now() + 60_000;
    const response = new Response(JSON.stringify({ quota: { reason: 'bytes', retryAt } }));
    const error = await readMediaUploadLimit(response);
    expect(formatMediaUploadLimit(error, 'ru')).toContain('Повторите попытку в');
    expect(formatMediaUploadLimit(error, 'en')).toMatch(/hourly upload size limit.*Try again at/);
  });

  it('does not invent a retry time for a concurrent request or a generic 429', async () => {
    const busy = await readMediaUploadLimit(
      new Response(JSON.stringify({ quota: { reason: 'busy' } }))
    );
    const generic = await readMediaUploadLimit(new Response('busy', { status: 429 }));
    expect(formatMediaUploadLimit(busy, 'en')).toBe(
      'An upload is already in progress. Try again when it finishes.'
    );
    expect(formatMediaUploadLimit(generic, 'en')).toBe(
      'Too many media requests. Try again shortly.'
    );
  });
});
