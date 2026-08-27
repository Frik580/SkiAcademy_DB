import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  selectCollaborationProposals,
  useBookingCollaborationStore,
} from '../../src/features/booking-collaboration/bookingCollaborationStore';
import type { BookingProposalCabinetItem } from '../../src/features/booking-collaboration/bookingCollaborationContracts';

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
});
