import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onRequest } from 'firebase-functions/v2/https';
import { getOrInitApp } from '../adminApp';
import { getAdminFirestore } from '../adminFirestore';
import { admitRequest } from '../security/requestAdmission';
import { authorizeChatMedia, mediaSizeLimit } from './chatMediaAccess';

const CHUNK_SIZE = 8 * 1024 * 1024;
const PARTS = 7;

export const handleBookingChatMedia: Parameters<typeof onRequest>[0] = async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  try {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
      res.status(405).end();
      return;
    }
    const bearer = /^Bearer (.+)$/.exec(req.get('Authorization') ?? '');
    if (!bearer) throw new HttpsError('unauthenticated', 'Authentication required');
    const app = getOrInitApp();
    const identity = await getAuth(app)
      .verifyIdToken(bearer[1], true)
      .catch(() => {
        throw new HttpsError('unauthenticated', 'Invalid authentication');
      });
    const { uid } = identity;
    const db = getAdminFirestore();
    await admitRequest(db, `chat_media_${uid}`, 120);
    const path = await authorizeChatMedia(db, uid, req.query.path);
    const bucket = getStorage(app).bucket();
    const file = bucket.file(path.path);
    if (req.method === 'GET') {
      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType ?? '';
      if (Number(metadata.size) >= mediaSizeLimit(contentType))
        throw new HttpsError('failed-precondition', 'Invalid media size');
      const index = Number(req.query.index ?? 0);
      const size = Number(metadata.size);
      if (!Number.isInteger(index) || index < 0 || index * CHUNK_SIZE >= size)
        throw new HttpsError('invalid-argument', 'Invalid chunk');
      // Bound every HTTP body below the platform limit, including 50 MB videos.
      const [bytes] = await file.download({
        start: index * CHUNK_SIZE,
        end: Math.min(size - 1, (index + 1) * CHUNK_SIZE - 1),
      });
      res.set('X-Media-Size', String(size));
      res.set('Access-Control-Expose-Headers', 'X-Media-Size');
      res.set('Content-Type', contentType);
      res.status(200).send(bytes);
      return;
    }
    const uploadId = req.query.uploadId;
    if (typeof uploadId !== 'string' || !/^[a-f0-9-]{36}$/.test(uploadId))
      throw new HttpsError('invalid-argument', 'Invalid upload id');
    // Private temporary objects; no user supplied prefix or resumable capability.
    // One bounded upload slot per account: aborted UUIDs cannot accumulate objects.
    const prefix = path.sessionId
      ? `test-sessions/${path.sessionId}/_chat-media-uploads/${uid}/`
      : `_chat-media-uploads/${uid}/`;
    const chunks = Array.from({ length: PARTS }, (_, i) => bucket.file(`${prefix}${i}`));
    const clean = async () => {
      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const [metadata] = await chunk.getMetadata();
            if (
              metadata.metadata?.uploadId === uploadId &&
              metadata.metadata?.targetPath === path.path
            )
              await chunk.delete({
                ifGenerationMatch: Number(metadata.generation),
                ignoreNotFound: true,
              });
          } catch (error) {
            if (
              (error as { code?: number }).code !== 404 &&
              (error as { code?: number }).code !== 412
            )
              throw error;
          }
        })
      );
    };
    if (req.method === 'DELETE') {
      await clean();
      res.status(204).end();
      return;
    }
    if (req.query.op === 'chunk') {
      const index = Number(req.query.index);
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= PARTS ||
        !req.rawBody.length ||
        req.rawBody.length > CHUNK_SIZE
      )
        throw new HttpsError('invalid-argument', 'Invalid chunk');
      await chunks[index].save(req.rawBody, {
        resumable: false,
        metadata: {
          contentType: 'application/octet-stream',
          metadata: { targetPath: path.path, uploadId },
        },
      });
      res.status(204).end();
      return;
    }
    if (req.query.op !== 'finish') throw new HttpsError('invalid-argument', 'Invalid operation');
    const count = Number(req.query.count);
    const type = String(req.query.type ?? '');
    const limit = mediaSizeLimit(type);
    if (!Number.isInteger(count) || count < 1 || count > PARTS)
      throw new HttpsError('invalid-argument', 'Invalid chunk count');
    const completed = async () => {
      try {
        const [metadata] = await file.getMetadata();
        if (
          metadata.metadata?.uploadId === uploadId &&
          metadata.metadata?.uploaderUid === uid &&
          metadata.metadata?.chunkCount === String(count) &&
          metadata.contentType === type
        )
          return true;
        throw new HttpsError('already-exists', 'Media target already exists');
      } catch (error) {
        if ((error as { code?: number }).code === 404) return false;
        throw error;
      }
    };
    try {
      // A lost finish response must be recoverable after temporary parts are gone.
      if (await completed()) {
        res.status(201).json({ path: path.path });
        return;
      }
      const buffers: Buffer[] = [];
      let size = 0;
      for (let i = 0; i < count; i++) {
        const [metadata] = await chunks[i].getMetadata();
        const length = Number(metadata.size);
        if (
          metadata.metadata?.targetPath !== path.path ||
          metadata.metadata?.uploadId !== uploadId ||
          length < 1 ||
          length > CHUNK_SIZE ||
          (i < count - 1 && length !== CHUNK_SIZE) ||
          size + length >= limit
        )
          throw new HttpsError('invalid-argument', 'Invalid media size or upload target');
        const [bytes] = await bucket
          .file(chunks[i].name, { generation: metadata.generation })
          .download();
        size += bytes.length;
        if (size >= limit) throw new HttpsError('invalid-argument', 'Media too large');
        buffers.push(bytes);
      }
      // Recheck after reading chunks: revocation during upload must prevent publish.
      await authorizeChatMedia(db, uid, path.path);
      try {
        await file.save(Buffer.concat(buffers), {
          resumable: false,
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: {
            contentType: type,
            cacheControl: 'private, no-store',
            metadata: { uploadId, uploaderUid: uid, chunkCount: String(count) },
          },
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 412 || !(await completed())) throw error;
      }
      res.status(201).json({ path: path.path });
    } finally {
      // Cleanup cannot change the committed result or mask the original failure.
      await clean().catch((error: unknown) => {
        console.error('Chat media cleanup failed', {
          code: (error as { code?: unknown }).code ?? 'unknown',
        });
      });
    }
  } catch (error) {
    if (!(error instanceof HttpsError)) {
      // Keep operational failures diagnosable without logging private paths or credentials.
      console.error('Chat media request failed', {
        code: (error as { code?: unknown }).code ?? 'unknown',
      });
    }
    const code = error instanceof HttpsError ? error.code : '';
    const status =
      code === 'unauthenticated'
        ? 401
        : code === 'permission-denied'
          ? 403
          : code === 'invalid-argument' || code === 'failed-precondition'
            ? 400
            : code === 'already-exists'
              ? 409
              : code === 'resource-exhausted'
                ? 429
                : 500;
    res.status(status).json({ error: status === 500 ? 'Media request failed' : code });
  }
};

export const bookingChatMedia = onRequest(
  {
    region: 'us-central1',
    memory: '512MiB',
    concurrency: 1,
    timeoutSeconds: 120,
    maxInstances: 10,
    cors: true,
  },
  handleBookingChatMedia
);
