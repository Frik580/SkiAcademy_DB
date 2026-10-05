import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { name: 'auth' },
  db: { name: 'db' },
  functions: { name: 'functions' },
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
}));

vi.mock('../../src/infrastructure/firebase/firebase', () => ({
  auth: mocks.auth,
  db: mocks.db,
  functions: mocks.functions,
}));
vi.mock('firebase/auth', () => ({ connectAuthEmulator: mocks.connectAuthEmulator }));
vi.mock('firebase/firestore', () => ({ connectFirestoreEmulator: mocks.connectFirestoreEmulator }));
vi.mock('firebase/functions', () => ({ connectFunctionsEmulator: mocks.connectFunctionsEmulator }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  delete window.__skiAcademyFirebaseEmulatorsConnected__;
});

describe('startup Firebase emulator setup', () => {
  it('preserves Auth/Firestore/Functions host and ports and connects only once', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    vi.stubEnv('VITE_FIREBASE_EMULATOR_HOST', ' localhost ');
    vi.stubEnv('VITE_FIREBASE_AUTH_EMULATOR_PORT', '9399');
    vi.stubEnv('VITE_FIREBASE_FIRESTORE_EMULATOR_PORT', '8180');
    vi.stubEnv('VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT', '5101');
    await import('../../src/infrastructure/firebase/connectFirebaseEmulators');
    expect(mocks.connectAuthEmulator).toHaveBeenCalledTimes(1);
    expect(mocks.connectAuthEmulator).toHaveBeenCalledWith(mocks.auth, 'http://localhost:9399', {
      disableWarnings: true,
    });
    expect(mocks.connectFirestoreEmulator).toHaveBeenCalledTimes(1);
    expect(mocks.connectFirestoreEmulator).toHaveBeenCalledWith(mocks.db, 'localhost', 8180);
    expect(mocks.connectFunctionsEmulator).toHaveBeenCalledTimes(1);
    expect(mocks.connectFunctionsEmulator).toHaveBeenCalledWith(mocks.functions, 'localhost', 5101);
    vi.resetModules();
    await import('../../src/infrastructure/firebase/connectFirebaseEmulators');
    expect(mocks.connectAuthEmulator).toHaveBeenCalledTimes(1);
    expect(mocks.connectFirestoreEmulator).toHaveBeenCalledTimes(1);
    expect(mocks.connectFunctionsEmulator).toHaveBeenCalledTimes(1);
  });
});
