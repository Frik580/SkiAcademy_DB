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
