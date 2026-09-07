import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  selectCollaborationProposals,
  useBookingCollaborationStore,
} from '../../src/features/booking-collaboration/bookingCollaborationStore';
import type { BookingProposalCabinetItem } from '../../src/features/booking-collaboration/bookingCollaborationContracts';
import type { InstructorLessonBookingItem } from '../../src/features/booking-collaboration/bookingCollaborationContracts';

function proposal(id: string, revision: number, date = '2026-06-15'): BookingProposalCabinetItem {
  return {
    proposalId: id,
    revision,
    participantId: 'participant_fixture_01',
    instructorId: 'instructor_fixture_01',
    participantDisplayName: 'Student',
    instructorDisplayName: 'Coach',
    date,
    time: '08:00',
    durationHours: 2,
    lifecycleStatus: 'open',
    lifecycleLabel: 'Open',
    authorizedActions: { canAccept: true, canDecline: true, canWithdraw: false },
  };
}

describe('bookingCollaborationStore', () => {
  beforeEach(() => {
    useBookingCollaborationStore.getState().reset();
  });

  it('mergeProposals keeps stable list reference on no-op merges', () => {
    const store = useBookingCollaborationStore.getState();
    store.mergeProposals(new Map([['proposal_a', proposal('proposal_a', 2)]]));
    const before = useBookingCollaborationStore.getState();
    store.mergeProposals(new Map([['proposal_a', proposal('proposal_a', 1)]]));
    const after = useBookingCollaborationStore.getState();
    expect(after.proposalsList).toBe(before.proposalsList);
  });

  it('selectCollaborationProposals returns cached snapshot', () => {
    useBookingCollaborationStore
      .getState()
      .mergeProposals(new Map([['proposal_a', proposal('proposal_a', 1)]]));
    const state = useBookingCollaborationStore.getState();
    expect(selectCollaborationProposals(state)).toBe(state.proposalsList);
  });

  it('subscribing with selectCollaborationProposals does not rerender on no-op merges', () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount += 1;
      return useBookingCollaborationStore(selectCollaborationProposals);
    });
    expect(renderCount).toBe(1);
    act(() => {
      useBookingCollaborationStore
        .getState()
        .mergeProposals(new Map([['proposal_a', proposal('proposal_a', 1)]]));
    });
    expect(renderCount).toBe(2);
    act(() => {
      useBookingCollaborationStore
        .getState()
        .mergeProposals(new Map([['proposal_a', proposal('proposal_a', 1)]]));
    });
    expect(renderCount).toBe(2);
  });

  it('replaces instructor bookings so rows removed from canonical scopes do not remain stale', () => {
    const first = {
      bookingId: 'booking_first',
      revision: 1,
      date: '2026-01-02',
    } as InstructorLessonBookingItem;
    const reassigned = {
      bookingId: 'booking_reassigned',
      revision: 1,
      date: '2026-01-01',
    } as InstructorLessonBookingItem;
    useBookingCollaborationStore.getState().setInstructorLessonBookings(
      new Map([
        [first.bookingId, first],
        [reassigned.bookingId, reassigned],
      ])
    );

    useBookingCollaborationStore
      .getState()
      .setInstructorLessonBookings(new Map([[first.bookingId, first]]));

    expect(useBookingCollaborationStore.getState().instructorLessonBookingsList).toEqual([first]);
  });
});
