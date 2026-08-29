export function resolveAuthenticatedParticipantSelection(
  selectedParticipantIds: readonly string[],
  managedParticipantIds: readonly string[]
): string[] {
  if (selectedParticipantIds.length > 0 || managedParticipantIds.length === 0) {
    return [...selectedParticipantIds];
  }
  return [managedParticipantIds[0]!];
}

export function isAuthenticatedBookingSubmitDisabled(input: {
  readonly isSubmitting: boolean;
  readonly isTimeSlotOccupied: boolean;
  readonly instructorAvailable: boolean;
  readonly clientActive: boolean;
  readonly selectedParticipantCount: number;
}): boolean {
  return (
    input.isSubmitting ||
    input.isTimeSlotOccupied ||
    !input.instructorAvailable ||
    !input.clientActive ||
    input.selectedParticipantCount === 0
  );
}
