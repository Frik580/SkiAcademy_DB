import { GuestParticipantProfileFromTransportSchema } from '@ski-academy/shared-domain/canonical/guestBooking';

export interface GuestParticipantFormInput {
  readonly displayName: string;
  readonly discipline: '' | 'ski' | 'snowboard';
  readonly skillLevel: string;
  readonly ageYears: string;
}

/** Validate actual form values against the canonical profile contract, without defaults. */
export function parseGuestParticipantForm(input: GuestParticipantFormInput) {
  return GuestParticipantProfileFromTransportSchema.safeParse({
    displayName: input.displayName,
    discipline: input.discipline,
    skillLevel: input.skillLevel,
    ageYears: input.ageYears.trim() === '' ? undefined : Number(input.ageYears),
  });
}

export function guestParticipantCommandFields(
  profile: NonNullable<ReturnType<typeof parseGuestParticipantForm>['data']>
) {
  return {
    guestDisplayName: profile.displayName,
    guestDiscipline: profile.discipline,
    guestSkillLevel: profile.skillLevel,
    guestAgeYears: profile.ageYears,
  };
}
