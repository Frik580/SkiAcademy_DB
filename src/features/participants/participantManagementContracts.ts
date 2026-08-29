import type { ManagedParticipantPickerAgeProjection } from '@ski-academy/shared-domain';
import type { ManagedParticipantOption } from '../lesson-bookings/lessonBookingContracts';

export type ManagedParticipantAgeInput = ManagedParticipantPickerAgeProjection;

export interface CreateDependentParticipantInput {
  readonly displayName: string;
  readonly ageYears: number;
  readonly skillLevel: string;
  readonly discipline: 'ski' | 'snowboard';
  readonly instructorComment?: string;
}

export interface UpdateManagedParticipantProfileInput {
  readonly participantId: string;
  readonly expectedRevision: number;
  readonly authority: 'self' | 'parent_guardian';
  readonly displayName?: string;
  readonly age?: ManagedParticipantAgeInput;
  readonly skillLevel?: string;
  readonly discipline?: 'ski' | 'snowboard';
  readonly instructorComment?: string;
}

export interface ManagedParticipantProfileEditState {
  readonly displayName: string;
  readonly age: ManagedParticipantAgeInput;
  readonly skillLevel: string;
  readonly discipline: 'ski' | 'snowboard';
  readonly instructorComment?: string;
}

export function mapAgeYearsToParticipantAge(years: number): ManagedParticipantAgeInput {
  return { kind: 'age_years', years };
}

export function mapBirthDateToParticipantAge(birthDate: string): ManagedParticipantAgeInput {
  return { kind: 'birth_date', birthDate };
}

export function readAgeYearsFromParticipantAge(
  age: ManagedParticipantPickerAgeProjection
): number | undefined {
  if (age.kind === 'age_years') {
    return age.years;
  }
  return undefined;
}

export function readBirthDateFromParticipantAge(
  age: ManagedParticipantPickerAgeProjection
): string | undefined {
  if (age.kind === 'birth_date') {
    return age.birthDate;
  }
  return undefined;
}

export function participantAgesEqual(
  left: ManagedParticipantPickerAgeProjection,
  right: ManagedParticipantPickerAgeProjection
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === 'birth_date' && right.kind === 'birth_date') {
    return left.birthDate === right.birthDate;
  }
  if (left.kind === 'age_years' && right.kind === 'age_years') {
    return left.years === right.years;
  }
  return false;
}

export function readParticipantProfileEditState(
  participant: Pick<
    ManagedParticipantOption,
    'displayName' | 'age' | 'skillLevel' | 'discipline' | 'instructorComment'
  >
): ManagedParticipantProfileEditState {
  return {
    displayName: participant.displayName,
    age: participant.age,
    skillLevel: participant.skillLevel,
    discipline: participant.discipline,
    instructorComment: participant.instructorComment,
  };
}

export function buildManagedParticipantProfileUpdateInput(
  participant: ManagedParticipantOption,
  edited: ManagedParticipantProfileEditState
): UpdateManagedParticipantProfileInput {
  const optionalFields: {
    displayName?: string;
    age?: ManagedParticipantAgeInput;
    skillLevel?: string;
    discipline?: 'ski' | 'snowboard';
    instructorComment?: string;
  } = {};

  if (edited.displayName.trim() !== participant.displayName) {
    optionalFields.displayName = edited.displayName.trim();
  }
  if (!participantAgesEqual(edited.age, participant.age)) {
    optionalFields.age = edited.age;
  }
  if (edited.skillLevel.trim() !== participant.skillLevel) {
    optionalFields.skillLevel = edited.skillLevel.trim();
  }
  if (edited.discipline !== participant.discipline) {
    optionalFields.discipline = edited.discipline;
  }
  const normalizedComment = edited.instructorComment?.trim() ?? '';
  const originalComment = participant.instructorComment?.trim() ?? '';
  if (normalizedComment !== originalComment) {
    optionalFields.instructorComment = normalizedComment;
  }

  return {
    participantId: participant.participantId,
    expectedRevision: participant.revision,
    authority: participant.authority,
    ...optionalFields,
  };
}

export function hasManagedParticipantProfileChanges(
  participant: ManagedParticipantOption,
  edited: ManagedParticipantProfileEditState
): boolean {
  const patch = buildManagedParticipantProfileUpdateInput(participant, edited);
  return (
    patch.displayName !== undefined ||
    patch.age !== undefined ||
    patch.skillLevel !== undefined ||
    patch.discipline !== undefined ||
    patch.instructorComment !== undefined
  );
}
