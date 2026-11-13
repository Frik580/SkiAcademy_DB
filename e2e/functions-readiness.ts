import { functionsCallableUrl } from './emulator-config';
import { diagnose } from '../scripts/e2eDiagnostics.mjs';

let readinessCall = 0;
const FUNCTIONS_READINESS_PROBE = 'optimizeImage';
const FUNCTIONS_READINESS_TIMEOUT_MS = 60_000;
const FUNCTIONS_READINESS_RETRY_INTERVAL_MS = 250;
const FUNCTIONS_READINESS_ATTEMPT_TIMEOUT_MS = 3_000;
const FUNCTIONS_READINESS_STABLE_PROBES = 3;
const FUNCTIONS_READINESS_STABLE_INTERVAL_MS = 500;

async function probeFunctionsHttp(functionName: string): Promise<boolean> {
  try {
    const response = await fetch(functionsCallableUrl(functionName), {
      method: 'GET',
      signal: AbortSignal.timeout(FUNCTIONS_READINESS_ATTEMPT_TIMEOUT_MS),
    });
    const ready = response.status < 502;
    await response.body?.cancel();
    return ready;
  } catch {
    return false;
  }
}

async function probeFunctionsCallable(functionName: string): Promise<boolean> {
  try {
    const response = await fetch(functionsCallableUrl(functionName), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Missing callable envelope is rejected by the SDK before admission or
      // domain handlers. Readiness must not write counters or contend on them.
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(FUNCTIONS_READINESS_ATTEMPT_TIMEOUT_MS),
    });
    const ready = response.status === 400;
    await response.body?.cancel();
    return ready;
  } catch {
    return false;
  }
}

async function probeFunctionsRuntimeReady() {
  const [httpReady, guestCallableReady, authCallableReady] = await Promise.all([
    probeFunctionsHttp(FUNCTIONS_READINESS_PROBE),
    probeFunctionsCallable('executeGuestCanonicalCommand'),
    probeFunctionsCallable('executeCanonicalCommand'),
  ]);
  return { httpReady, guestCallableReady, authCallableReady };
}

/**
 * Poll until the Functions emulator serves callable traffic reliably. `firebase emulators:exec`
 * waits for initial emulator startup, but Playwright then starts Vite which can trigger
 * Functions reloads on Windows. Run this after the web server is up (e.g. test.beforeAll).
 */
export async function waitForFunctionsEmulatorReady(
  functionName = FUNCTIONS_READINESS_PROBE,
  timeoutMs = FUNCTIONS_READINESS_TIMEOUT_MS
): Promise<void> {
  const started = Date.now();
  const deadline = started + timeoutMs;
  const call = `${process.pid}-${++readinessCall}`;
  // Capture before the first await: includes the spec/hook or global setup caller.
  const caller = new Error().stack
    ?.split('\n')
    .slice(2, 6)
    .map((line) => line.trim());
  diagnose('functions-readiness:start', { call, caller, timeoutMs });
  let attempts = 0;
  let nextProgress = started;
  let checks;
  let lastReady = false;
  let stableProbes = 0;

  while (Date.now() < deadline) {
    attempts += 1;
    checks = await probeFunctionsRuntimeReady();
    lastReady = Object.values(checks).every(Boolean);
    if (Date.now() >= nextProgress) {
      diagnose('functions-readiness:progress', {
        call,
        attempts,
        stableProbes,
        checks,
        ready: lastReady,
        elapsedMs: Date.now() - started,
      });
      nextProgress = Date.now() + 5_000;
    }
    if (lastReady) {
      stableProbes += 1;
      if (stableProbes >= FUNCTIONS_READINESS_STABLE_PROBES) {
        diagnose('functions-readiness:ready', { call, attempts, elapsedMs: Date.now() - started });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, FUNCTIONS_READINESS_STABLE_INTERVAL_MS));
      continue;
    }

    stableProbes = 0;
    await new Promise((resolve) => setTimeout(resolve, FUNCTIONS_READINESS_RETRY_INTERVAL_MS));
  }

  diagnose('functions-readiness:timeout', {
    call,
    attempts,
    stableProbes,
    checks,
    ready: lastReady,
    elapsedMs: Date.now() - started,
  });
  throw new Error(
    `Functions emulator did not become ready for "${functionName}" at ${functionsCallableUrl(functionName)} within ${timeoutMs}ms. ` +
      'Ensure E2E runs via `npm run test:e2e` so auth, firestore, functions, and storage emulators are started.'
  );
}
