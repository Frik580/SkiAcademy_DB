import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onRequest } from 'firebase-functions/v2/https';
import { getOrInitApp } from '../adminApp';
import { getAdminFirestore } from '../adminFirestore';
import { admitRequest } from './requestAdmission';
import { authorizeProtectedImage } from './protectedImageAccess';

const MAX_BYTES = 5 * 1024 * 1024;
export const handleProtectedImages: Parameters<typeof onRequest>[0] = async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  try {
    if (!['GET', 'POST'].includes(req.method)) {
      res.status(405).end();
      return;
    }
    const bearer = /^Bearer (.+)$/.exec(req.get('Authorization') ?? '');
    if (!bearer) throw new HttpsError('unauthenticated', 'Authentication required.');
    const app = getOrInitApp();
    const identity = await getAuth(app)
      .verifyIdToken(bearer[1], true)
      .catch(() => {
        throw new HttpsError('unauthenticated', 'Invalid authentication.');
      });
    const db = getAdminFirestore();
    await admitRequest(db, `protected_image_${identity.uid}`, 120);
    const writable = req.method === 'POST';
    const access = await authorizeProtectedImage(
      db,
      identity.uid,
      req.query.path,
      writable,
      req.query.testSessionId
    );
    const file = getStorage(app).bucket().file(access.path);
    if (!writable) {
      const [metadata] = await file.getMetadata();
      if (
        access.path.includes('/misc/') &&
        !access.administrator &&
        metadata.metadata?.uploaderUid !== identity.uid
      ) {
        throw new HttpsError('permission-denied', 'Not the file owner.');
      }
      const length = Number(metadata.size);
      if (
        !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(
          metadata.contentType ?? ''
        ) ||
        !Number.isSafeInteger(length) ||
        length < 1 ||
        length >= MAX_BYTES
      ) {
        throw new HttpsError('failed-precondition', 'Invalid image.');
      }
      const [bytes] = await getStorage(app)
        .bucket()
        .file(access.path, { generation: metadata.generation })
        .download({ validation: true });
      const latest = await authorizeProtectedImage(
        db,
        identity.uid,
        access.path,
        false,
        req.query.testSessionId
      );
      if (latest.path !== access.path || latest.sessionId !== access.sessionId) {
        throw new HttpsError('permission-denied', 'Image scope changed.');
      }
      res.set('Content-Type', metadata.contentType!);
      res.status(200).send(bytes);
      return;
    }
    const type = req.get('Content-Type')?.split(';')[0];
    if (
      !type ||
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type) ||
      !req.rawBody.length ||
      req.rawBody.length >= MAX_BYTES
    ) {
      throw new HttpsError('invalid-argument', 'Invalid image.');
    }
    let generation = 0;
    try {
      const [old] = await file.getMetadata();
      generation = Number(old.generation);
      // Session misc uploads cannot overwrite a different actor's file.
      if (
        access.path.includes('/misc/') &&
        !access.administrator &&
        old.metadata?.uploaderUid !== identity.uid
      ) {
        throw new HttpsError('permission-denied', 'Not the file owner.');
      }
    } catch (error) {
      if ((error as { code?: unknown }).code !== 404) throw error;
    }
    const latest = await authorizeProtectedImage(
      db,
      identity.uid,
      access.path,
      true,
      req.query.testSessionId
    );
    if (latest.path !== access.path || latest.sessionId !== access.sessionId) {
      throw new HttpsError('permission-denied', 'Image scope changed.');
    }
    await file.save(req.rawBody, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: generation },
      metadata: {
        contentType: type,
        cacheControl: 'private, no-store',
        metadata: { uploaderUid: identity.uid },
      },
    });
    res.status(201).json({ path: access.path });
  } catch (error) {
    const code = error instanceof HttpsError ? error.code : '';
    const status =
      code === 'permission-denied'
        ? 403
        : code === 'unauthenticated'
          ? 401
          : code === 'invalid-argument' || code === 'failed-precondition'
            ? 400
            : code === 'resource-exhausted'
              ? 429
              : (error as { code?: unknown }).code === 404
                ? 404
                : 500;
    res
      .status(status)
      .json({ error: status === 500 ? 'Image request failed.' : code || 'not-found' });
  }
};
export const protectedImages = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 60, maxInstances: 10 },
  handleProtectedImages
);
