import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const requireFunctions = createRequire(new URL('../functions/package.json', import.meta.url));
const { getAuth } = requireFunctions('firebase-admin/auth') as typeof import('firebase-admin/auth');
const { getFirestore } = requireFunctions(
  'firebase-admin/firestore'
) as typeof import('firebase-admin/firestore');
const { getApps, initializeApp } = requireFunctions(
  'firebase-admin/app'
) as typeof import('firebase-admin/app');
const { getStorage } = requireFunctions(
  'firebase-admin/storage'
) as typeof import('firebase-admin/storage');

const projectId = 'demo-ski-school-e2e';
test('Hosting serves security headers without applying frame denial to Firebase Auth reserved URLs', async ({
  request,
}) => {
  test.skip(
    process.env.CARVE_TEST_HOSTING !== 'true',
    'Requires local Hosting emulator and CARVE_TEST_HOSTING=true'
  );
  for (const path of ['/', '/index.html', '/courses']) {
    const response = await request.get(`http://127.0.0.1:5000${path}`);
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['content-security-policy-report-only']).toContain("object-src 'none'");
    expect(headers['content-security-policy-report-only']).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(headers['content-security-policy']).toBeUndefined();
  }
  const reserved = await request.get('http://127.0.0.1:5000/__/auth/iframe', { maxRedirects: 0 });
  expect(reserved.headers()['x-frame-options']).not.toBe('DENY');
});

test('public image rewrite preserves cached GET/HEAD and limits uncached transforms', async ({
  request,
}) => {
  test.skip(process.env.CARVE_TEST_HOSTING !== 'true', 'Requires local Hosting emulator');
  if (!process.env.FIREBASE_STORAGE_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error('Local emulators required');
  const app =
    getApps().find((item) => item.name === 'prelaunch-images') ??
    initializeApp({ projectId }, 'prelaunch-images');
  const db = getFirestore(app);
  const source = 'https://storage.yandexcloud.net/carve/prelaunch-cache-test.webp';
  const digest = createHash('sha256').update(`${source}|960|72|webp`).digest('hex');
  const file = getStorage(app)
    .bucket(`${projectId}.appspot.com`)
    .file(`image-cache/${digest}_w960_q72.webp`);
  const image = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
  const counter = db.doc('security_request_limits/image_global_misses');
  const before = await counter.get();
  await file.save(image, { resumable: false, contentType: 'image/webp' });
  try {
    // A wrong cache fixture must fail closed instead of fetching a real upstream.
    await counter.set({ count: 120, resetAt: Date.now() + 180_000 });
    const url = `http://127.0.0.1:5000/api/img?${new URLSearchParams({ u: source, w: '960', q: '72' })}`;
    const cached = await request.get(url);
    expect(cached.status()).toBe(200);
    expect(cached.headers()['x-image-cache']).toBe('HIT');
    expect(await cached.body()).toEqual(image);
    expect((await request.head(url)).status()).toBe(200);
    await counter.set({ count: 120, resetAt: Date.now() + 60_000 });
    const limited = await request.get(
      url.replace('prelaunch-cache-test.webp', 'prelaunch-uncached-test.webp')
    );
    expect(limited.status()).toBe(429);
    expect(limited.headers()['retry-after']).toBe('60');
    expect(limited.headers()['cache-control']).toContain('no-store');
    expect((await request.get(`${url}&nonce=1`)).status()).toBe(400);
  } finally {
    await file.delete();
    if (before.exists) await counter.set(before.data()!);
    else await counter.delete();
  }
});

test('real emulator Auth tokens cannot claim a guest until verified, and retries stay idempotent', async ({
  request,
}) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error('Local emulators required');
  const app =
    getApps().find((item) => item.name === 'prelaunch-auth') ??
    initializeApp({ projectId }, 'prelaunch-auth');
  const auth = getAuth(app);
  const db = getFirestore(app);
  const suffix = Date.now().toString(36);
  const email = `prelaunch-${suffix}@example.com`;
  const password = 'Local-security-test-123!';
  const response = await request.post(
    'http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',
    { data: { email, password, returnSecureToken: true } }
  );
  expect(response.ok()).toBeTruthy();
  const user = await response.json();
  const guestRef = db.doc(`users/client_prelaunch_${suffix}`);
  await guestRef.set({ email, role: 'user', displayName: 'Guest claim test', dataScope: 'live' });
  const call = (token: string) =>
    request.post(`http://127.0.0.1:5001/${projectId}/us-central1/claimGuestProfile`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { data: {} },
    });
  expect((await call(user.idToken)).status()).toBe(403);
  expect((await guestRef.get()).data()?.claimedByAccountId).toBeUndefined();
  await auth.updateUser(user.localId, { emailVerified: true });
  const signedIn = await request.post(
    'http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key',
    { data: { email, password, returnSecureToken: true } }
  );
  const verified = await signedIn.json();
  const first = await call(verified.idToken);
  expect(await first.json()).toEqual({ result: { claimed: true } });
  expect((await guestRef.get()).data()?.claimedByAccountId).toBe(user.localId);
  expect((await call(verified.idToken)).status()).toBe(200);
  await auth.updateUser(user.localId, {
    email: `changed-${suffix}@example.com`,
    emailVerified: false,
  });
  expect((await call(verified.idToken)).status()).toBe(403);
});

