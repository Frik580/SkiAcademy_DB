import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ADMIN_FIRESTORE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'adminFirestore.ts');

const mockGetApp = vi.fn();
const mockInitializeApp = vi.fn();
const mockGetFirestore = vi.fn();

vi.mock('firebase-admin/app', () => ({
  getApp: (...args: unknown[]) => mockGetApp(...args),
  initializeApp: (...args: unknown[]) => mockInitializeApp(...args),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: (...args: unknown[]) => mockGetFirestore(...args),
}));

describe('adminFirestore guardrails', () => {
  it('does not gate initializeApp on getApps().length alone', () => {
    const source = readFileSync(ADMIN_FIRESTORE_PATH, 'utf8');
    expect(source).not.toMatch(/getApps\(\)/);
    expect(source).toMatch(/getApp\(\)/);
    expect(source).toMatch(/initializeApp\(/);
  });
});

describe('getAdminFirestore', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetApp.mockReset();
    mockInitializeApp.mockReset();
    mockGetFirestore.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('initializes admin when getApp throws (Cloud Run: no default app)', async () => {
    const fakeApp = { name: '[DEFAULT]' };
    const fakeDb = { kind: 'firestore' };

    mockGetApp.mockImplementation(() => {
      throw new Error('The default Firebase app does not exist.');
    });
    mockInitializeApp.mockReturnValue(fakeApp);
    mockGetFirestore.mockReturnValue(fakeDb);

    const { getAdminFirestore } = await import('./adminFirestore');
    const db = getAdminFirestore();

    expect(mockInitializeApp).toHaveBeenCalledOnce();
    expect(mockGetFirestore).toHaveBeenCalledWith(fakeApp);
    expect(db).toBe(fakeDb);
  });

  it('reuses the default app without calling initializeApp', async () => {
    const fakeApp = { name: '[DEFAULT]' };
    const fakeDb = { kind: 'firestore' };

    mockGetApp.mockReturnValue(fakeApp);
    mockGetFirestore.mockReturnValue(fakeDb);

    const { getAdminFirestore } = await import('./adminFirestore');
    const first = getAdminFirestore();
    const second = getAdminFirestore();

    expect(mockInitializeApp).not.toHaveBeenCalled();
    expect(mockGetFirestore).toHaveBeenCalledOnce();
    expect(mockGetFirestore).toHaveBeenCalledWith(fakeApp);
    expect(first).toBe(second);
  });
});
