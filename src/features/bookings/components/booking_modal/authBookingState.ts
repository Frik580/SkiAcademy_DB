export { resolveAuthenticatedParticipantSelection } from '../../../participants/participantSelectionState';

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