test('guest failed requests are time-limited before canonical parsing', async ({ request }) => {
  const url = `http://127.0.0.1:5001/${projectId}/us-central1/executeGuestCanonicalCommand`;
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await request.post(url, {
      headers: { 'x-forwarded-for': '2001:db8:ffff::19' },
      data: { data: {} },
    });
    expect(response.status()).toBe(400);
  }
  // A valid Firebase Auth identity must not bypass a guest endpoint's network quota.
  const signup = await request.post(
    'http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key',
    {
      data: {
        email: `quota-${Date.now()}@example.com`,
        password: 'Local-quota-test-123!',
        returnSecureToken: true,
      },
    }
  );
  const signedUp = await signup.json();
  const limited = await request.post(url, {
    headers: {
      'x-forwarded-for': '2001:db8:ffff::19',
      Authorization: `Bearer ${signedUp.idToken}`,
    },
    data: { data: {} },
  });
  expect(limited.status()).toBe(429);
  expect((await limited.json()).error.status).toBe('RESOURCE_EXHAUSTED');
});

test('an exhausted callable budget does not starve a different public operation', async ({
  request,
}) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Local emulator required');
  const app =
    getApps().find((item) => item.name === 'prelaunch-quota-isolation') ??
    initializeApp({ projectId }, 'prelaunch-quota-isolation');
  const db = getFirestore(app);
  const { requestPrincipalKey } = requireFunctions('./lib/security/requestAdmission') as {
    requestPrincipalKey: (request: unknown, secret: string) => string;
  };
  const headers = { 'x-forwarded-for': '2001:db8:ffff::20' };
  const principal = requestPrincipalKey(
    { rawRequest: { headers } },
    'e2e-guest-action-token-secret'
  );
  const counter = db.doc(
    `security_request_limits/callable_queryInstructorReviewReadModels_${principal}`
  );
  const before = await counter.get();
  try {
    await counter.set({ count: 300, resetAt: Date.now() + 60_000 });
    const base = `http://127.0.0.1:5001/${projectId}/us-central1`;
    expect(
      (
        await request.post(`${base}/queryInstructorReviewReadModels`, {
          headers,
          data: { data: {} },
        })
      ).status()
    ).toBe(429);
    const other = await request.post(`${base}/queryCourseCatalogReadModels`, {
      headers,
      data: { data: { scope: 'public' } },
    });
    expect(other.status(), await other.text()).toBe(200);
    expect((await other.json()).result.scope).toBe('public');
  } finally {
    if (before.exists) await counter.set(before.data()!);
    else await counter.delete();
  }
});
