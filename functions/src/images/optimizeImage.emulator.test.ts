import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import sharp from 'sharp';
import { admitImageCacheMiss } from './imageMissAdmission';
import { optimizeImageFromParams } from './optimizeImage';
import { getOrInitApp } from '../adminApp';

const fetchSource = vi.hoisted(() => vi.fn());
vi.mock('./imageSource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./imageSource')>()),
  fetchImageSource: fetchSource,
}));

const projectId = 'demo-ski-school-e2e';
const bucketName = `${projectId}.appspot.com`;
const sourceUrl = 'https://storage.yandexcloud.net/carve/proxy-emulator.webp';
const digest = createHash('sha256').update(`${sourceUrl}|960|72|webp`).digest('hex');
const cachePath = `image-cache/${digest}_w960_q72.webp`;
const counterPath = 'security_request_limits/image_global_misses';
let app: ReturnType<typeof getOrInitApp>;
let savedCounter: FirebaseFirestore.DocumentData | undefined;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error('Local Firestore and Storage emulators required');
  }
  app = initializeApp({ projectId, storageBucket: bucketName });
});
beforeEach(async () => {
  const counter = getFirestore(app).doc(counterPath);
  savedCounter = (await counter.get()).data();
  await counter.delete();
});
afterEach(async () => {
  const counter = getFirestore(app).doc(counterPath);
  if (savedCounter) await counter.set(savedCounter);
  else await counter.delete();
  await getStorage(app).bucket().file(cachePath).delete({ ignoreNotFound: true });
  fetchSource.mockReset();
});
afterAll(async () => {
  if (app) await deleteApp(app);
});

describe('public optimizer with real Firestore and Storage', () => {
  it('charges one miss, publishes WebP to Storage, and serves the hit without a quota call', async () => {
    const db = getFirestore(app);
    const jpeg = await sharp({
      create: { width: 48, height: 16, channels: 3, background: '#aaccee' },
    })
      .jpeg()
      .toBuffer();
    fetchSource.mockResolvedValue({ body: jpeg, url: sourceUrl });
    const admit = vi.fn((key: string) => admitImageCacheMiss(db, key));
    const params = { sourceUrl, width: 960 };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => optimizeImageFromParams(params, admit))
    );
    expect(results.every((result) => result.ok && !result.cacheHit)).toBe(true);
    expect(admit).toHaveBeenCalledTimes(1);
    expect(fetchSource).toHaveBeenCalledTimes(1);
    const [stored] = await getStorage(app).bucket().file(cachePath).download();
    expect(await sharp(stored).metadata()).toMatchObject({ width: 48, height: 16, format: 'webp' });
    expect(await optimizeImageFromParams(params, admit)).toEqual({
      ok: true,
      cacheHit: true,
      body: stored,
    });
    expect(admit).toHaveBeenCalledTimes(1);
    expect((await db.doc(counterPath).get()).get('count')).toBe(1);
  });

  it('serializes independent contenders for one key, allows another key, and recovers after expiry', async () => {
    const db = getFirestore(app);
    const counter = db.doc(counterPath);
    const admissions = await Promise.all(
      Array.from({ length: 5 }, () => admitImageCacheMiss(db, cachePath))
    );
    expect(admissions.filter(({ status }) => status === 'admitted')).toHaveLength(1);
    expect(admissions.filter(({ status }) => status === 'in-flight')).toHaveLength(4);
    const otherKey = cachePath.replace('w960', 'w1920');
    expect(await admitImageCacheMiss(db, otherKey)).toHaveProperty('status', 'admitted');
    const snapshot = await counter.get();
    expect(snapshot.get('count')).toBe(2);

    // A failed generation leaves the lease until its bounded expiration.
    await counter.set({ ...snapshot.data(), leases: { [cachePath]: Date.now() - 1 } });
    expect(await admitImageCacheMiss(db, cachePath)).toHaveProperty('status', 'admitted');
    expect((await counter.get()).get('count')).toBe(3);
  });

  it('keeps the existing counter contract and admits only the remaining global slot', async () => {
    const db = getFirestore(app);
    const counter = db.doc(counterPath);
    await counter.set({ count: 119, resetAt: Date.now() + 30_000 });
    const outcomes = await Promise.all([
      admitImageCacheMiss(db, cachePath),
      admitImageCacheMiss(db, cachePath.replace('w960', 'w480')),
    ]);
    expect(outcomes.map(({ status }) => status).sort()).toEqual(['admitted', 'quota-full']);
    expect((await counter.get()).get('count')).toBe(120);
  });
});
