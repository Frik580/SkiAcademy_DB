import { describe, expect, it } from 'vitest';
import { omitLegacyAccountProgressFields } from '../../src/infrastructure/firebase/omitLegacyAccountProgressFields';

describe('omitLegacyAccountProgressFields', () => {
  it('strips leftover level/skillScores/skillComments and keeps other Account fields', () => {
    const written = omitLegacyAccountProgressFields({
      uid: 'account-new',
      email: 'new@example.com',
      displayName: 'Alex Carter',
      phoneNumber: '+15551212',
      role: 'user' as const,
      avatarUrl: 'https://example.com/a.svg',
      balanceUSD: 250,
      isClientActive: true,
      level: 3,
      skillScores: { carving: 99 },
      skillComments: { carving: 'Legacy leftover' },
    });

    expect(written).toEqual({
      uid: 'account-new',
      email: 'new@example.com',
      displayName: 'Alex Carter',
      phoneNumber: '+15551212',
      role: 'user',
      avatarUrl: 'https://example.com/a.svg',
      balanceUSD: 250,
      isClientActive: true,
    });
    expect(written).not.toHaveProperty('level');
    expect(written).not.toHaveProperty('skillScores');
    expect(written).not.toHaveProperty('skillComments');
  });
});
