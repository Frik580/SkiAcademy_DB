import type { CommandErrorDetails } from '@ski-academy/shared-domain';

export function participantConflictIdsFromDetails(
  details?: CommandErrorDetails
): readonly string[] {
  if (!details) return [];
  if (details.participantIds && details.participantIds.length > 0) {
    return details.participantIds;
  }
  if (details.participantId) {
    return [details.participantId];
  }
  return [];
}

export function formatParticipantBookingConflictMessage(input: {
  readonly participantIds: readonly string[];
  readonly resolveDisplayName: (participantId: string) => string | undefined;
  readonly t: (key: string, ...args: unknown[]) => string;
}): string {
  const names = input.participantIds
    .map((participantId) => input.resolveDisplayName(participantId)?.trim() || participantId)
    .filter((name) => name.length > 0);

  if (names.length === 1) {
    return input.t('bookingParticipantTimeConflict', { name: names[0] });
  }
  if (names.length > 1) {
    return input.t('bookingParticipantsTimeConflict', { names: names.join('\n') });
  }
  return input.t('slotUnavailable');
}

export function formatLessonBookingParticipantLine(input: {
  readonly participantNames: readonly string[];
  readonly participantLabel: string;
  readonly participantsLabel: string;
}): string {
  const names = input.participantNames.map((name) => name.trim()).filter((name) => name.length > 0);

  if (names.length === 0) {
    return input.participantLabel;
  }
  if (names.length === 1) {
    return `${input.participantLabel}: ${names[0]}`;
  }
  return `${input.participantsLabel}: ${names.join(', ')}`;
}
