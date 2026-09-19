import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureCanonicalSelfParticipant: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('../../src/lib/canonical/canonicalAccountProvisioningClient', () => ({
  ensureCanonicalSelfParticipant: mocks.ensureCanonicalSelfParticipant,
}));

vi.mock('../../src/shared', () => ({
  logger: { error: mocks.loggerError },
}));

const identity = vi.hoisted(() => ({
  accountId: 'account_sync',
}));

vi.mock('../../src/features/auth/authStore', () => ({
  useAuthStore: (selector: (state: { firebaseUser: { uid: string } }) => unknown) =>
    selector({ firebaseUser: { uid: identity.accountId } }),
}));

vi.mock('../../src/features/profile/profileStore', () => ({
  useProfileStore: (selector: (state: { userProfile: { uid: string } }) => unknown) =>
    selector({ userProfile: { uid: identity.accountId } }),
}));

import { useCanonicalAccountProvisioningSync } from '../../src/features/auth/sync/useCanonicalAccountProvisioningSync';
import { PROD_SHAPED_KSUSHA_ACCOUNT_ID } from '../helpers/userProfileFixtures';

describe('useCanonicalAccountProvisioningSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identity.accountId = 'account_sync';
    mocks.ensureCanonicalSelfParticipant.mockResolvedValue(undefined);
  });

  it('requests canonical self provisioning after the authenticated profile loads', async () => {
    renderHook(() => useCanonicalAccountProvisioningSync());
    await waitFor(() =>
      expect(mocks.ensureCanonicalSelfParticipant).toHaveBeenCalledWith('account_sync')
    );
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });

  it('H. requests participant resolution after a ksusha-shaped profile loads', async () => {
    identity.accountId = PROD_SHAPED_KSUSHA_ACCOUNT_ID;
    renderHook(() => useCanonicalAccountProvisioningSync());
    await waitFor(() =>
      expect(mocks.ensureCanonicalSelfParticipant).toHaveBeenCalledWith(
        PROD_SHAPED_KSUSHA_ACCOUNT_ID
      )
    );
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
