import type { FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import {
  isFirebaseLoopbackHost,
  PRODUCTION_FIREBASE_PROJECT_ID,
  STAGING_FIREBASE_PROJECT_ID,
} from './firebaseEnvironmentGuard';

const initializedApps = new WeakSet<FirebaseApp>();
const TOKEN_TIMEOUT_MS = 5_000;
type EnterpriseToken = { token: string; expireTimeMillis: number; issuedAtTimeMillis: number };

// Firebase 12.16's provider hook is internal. The SDK contract test exercises it
// through httpsCallable so any incompatible Firebase upgrade fails the test.
const EnterpriseProvider = ReCaptchaEnterpriseProvider as new (
  siteKey: string
) => ReCaptchaEnterpriseProvider & {
  getToken(isLimitedUse?: boolean): Promise<EnterpriseToken>;
};

class BoundedEnterpriseProvider extends EnterpriseProvider {
  private pendingToken?: Promise<EnterpriseToken>;
  private lateToken?: EnterpriseToken;

  override getToken(isLimitedUse = false) {
    if (isLimitedUse) return this.requestToken(true);
    const lateToken = this.lateToken;
    this.lateToken = undefined;
    if (lateToken && lateToken.expireTimeMillis > Date.now()) return Promise.resolve(lateToken);
    return (this.pendingToken ??= this.requestToken(false));
  }

  private requestToken(isLimitedUse: boolean) {
    // SDK 12.16 can leave the provider pending when the browser blocks its script.
    // Keep sharing that attempt until it settles, even after callers time out.
    return new Promise<EnterpriseToken>((resolve, reject) => {
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        reject(new Error('App Check token timed out.'));
      }, TOKEN_TIMEOUT_MS);
      void super
        .getToken(isLimitedUse)
        .then((token) => {
          if (timedOut && !isLimitedUse) this.lateToken = token;
          resolve(token);
        }, reject)
        .finally(() => {
          clearTimeout(timeout);
          if (!isLimitedUse) this.pendingToken = undefined;
        });
    });
  }
}

export function initializeWebAppCheck(app: FirebaseApp): void {
  if (typeof window === 'undefined' || import.meta.env.DEV || initializedApps.has(app)) return;
  if (
    import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' ||
    isFirebaseLoopbackHost(window.location.hostname)
  )
    return;

  const mode = import.meta.env.MODE;
  const releasesMatchProject =
    (mode === 'staging' && app.options.projectId === STAGING_FIREBASE_PROJECT_ID) ||
    (mode === 'production' && app.options.projectId === PRODUCTION_FIREBASE_PROJECT_ID);
  if (!releasesMatchProject) return;

  const key = import.meta.env.VITE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY?.trim();
  if (!key) return;
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    console.warn('App Check site key has an invalid format.');
    return;
  }

  // Firebase reads this global during initialization and logs the debug credential.
  const debugFlag = (globalThis as { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown })
    .FIREBASE_APPCHECK_DEBUG_TOKEN;
  if (debugFlag === true || typeof debugFlag === 'string') return;

  initializedApps.add(app);
  try {
    initializeAppCheck(app, {
      provider: new BoundedEnterpriseProvider(key),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    console.warn('App Check initialization failed.');
  }
}
