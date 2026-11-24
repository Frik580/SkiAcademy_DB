import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FirebaseApp } from 'firebase/app';
import { initializeWebAppCheck } from '../../src/infrastructure/firebase/webAppCheck';

const { initialize, requestToken, siteKey } = vi.hoisted(() => ({
  initialize: vi.fn(),
  requestToken: vi.fn(),
  siteKey: vi.fn(),
}));

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: initialize,
  ReCaptchaEnterpriseProvider: class {
    constructor(key: string) {
      siteKey(key);
    }

    getToken(limitedUse: boolean) {
      return requestToken(limitedUse);
    }
  },
}));

const staging = 'ski-school-staging';
const production = 'ski-school-8f3ca';
const keyEnv = 'VITE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY';

function firebaseApp(projectId = staging): FirebaseApp {
  return { options: { projectId } } as FirebaseApp;
}

beforeEach(() => {
  vi.stubGlobal('location', { hostname: 'ski-school-staging.web.app' });
  vi.stubEnv('MODE', 'staging');
  vi.stubEnv('DEV', false);
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false');
  vi.stubEnv(keyEnv, 'staging-public-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe('App Check rollout', () => {
  it('initializes once per Firebase app and delegates automatic refresh to the SDK', () => {
    const app = firebaseApp();
    initializeWebAppCheck(app);
    initializeWebAppCheck(app);

    expect(siteKey).toHaveBeenCalledExactlyOnceWith('staging-public-key');
    expect(initialize).toHaveBeenCalledExactlyOnceWith(
      app,
      expect.objectContaining({ isTokenAutoRefreshEnabled: true })
    );
    expect(requestToken).not.toHaveBeenCalled();
  });

  it.each(['', '   ', undefined])('skips absent keys (%j)', (value) => {
    vi.stubEnv(keyEnv, value);
    initializeWebAppCheck(firebaseApp());
    expect(initialize).not.toHaveBeenCalled();
  });

  it('skips malformed site keys without logging their contents', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv(keyEnv, 'invalid key with spaces');
    initializeWebAppCheck(firebaseApp());

    expect(initialize).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith('App Check site key has an invalid format.');
  });

  it.each([
    ['staging', production],
    ['production', staging],
    ['production', 'demo-project'],
    ['test', staging],
    ['e2e', staging],
  ])('skips mode %s with project %s', (mode, projectId) => {
    vi.stubEnv('MODE', mode);
    initializeWebAppCheck(firebaseApp(projectId));
    expect(initialize).not.toHaveBeenCalled();
  });

  it('uses the production build key for the production project', () => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv(keyEnv, 'production-public-key');
    initializeWebAppCheck(firebaseApp(production));
    expect(siteKey).toHaveBeenCalledExactlyOnceWith('production-public-key');
  });

  it('skips local dev and emulator clients even when a key is configured', () => {
    vi.stubEnv('DEV', true);
    initializeWebAppCheck(firebaseApp());
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    initializeWebAppCheck(firebaseApp());
    expect(initialize).not.toHaveBeenCalled();
  });

  it('skips local previews of a configured staging build', () => {
    vi.stubGlobal('location', { hostname: '127.0.0.1' });
    initializeWebAppCheck(firebaseApp());
    expect(initialize).not.toHaveBeenCalled();
  });

  it.each([true, 'synthetic-debug-flag'])(
    'refuses the Firebase debug flag %j in production',
    (flag) => {
      vi.stubEnv('MODE', 'production');
      vi.stubGlobal('FIREBASE_APPCHECK_DEBUG_TOKEN', flag);
      initializeWebAppCheck(firebaseApp(production));
      expect(initialize).not.toHaveBeenCalled();
    }
  );

  it('survives a synchronous initialization error without retrying or logging its contents', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    initialize.mockImplementation(() => {
      throw new Error('simulated failure');
    });
    const app = firebaseApp();

    expect(() => initializeWebAppCheck(app)).not.toThrow();
    initializeWebAppCheck(app);

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledExactlyOnceWith('App Check initialization failed.');
  });

  function providerFromSdk() {
    initializeWebAppCheck(firebaseApp());
    return initialize.mock.calls[0][1].provider as { getToken(): Promise<unknown> };
  }

  it('forwards token errors and allows the next SDK refresh to recover', async () => {
    const token = { token: 'synthetic-app-check-token' };
    requestToken.mockRejectedValueOnce(new Error('provider unavailable')).mockResolvedValue(token);
    const provider = providerFromSdk();

    await expect(provider.getToken()).rejects.toThrow('provider unavailable');
    await expect(provider.getToken()).resolves.toBe(token);
    expect(requestToken).toHaveBeenCalledTimes(2);
  });

  it('bounds a stalled token request without starting duplicate provider work', async () => {
    vi.useFakeTimers();
    const token = { token: 'synthetic-app-check-token', expireTimeMillis: Date.now() + 3_600_000 };
    let finishRequest!: (value: typeof token) => void;
    requestToken
      .mockReturnValueOnce(new Promise<typeof token>((resolve) => (finishRequest = resolve)))
      .mockResolvedValue(token);
    const provider = providerFromSdk();
    const pending = provider.getToken();

    expect(provider.getToken()).toBe(pending);
    const timedOut = expect(pending).rejects.toThrow('App Check token timed out.');
    await vi.advanceTimersByTimeAsync(5_000);
    await timedOut;
    await expect(provider.getToken()).rejects.toThrow('App Check token timed out.');
    expect(requestToken).toHaveBeenCalledTimes(1);

    finishRequest(token);
    await vi.advanceTimersByTimeAsync(0);
    await expect(provider.getToken()).resolves.toBe(token);
    expect(requestToken).toHaveBeenCalledTimes(1);
  });
});
