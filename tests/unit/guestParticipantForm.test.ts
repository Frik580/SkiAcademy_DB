import { describe, expect, it } from 'vitest';
import {
  guestParticipantCommandFields,
  parseGuestParticipantForm,
} from '../../src/features/guest-reservations/guestParticipantForm';

describe('guest participant form canonical mapping', () => {
  const draft = {
    displayName: ' Guest Child ',
    discipline: 'snowboard' as const,
    skillLevel: 'intermediate',
    ageYears: '12',
  };

  it.each(['ski', 'snowboard'] as const)(
    'preserves %s, real age and selected skill',
    (discipline) => {
      const result = parseGuestParticipantForm({ ...draft, discipline });
      expect(result.success).toBe(true);
      if (!result.success) throw result.error;
      expect(guestParticipantCommandFields(result.data)).toEqual({
        guestDisplayName: 'Guest Child',
        guestDiscipline: discipline,
        guestAgeYears: 12,
        guestSkillLevel: 'intermediate',
      });
    }
  );

  it.each(['', ' ', '12.5', '-1', '126', 'NaN'])(
    'rejects missing or invalid age %j',
    (ageYears) => {
      expect(parseGuestParticipantForm({ ...draft, ageYears }).success).toBe(false);
    }
  );

  it('accepts age zero without converting it to missing or a default', () => {
    const result = parseGuestParticipantForm({ ...draft, ageYears: '0' });
    expect(result.success && result.data.ageYears).toBe(0);
  });

  it('requires explicit discipline and skill instead of inventing values', () => {
    expect(parseGuestParticipantForm({ ...draft, discipline: '' }).success).toBe(false);
    expect(parseGuestParticipantForm({ ...draft, skillLevel: '' }).success).toBe(false);
  });
});
