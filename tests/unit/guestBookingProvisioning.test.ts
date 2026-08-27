import { describe, expect, it } from 'vitest';
import {
  guestParticipantTransportMetadataFromProfile,
  parseGuestParticipantProfileFromTransportMetadata,
  rejectSpoofedManagedParticipantPickerInput,
} from '@ski-academy/shared-domain';

describe('guest participant transport metadata', () => {
  it('round-trips permitted guest participant profile fields', () => {
    const profile = {
      displayName: 'Guest Skier',
      skillLevel: 'intermediate',
      discipline: 'ski' as const,
      ageYears: 18,
    };
    const parsed = parseGuestParticipantProfileFromTransportMetadata(
      guestParticipantTransportMetadataFromProfile(profile)
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(profile);
    }
  });

  it('rejects client-supplied account authority fields on picker input', () => {
    expect(() =>
      rejectSpoofedManagedParticipantPickerInput({
        accountId: 'account_spoof_01',
      })
    ).toThrow(/accountId/);
  });
});
