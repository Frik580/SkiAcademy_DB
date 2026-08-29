import { describe, expect, it } from 'vitest';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import {
  buildManagedParticipantProfileUpdateInput,
  hasManagedParticipantProfileChanges,
  participantAgesEqual,
  readAgeYearsFromParticipantAge,
  readBirthDateFromParticipantAge,
  readParticipantProfileEditState,
} from '../../src/features/participants/participantManagementContracts';

const birthDateParticipant: ManagedParticipantOption = {
  participantId: 'participant_birth_date',
  participantManagementId: 'management_birth_date',
  displayName: 'Birth Date Child',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'birth_date', birthDate: '2012-02-29' },
  authority: 'parent_guardian',
  revision: 3,
};

const ageYearsParticipant: ManagedParticipantOption = {
  ...birthDateParticipant,
  participantId: 'participant_age_years',
  participantManagementId: 'management_age_years',
  displayName: 'Age Years Child',
  age: { kind: 'age_years', years: 12 },
};

describe('participantManagementContracts', () => {
  it('does not coerce birth_date into age_years when reading edit state', () => {
    const editState = readParticipantProfileEditState(birthDateParticipant);
    expect(editState.age).toEqual({ kind: 'birth_date', birthDate: '2012-02-29' });
    expect(readAgeYearsFromParticipantAge(editState.age)).toBeUndefined();
    expect(readBirthDateFromParticipantAge(editState.age)).toBe('2012-02-29');
  });

  it('omits age from update patch when birth_date profile is saved unchanged', () => {
    const editState = readParticipantProfileEditState(birthDateParticipant);
    const patch = buildManagedParticipantProfileUpdateInput(birthDateParticipant, editState);

    expect(patch.age).toBeUndefined();
    expect(hasManagedParticipantProfileChanges(birthDateParticipant, editState)).toBe(false);
  });

  it('preserves birth_date when only display name changes', () => {
    const editState = {
      ...readParticipantProfileEditState(birthDateParticipant),
      displayName: 'Updated Name',
    };
    const patch = buildManagedParticipantProfileUpdateInput(birthDateParticipant, editState);

    expect(patch.displayName).toBe('Updated Name');
    expect(patch.age).toBeUndefined();
  });

  it('sends birth_date patch only when birth date changes', () => {
    const editState = {
      ...readParticipantProfileEditState(birthDateParticipant),
      age: { kind: 'birth_date' as const, birthDate: '2013-03-15' },
    };
    const patch = buildManagedParticipantProfileUpdateInput(birthDateParticipant, editState);

    expect(patch.age).toEqual({ kind: 'birth_date', birthDate: '2013-03-15' });
    expect(participantAgesEqual(birthDateParticipant.age, editState.age)).toBe(false);
  });

  it('sends age_years patch when years change', () => {
    const editState = {
      ...readParticipantProfileEditState(ageYearsParticipant),
      age: { kind: 'age_years' as const, years: 13 },
    };
    const patch = buildManagedParticipantProfileUpdateInput(ageYearsParticipant, editState);

    expect(patch.age).toEqual({ kind: 'age_years', years: 13 });
  });
});
