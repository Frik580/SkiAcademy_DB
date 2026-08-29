import { describe, expect, it } from 'vitest';
import {
  isAuthenticatedBookingSubmitDisabled,
  resolveAuthenticatedParticipantSelection,
} from '../../src/features/bookings/components/booking_modal/authBookingState';

describe('authenticated booking participant state', () => {
  it('automatically selects the sole provisioned Participant', () => {
    expect(resolveAuthenticatedParticipantSelection([], ['participant_self'])).toEqual([
      'participant_self',
    ]);
  });

  it('does not block submit once a provisioned Participant is selected', () => {
    expect(
      isAuthenticatedBookingSubmitDisabled({
        isSubmitting: false,
        isTimeSlotOccupied: false,
        instructorAvailable: true,
        clientActive: true,
        selectedParticipantCount: 1,
      })
    ).toBe(false);
  });
});
