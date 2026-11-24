import { app, auth, firebaseEmulatorConfig } from '../../infrastructure/firebase';
import { MediaUploadLimitError, readMediaUploadLimit } from '../../lib/mediaUploadError';

const CHUNK_SIZE = 8 * 1024 * 1024;
const marker = 'chat-media:';

/** Mirrors the server allowlist so unsupported files fail before any upload. */
const MEDIA_LIMITS = new Map<string, number>([
  ['image/jpeg', 5 * 1024 * 1024],
  ['image/png', 5 * 1024 * 1024],
  ['image/webp', 5 * 1024 * 1024],
  ['video/mp4', 50 * 1024 * 1024],
  ['video/webm', 50 * 1024 * 1024],
]);

export function isSupportedChatMediaType(type: string): boolean {
  return MEDIA_LIMITS.has(type);
}

export function chatMediaPath(value: string): string {
  if (value.startsWith(marker)) return value.slice(marker.length);
  // Historical Firebase token URLs are resolved to a path, never fetched directly.
  const url = new URL(value);
  const match = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(url.pathname);
  if (
    url.hostname !== 'firebasestorage.googleapis.com' ||
    !match ||
    decodeURIComponent(match[1]) !== app.options.storageBucket
  )
    throw new Error('Invalid chat attachment');
  return decodeURIComponent(match[2]);
}

async function requestMedia(
  path: string,
  query: Record<string, string> = {},
  body?: Blob,
  method = 'GET',
  signal?: AbortSignal
) {
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  const region = import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';
  const base = firebaseEmulatorConfig.useEmulators
    ? `http://${firebaseEmulatorConfig.host}:${firebaseEmulatorConfig.ports.functions}/${app.options.projectId}/${region}/bookingChatMedia`
    : `https://${region}-${app.options.projectId}.cloudfunctions.net/bookingChatMedia`;
  const response = await fetch(`${base}?${new URLSearchParams({ path, ...query })}`, {
    method,
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/octet-stream',
    },
    body,
    cache: 'no-store',
    signal,
  });
  if (response.status === 429 && method === 'POST') throw await readMediaUploadLimit(response);
  if (!response.ok) throw new Error(`Chat media access failed (${response.status})`);
  return response;
}

export async function uploadChatMedia(
  blob: Blob,
  path: string,
  uploadId: string = crypto.randomUUID(),
  resume = false
) {
  const limit = MEDIA_LIMITS.get(blob.type) ?? 0;
  if (!limit || !blob.size || blob.size >= limit)
    throw new Error('Invalid chat media format or size');
  const count = Math.ceil(blob.size / CHUNK_SIZE);
  const finishQuery = { op: 'finish', uploadId, count: String(count), type: blob.type };
  if (resume && path.startsWith('chat/')) {
    const status = await requestMedia(
      path,
      { ...finishQuery, checkOnly: 'true' },
      undefined,
      'POST'
    );
    if (status.status === 201) return `${marker}${path}`;
  }
  try {
    for (let index = 0; index < count; index++) {
      const sendChunk = () =>
        requestMedia(
          path,
          {
            op: 'chunk',
            uploadId,
            index: String(index),
            ...(resume ? { resume: 'true', count: finishQuery.count, type: blob.type } : {}),
          },
          blob.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
          'POST'
        );
      const response = await sendChunk().catch((error: unknown) => {
        if (path.startsWith('chat/') && error instanceof TypeError) return sendChunk();
        throw error;
      });
      if (resume && response.status === 201) return `${marker}${path}`;
    }
    const finish = () => requestMedia(path, finishQuery, undefined, 'POST');
    // The same upload identity lets the server recover a committed response lost in transit.
    await finish().catch((error: unknown) => {
      if (error instanceof MediaUploadLimitError) throw error;
      return finish();
    });
    return `${marker}${path}`;
  } catch (error) {
    await requestMedia(path, { uploadId }, undefined, 'DELETE').catch(() => undefined);
    throw error;
  }
}

export async function downloadChatMedia(value: string, signal?: AbortSignal) {
  const path = chatMediaPath(value);
  const first = await requestMedia(path, { index: '0' }, undefined, 'GET', signal);
  const size = Number(first.headers.get('X-Media-Size'));
  if (!Number.isInteger(size) || size <= 0 || size >= 50 * 1024 * 1024)
    throw new Error('Invalid media size');
  const parts = [await first.blob()];
  for (let index = 1; index < Math.ceil(size / CHUNK_SIZE); index++) {
    parts.push(
      await (await requestMedia(path, { index: String(index) }, undefined, 'GET', signal)).blob()
    );
  }
  return new Blob(parts, { type: first.headers.get('Content-Type') || 'application/octet-stream' });
}
