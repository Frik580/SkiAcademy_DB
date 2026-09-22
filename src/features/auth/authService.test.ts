import { describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../types';

const { setDoc } = vi.hoisted(() => ({ setDoc: vi.fn() }));

vi.mock('../../infrastructure/firebase', () => ({
  auth: {},
  db: {},
  doc: (_db: unknown, collection: string, id: string) => `${collection}/${id}`,
  setDoc,
  omitLegacyAccountProgressFields: (profile: UserProfile) => profile,
}));

import { saveUserProfileService } from './authService';

describe('LIVE Account signup write', () => {
  it('stamps live without a Test Session even if client profile fields suggest TEST', async () => {
    const profile = {
      uid: 'account_signup_live_01',
      email: 'test-client@example.com',
      displayName: 'Ordinary Client',
      role: 'user',
      avatarUrl: '',
      dataScope: 'test',
      testSessionId: 'untrusted_client_session',
    } as UserProfile & { testSessionId: string };

    await saveUserProfileService(profile);

    expect(setDoc).toHaveBeenCalledWith('users/account_signup_live_01', {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName,
      role: 'user',
      avatarUrl: '',
      dataScope: 'live',
    });
  });
});
