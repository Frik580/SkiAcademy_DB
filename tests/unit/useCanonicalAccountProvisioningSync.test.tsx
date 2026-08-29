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

vi.mock('../../src/features/auth/authStore', () => ({
  useAuthStore: (selector: (state: { firebaseUser: { uid: string } }) => unknown) =>
    selector({ firebaseUser: { uid: 'account_sync' } }),
}));

vi.mock('../../src/features/profile/profileStore', () => ({
  useProfileStore: (selector: (state: { userProfile: { uid: string } }) => unknown) =>
    selector({ userProfile: { uid: 'account_sync' } }),
}));

import { useCanonicalAccountProvisioningSync } from '../../src/features/auth/sync/useCanonicalAccountProvisioningSync';

describe('useCanonicalAccountProvisioningSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureCanonicalSelfParticipant.mockResolvedValue(undefined);
  });

  it('requests canonical self provisioning after the authenticated profile loads', async () => {
    renderHook(() => useCanonicalAccountProvisioningSync());
    await waitFor(() =>
      expect(mocks.ensureCanonicalSelfParticipant).toHaveBeenCalledWith('account_sync')
    );
    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
