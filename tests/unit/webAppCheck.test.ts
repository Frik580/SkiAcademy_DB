import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FirebaseApp } from 'firebase/app';
const { initialize, Provider } = vi.hoisted(() => ({ initialize: vi.fn(), Provider: vi.fn() }));
vi.mock('firebase/app-check', () => ({
  initializeAppCheck: initialize,
  ReCaptchaEnterpriseProvider: Provider,
}));
import { initializeWebAppCheck } from '../../src/infrastructure/firebase/webAppCheck';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('App Check rollout', () => {
  it('does not attest emulator or unconfigured clients', () => {
    vi.stubEnv('VITE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY', '');
    initializeWebAppCheck({} as FirebaseApp);
    vi.stubEnv('VITE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY', 'public-site-key');
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    initializeWebAppCheck({} as FirebaseApp);
    expect(initialize).not.toHaveBeenCalled();
  });
  it('initializes the environment key before service use with token refresh', () => {
    vi.stubEnv('MODE', 'staging');
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false');
    vi.stubEnv('VITE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY', 'staging-public-key');
    const app = {} as FirebaseApp;
    initializeWebAppCheck(app);
    expect(Provider).toHaveBeenCalledWith('staging-public-key');
    expect(initialize).toHaveBeenCalledWith(
      app,
      expect.objectContaining({ isTokenAutoRefreshEnabled: true })
    );
  });
});
