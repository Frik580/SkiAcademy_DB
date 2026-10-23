import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: {
    currentUser: null as null | {
      uid: string;
      email: string;
      emailVerified: boolean;
      getIdToken: ReturnType<typeof vi.fn>;
    },
  },
  getDocs: vi.fn(),
  call: vi.fn(),
  httpsCallable: vi.fn(),
}));
vi.mock('firebase/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/auth')>()),
  getAuth: () => mocks.auth,
}));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  getDocs: mocks.getDocs,
}));
vi.mock('firebase/functions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/functions')>()),
  httpsCallable: mocks.httpsCallable,
}));
import { migratePreExistingProfile } from '../../src/infrastructure/firebase/firebase';

beforeEach(() => {
  mocks.getDocs.mockReset();
  mocks.call.mockReset().mockResolvedValue({ data: { claimed: false } });
  mocks.httpsCallable.mockReset().mockReturnValue(mocks.call);
  mocks.auth.currentUser = {
    uid: 'new-owner',
    email: 'victim@example.com',
    emailVerified: false,
    getIdToken: vi.fn().mockResolvedValue('token'),
  };
});
describe('verified profile claim', () => {
  it('does not even query guest profiles for an unverified account', async () => {
    expect(await migratePreExistingProfile('new-owner', 'victim@example.com')).toBeNull();
    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('rejects another UID or email even with a verified session', async () => {
    mocks.auth.currentUser!.emailVerified = true;
    expect(await migratePreExistingProfile('other-uid', 'victim@example.com')).toBeNull();
    expect(await migratePreExistingProfile('new-owner', 'other@example.com')).toBeNull();
    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it('refreshes verified token claims before the server operation without querying guest profiles', async () => {
    mocks.auth.currentUser!.emailVerified = true;
    expect(await migratePreExistingProfile('new-owner', ' VICTIM@example.com ')).toBeNull();
    expect(mocks.auth.currentUser!.getIdToken).toHaveBeenCalledWith(true);
    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(mocks.httpsCallable).toHaveBeenCalledWith(expect.anything(), 'claimGuestProfile');
    expect(mocks.call).toHaveBeenCalledTimes(1);
    expect(mocks.auth.currentUser!.getIdToken.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.call.mock.invocationCallOrder[0]
    );
  });
});
