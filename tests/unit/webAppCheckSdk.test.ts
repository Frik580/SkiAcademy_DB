// @vitest-environment jsdom
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initializeWebAppCheck } from '../../src/infrastructure/firebase/webAppCheck';

let app: FirebaseApp;
const exchange = vi.fn();
const callable = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('MODE', 'staging');
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false');
  vi.stubEnv('VITE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY', 'synthetic-site-key');
  vi.stubGlobal('location', { hostname: 'ski-school-staging.web.app' });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, options: RequestInit) => {
      if (url.startsWith('https://content-firebaseappcheck.googleapis.com/'))
        return exchange(options);
      if (url === 'https://us-central1-ski-school-staging.cloudfunctions.net/testCallable') {
        return callable(options);
      }
      throw new Error('Unexpected SDK network request.');
    })
  );
  callable.mockImplementation(async () => Response.json({ result: 'ok' }));
  app = initializeApp(
    { projectId: 'ski-school-staging', appId: 'synthetic-app-id', apiKey: 'synthetic-api-key' },
    crypto.randomUUID()
  );
});

afterEach(async () => {
  await deleteApp(app);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

function invokeCallable() {
  return httpsCallable(getFunctions(app), 'testCallable')({});
}

it('caches the first token across callables and proactively refreshes it with the Firebase SDK', async () => {
  vi.stubGlobal('grecaptcha', {
    enterprise: {
      ready: (callback: () => void) => callback(),
      render: (_container: string, options: { callback(): void }) => {
        options.callback();
        return 1;
      },
      execute: async () => 'synthetic-attestation',
    },
  });
  exchange
    .mockResolvedValueOnce(Response.json({ token: 'synthetic-first-token', ttl: '3600s' }))
    .mockResolvedValueOnce(Response.json({ token: 'synthetic-refreshed-token', ttl: '3600s' }));

  initializeWebAppCheck(app);
  await vi.advanceTimersByTimeAsync(1);
  await expect(invokeCallable()).resolves.toMatchObject({ data: 'ok' });
  await expect(invokeCallable()).resolves.toMatchObject({ data: 'ok' });
  expect(exchange).toHaveBeenCalledTimes(1);
  expect(new Headers(callable.mock.calls[1][0].headers).get('X-Firebase-AppCheck')).toBe(
    'synthetic-first-token'
  );

  await vi.advanceTimersByTimeAsync(36 * 60_000);
  expect(exchange).toHaveBeenCalledTimes(2);
  await expect(invokeCallable()).resolves.toMatchObject({ data: 'ok' });
  expect(new Headers(callable.mock.calls[2][0].headers).get('X-Firebase-AppCheck')).toBe(
    'synthetic-refreshed-token'
  );
});

it('sends a callable without an App Check header when the browser blocks the provider script', async () => {
  vi.stubGlobal('grecaptcha', undefined);
  initializeWebAppCheck(app);
  const pending = invokeCallable();

  await vi.advanceTimersByTimeAsync(5_001);
  await expect(pending).resolves.toMatchObject({ data: 'ok' });
  expect(exchange).not.toHaveBeenCalled();
  expect(new Headers(callable.mock.calls[0][0].headers).has('X-Firebase-AppCheck')).toBe(false);
});
