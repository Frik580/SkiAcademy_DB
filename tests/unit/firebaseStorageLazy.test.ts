import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  app: { name: 'shared-app' },
  storage: { app: 'shared-app' },
  getStorage: vi.fn(),
  connectStorageEmulator: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../src/infrastructure/firebase/firebase', () => ({ app: mocks.app }));
vi.mock('../../src/shared', () => ({ logger: { warn: mocks.warn } }));
vi.mock('firebase/storage', () => ({
  getStorage: mocks.getStorage,
  connectStorageEmulator: mocks.connectStorageEmulator,
  ref: mocks.ref,
  uploadBytes: mocks.uploadBytes,
  getDownloadURL: mocks.getDownloadURL,
  deleteObject: mocks.deleteObject,
}));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'false');
  vi.stubEnv('VITE_FIREBASE_EMULATOR_HOST', '');
  vi.stubEnv('VITE_FIREBASE_STORAGE_EMULATOR_PORT', '');
  delete window.__skiAcademyFirebaseStorageEmulatorConnected__;
  mocks.getStorage.mockReturnValue(mocks.storage);
  mocks.ref.mockImplementation((_storage, path: string) => ({ path }));
  mocks.getDownloadURL.mockResolvedValue('https://existing-download-url');
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.__skiAcademyFirebaseStorageEmulatorConnected__;
});

describe('deferred Firebase Storage', () => {
  it('does not initialize on import and completes the first upload with the same path and URL', async () => {
    const { uploadImage } = await import('../../src/infrastructure/firebase/storage');
    expect(mocks.getStorage).not.toHaveBeenCalled();
    expect(mocks.connectStorageEmulator).not.toHaveBeenCalled();

    const blob = new Blob(['avatar']);
    await expect(uploadImage(blob, 'participants/self/avatar')).resolves.toBe(
      'https://existing-download-url'
    );
    expect(mocks.getStorage).toHaveBeenCalledTimes(1);
    expect(mocks.getStorage).toHaveBeenCalledWith(mocks.app);
    expect(mocks.ref).toHaveBeenCalledWith(mocks.storage, 'participants/self/avatar');
    expect(mocks.uploadBytes).toHaveBeenCalledWith({ path: 'participants/self/avatar' }, blob);
    expect(mocks.uploadBytes.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getDownloadURL.mock.invocationCallOrder[0]
    );
    expect(mocks.connectStorageEmulator).not.toHaveBeenCalled();
  });

  it('reuses the initialized instance for a second upload and a delete', async () => {
    const { uploadImage, deleteImage } = await import('../../src/infrastructure/firebase/storage');
    await uploadImage(new Blob(['one']), 'one');
    await uploadImage(new Blob(['two']), 'two');
    await deleteImage('one');
    expect(mocks.getStorage).toHaveBeenCalledTimes(1);
    expect(mocks.uploadBytes).toHaveBeenCalledTimes(2);
    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObject).toHaveBeenCalledWith({ path: 'one' });
  });

  it('shares concurrent first operations and connects the emulator before using any reference', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    vi.stubEnv('VITE_FIREBASE_EMULATOR_HOST', ' localhost ');
    vi.stubEnv('VITE_FIREBASE_STORAGE_EMULATOR_PORT', '9499');
    const { uploadImage, deleteImage } = await import('../../src/infrastructure/firebase/storage');
    await Promise.all([
      uploadImage(new Blob(['one']), 'one'),
      uploadImage(new Blob(['two']), 'two'),
      deleteImage('three'),
    ]);
    expect(mocks.getStorage).toHaveBeenCalledTimes(1);
    expect(mocks.getStorage).toHaveBeenCalledWith(mocks.app);
    expect(mocks.connectStorageEmulator).toHaveBeenCalledTimes(1);
    expect(mocks.connectStorageEmulator).toHaveBeenCalledWith(mocks.storage, 'localhost', 9499);
    expect(mocks.connectStorageEmulator.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.ref.mock.invocationCallOrder[0]
    );
  });

  it('uses existing emulator defaults and does not reconnect on module reload', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    const first = await import('../../src/infrastructure/firebase/storage');
    await first.deleteImage('one');
    expect(mocks.connectStorageEmulator).toHaveBeenCalledTimes(1);
    expect(mocks.connectStorageEmulator).toHaveBeenCalledWith(mocks.storage, '127.0.0.1', 9199);
    vi.resetModules();
    const reloaded = await import('../../src/infrastructure/firebase/storage');
    await reloaded.uploadImage(new Blob(['two']), 'two');
    expect(mocks.connectStorageEmulator).toHaveBeenCalledTimes(1);
  });

  it('propagates a shared initialization failure and allows the next action to retry', async () => {
    const failure = new Error('SDK initialization failed');
    mocks.getStorage.mockImplementationOnce(() => {
      throw failure;
    });
    const { uploadImage } = await import('../../src/infrastructure/firebase/storage');
    const results = await Promise.allSettled([
      uploadImage(new Blob(['one']), 'one'),
      uploadImage(new Blob(['two']), 'two'),
    ]);
    expect(results).toEqual([
      { status: 'rejected', reason: failure },
      { status: 'rejected', reason: failure },
    ]);
    expect(mocks.getStorage).toHaveBeenCalledTimes(1);
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
    await expect(uploadImage(new Blob(['retry']), 'one')).resolves.toBe(
      'https://existing-download-url'
    );
  });

  it('preserves upload error propagation and best-effort delete logging', async () => {
    const failure = new Error('Storage denied');
    mocks.uploadBytes.mockRejectedValue(failure);
    mocks.deleteObject.mockRejectedValue(failure);
    const { uploadImage, deleteImage } = await import('../../src/infrastructure/firebase/storage');
    await expect(uploadImage(new Blob(), 'unchanged/path')).rejects.toBe(failure);
    expect(mocks.getDownloadURL).not.toHaveBeenCalled();
    await expect(deleteImage('unchanged/path')).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalledWith(
      'Failed to delete storage image at unchanged/path:',
      failure
    );
  });

  it('still validates the deferred emulator port at module import', async () => {
    vi.stubEnv('VITE_FIREBASE_STORAGE_EMULATOR_PORT', '65536');
    await expect(import('../../src/infrastructure/firebase/storage')).rejects.toThrow(
      'Invalid Storage emulator port: expected an integer between 1 and 65535.'
    );
    expect(mocks.getStorage).not.toHaveBeenCalled();
  });
});
