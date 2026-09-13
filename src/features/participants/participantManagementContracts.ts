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
  readonly avatarUrl?: string;
}

export interface ManagedParticipantProfileEditState {
  readonly displayName: string;
  readonly age: ManagedParticipantAgeInput;
  readonly skillLevel: string;
  readonly discipline: 'ski' | 'snowboard';
  readonly instructorComment?: string;
  readonly avatarUrl?: string;
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
    'displayName' | 'age' | 'skillLevel' | 'discipline' | 'instructorComment' | 'avatarUrl'
  >
): ManagedParticipantProfileEditState {
  return {
    displayName: participant.displayName,
    age: participant.age,
    skillLevel: participant.skillLevel,
    discipline: participant.discipline,
    instructorComment: participant.instructorComment,
    avatarUrl: participant.avatarUrl,
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
    avatarUrl?: string;
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
  const editedAvatar = edited.avatarUrl?.trim() ?? '';
  const originalAvatar = participant.avatarUrl?.trim() ?? '';
  if (editedAvatar !== originalAvatar && editedAvatar.length > 0) {
    optionalFields.avatarUrl = editedAvatar;
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
    patch.instructorComment !== undefined ||
    patch.avatarUrl !== undefined
  );
}

/** Storage object path for a participant-scoped avatar upload. */
export function participantAvatarStoragePath(participantId: string): string {
  return `participant-avatars/${participantId}/avatar.jpg`;
}

/**
 * Resolve the image URL shown for a managed participant.
 * Self participants may temporarily fall back to legacy UserProfile.avatarUrl.
 */
export function resolveParticipantAvatarUrl(input: {
  readonly avatarUrl?: string;
  readonly authority: 'self' | 'parent_guardian';
  readonly legacySelfAvatarUrl?: string;
}): string | undefined {
  const canonical = input.avatarUrl?.trim();
  if (canonical) {
    return canonical;
  }
  if (input.authority === 'self') {
    const legacy = input.legacySelfAvatarUrl?.trim();
    return legacy || undefined;
  }
  return undefined;
}
