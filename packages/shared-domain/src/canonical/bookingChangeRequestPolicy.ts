import type {
  BookingChangeRequestResolution,
  BookingChangeRequestStatus,
} from './bookingOccurrenceProposalChange';

export function isTerminalBookingChangeRequestStatus(
  status: BookingChangeRequestStatus
): boolean {
  return status !== 'open';
}

export function resolveRequiresBookingMutation(
  resolution: BookingChangeRequestResolution
): boolean {
  return resolution === 'rescheduled' || resolution === 'booking_cancelled';
}
