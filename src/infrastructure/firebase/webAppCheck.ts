import type { FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

export function initializeWebAppCheck(app: FirebaseApp): void {
  // Separate public site keys are supplied by each Vite mode. Emulator/E2E
  // execution never calls attestation services or persists debug credentials.
  const key = import.meta.env.VITE_APPCHECK_RECAPTCHA_ENTERPRISE_SITE_KEY;
  if (
    !key ||
    import.meta.env.MODE === 'test' ||
    import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'
  )
    return;
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(key),
    isTokenAutoRefreshEnabled: true,
  });
}
