import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateUserProfileService } from '../../src/features/profile/profileService';

const executeAuthenticatedCanonicalCommand = vi.fn();
const mockUpdateDoc = vi.fn();
const mockDoc = vi.fn((...args: unknown[]) => ({ path: args.join('/') }));

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) =>
    executeAuthenticatedCanonicalCommand(...args),
}));

vi.mock('../../src/infrastructure/firebase', () => ({
  db: {},
  doc: (...args: unknown[]) => mockDoc(...args),
  updateDoc: (...args: unknown[]) => mockUpdateDoc(...args),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  collection: vi.fn(),
  where: vi.fn(),
  arrayUnion: vi.fn(),
}));

describe('profileService identity writes', () => {
  beforeEach(() => {
    executeAuthenticatedCanonicalCommand.mockReset();
    mockUpdateDoc.mockReset();
    mockDoc.mockClear();
  });

  it('routes phoneNumber through update_own_account_contact and does not write Firestore identity fields', async () => {
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'success',
      kind: 'update_own_account_contact',
      correlationId: 'correlation_own_contact_01',
      payload: { adminPeopleRevision: 4 },
    });

    await updateUserProfileService(
      'account_profile_01',
      { phoneNumber: '+7701555' },
      'instructor_01'
    );

    expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledTimes(1);
    expect(executeAuthenticatedCanonicalCommand).toHaveBeenCalledWith(
      'account_profile_01',
      expect.objectContaining({
        kind: 'update_own_account_contact',
        intent: { phoneNumber: '+7701555' },
        exercisedCapability: 'account_owner',
      })
    );
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it('keeps non-identity preference writes on the user document', async () => {
    await updateUserProfileService('account_profile_01', { hideProgressTracking: true });

    expect(executeAuthenticatedCanonicalCommand).not.toHaveBeenCalled();
    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdateDoc.mock.calls[0]?.[1]).toEqual({ hideProgressTracking: true });
  });

  it('does not write preferences when the canonical phone update fails', async () => {
    executeAuthenticatedCanonicalCommand.mockResolvedValue({
      status: 'error',
      kind: 'update_own_account_contact',
      correlationId: 'correlation_own_contact_fail_01',
      error: {
        code: 'forbidden',
        message: 'This action is not permitted.',
        retryable: false,
        correlationId: 'correlation_own_contact_fail_01',
      },
    });

    await expect(
      updateUserProfileService('account_profile_01', {
        phoneNumber: '+7701999',
        hideProgressTracking: true,
      })
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});
