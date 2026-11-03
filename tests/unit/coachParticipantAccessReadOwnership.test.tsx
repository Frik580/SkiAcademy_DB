import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CoachParticipantAccessPanel } from '../../src/features/booking-collaboration/components/CoachParticipantAccessPanel';
import {
  participantInstructorAccessQueryKey,
  useBookingCollaborationStore,
} from '../../src/features/booking-collaboration';
import {
  refetchParticipantAccessRead,
  useBookingCollaborationReadSync,
} from '../../src/features/booking-collaboration/useBookingCollaborationReadSync';
import type { ParticipantInstructorAccessReadModel } from '@ski-academy/shared-domain';
import { resetUserScopedStores } from '../../src/store/resetDataStores';

const queryParticipantInstructorAccessReadModelsMock = vi.fn();
const createRelationshipMock = vi.fn();
const managedParticipantState = vi.hoisted(() => ({ includeDependent: false }));
const blockParticipantMock = vi.fn();
const unblockParticipantMock = vi.fn();
const queryBookingProposalReadModelsMock = vi.fn();
const queryBookingChangeRequestReadModelsMock = vi.fn();

vi.mock('../../src/app/providers/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    language: 'en',
  }),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryParticipantInstructorAccessReadModels: (...args: unknown[]) =>
    queryParticipantInstructorAccessReadModelsMock(...args),
  queryBookingProposalReadModels: (...args: unknown[]) =>
    queryBookingProposalReadModelsMock(...args),
  queryBookingChangeRequestReadModels: (...args: unknown[]) =>
    queryBookingChangeRequestReadModelsMock(...args),
}));

vi.mock('../../src/features/lesson-bookings/useManagedParticipants', () => ({
  useManagedParticipants: () => ({
    participants: [
      ...(managedParticipantState.includeDependent
        ? [{ participantId: 'participant_dependent', authority: 'parent_guardian' }]
        : []),
      {
        participantId: 'b73191c9dfea69703c70e4be692abb9569f0af9cf17050e77a4ccfca9b5d4d5e',
        participantManagementId: 'mgmt_fixture_01',
        displayName: 'Student',
        discipline: 'ski',
        skillLevel: 'beginner',
        age: 30,
        authority: 'account_owner',
        revision: 1,
      },
    ],
    loading: false,
    error: undefined,
    reload: vi.fn(),
  }),
}));

vi.mock('../../src/features/booking-collaboration/useBookingCollaborationCommands', () => ({
  useBookingCollaborationCommands: () => ({
    createRelationship: createRelationshipMock,
    revokeRelationship: vi.fn(),
    blockParticipant: blockParticipantMock,
    unblockParticipant: unblockParticipantMock,
    refetchParticipantAccessRead: vi.fn(),
  }),
}));

const PARTICIPANT_ID = 'b73191c9dfea69703c70e4be692abb9569f0af9cf17050e77a4ccfca9b5d4d5e';
const INSTRUCTOR_ID = 'ins_elena';

function item(
  overrides: Partial<ParticipantInstructorAccessReadModel> = {}
): ParticipantInstructorAccessReadModel {
  return {
    participantId: PARTICIPANT_ID,
    instructorId: INSTRUCTOR_ID,
    participantDisplayName: 'Student',
    instructorDisplayName: 'Elena',
    authorizedActions: {
      canCreateRelationship: true,
      canRevokeRelationship: false,
      canBlock: true,
      canUnblock: false,
    },
    ...overrides,
  };
}

describe('CoachParticipantAccessPanel access read ownership', () => {
  beforeEach(() => {
    managedParticipantState.includeDependent = false;
    useBookingCollaborationStore.getState().reset();
    queryParticipantInstructorAccessReadModelsMock.mockReset();
    createRelationshipMock.mockReset();
    queryBookingProposalReadModelsMock.mockReset();
    queryBookingChangeRequestReadModelsMock.mockReset();
    queryBookingProposalReadModelsMock.mockResolvedValue({ scope: 'account_open', items: [] });
    queryBookingChangeRequestReadModelsMock.mockResolvedValue({
      scope: 'account_open',
      items: [],
    });
    createRelationshipMock.mockImplementation(async () => {
      await refetchParticipantAccessRead('account_manager', PARTICIPANT_ID, INSTRUCTOR_ID);
    });
  });

  it('A. mounts once for a stable key', async () => {
    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
      item: item({
        relationship: {
          instructorRelationshipId: 'rel_fixture_01',
          revision: 2,
          status: 'active',
        },
        authorizedActions: {
          canCreateRelationship: false,
          canRevokeRelationship: true,
          canBlock: true,
          canUnblock: false,
        },
      }),
    });

    render(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );

    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
    });
    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledWith({
      scope: 'account_manager',
      participantId: PARTICIPANT_ID,
      instructorId: INSTRUCTOR_ID,
    });
  });

  it('B. treats revoked relationship as loaded and does not refetch', async () => {
    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
      item: item({
        relationship: {
          instructorRelationshipId: 'rel_revoked_01',
          revision: 3,
          status: 'revoked',
        },
      }),
    });

    const { rerender } = render(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'collabBlockInstructor' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'collabBlockInstructor' })).toBeInTheDocument();

    const queryKey = participantInstructorAccessQueryKey(
      'account_manager',
      PARTICIPANT_ID,
      INSTRUCTOR_ID
    );
    expect(useBookingCollaborationStore.getState().participantAccessQueries.get(queryKey)).toEqual({
      status: 'loaded',
    });

    rerender(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
  });

  it('C. loads an active relationship exactly once', async () => {
    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
      item: item({
        relationship: {
          instructorRelationshipId: 'rel_active_01',
          revision: 1,
          status: 'active',
        },
        authorizedActions: {
          canCreateRelationship: false,
          canRevokeRelationship: true,
          canBlock: true,
          canUnblock: false,
        },
      }),
    });

    render(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'collabBlockInstructor' })).toBeInTheDocument();
    });
    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
  });

  it('D. treats missing relationship item as loaded with no extra requests', async () => {
    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
    });

    render(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );

    await waitFor(() => {
      const queryKey = participantInstructorAccessQueryKey(
        'account_manager',
        PARTICIPANT_ID,
        INSTRUCTOR_ID
      );
      expect(
        useBookingCollaborationStore.getState().participantAccessQueries.get(queryKey)
      ).toEqual({ status: 'loaded' });
    });

    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
  });

  it('D2. treats item without relationship as loaded once', async () => {
    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
      item: item(),
    });

    render(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'collabBlockInstructor' })).toBeInTheDocument();
    });
    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
  });

  it('E. unrelated rerender keeps callable count at 1', async () => {
    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
      item: item({
        relationship: {
          instructorRelationshipId: 'rel_revoked_01',
          revision: 3,
          status: 'revoked',
        },
      }),
    });

    const { rerender } = render(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );
    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
    });

    rerender(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );
    rerender(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );

    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
  });

  it('F. unrelated store update does not refetch', async () => {
    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
      item: item(),
    });

    render(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );
    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      useBookingCollaborationStore.getState().setLoaded(true);
      useBookingCollaborationStore.getState().setLoading(false);
      useBookingCollaborationStore.getState().setError(undefined);
    });

    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
  });

  it('G. participant change issues one new request for the new key', async () => {
    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
      item: item(),
    });

    const { rerender } = render(
      <CoachParticipantAccessPanel
        accountId="account_fixture_01"
        instructorId={INSTRUCTOR_ID}
        participantId={PARTICIPANT_ID}
      />
    );
    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
    });

    const nextParticipant = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
      item: {
        ...item(),
        participantId: nextParticipant,
        participantDisplayName: 'Child',
      },
    });

    rerender(
      <CoachParticipantAccessPanel
        accountId="account_fixture_01"
        instructorId={INSTRUCTOR_ID}
        participantId={nextParticipant}
      />
    );

    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    });
    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenLastCalledWith({
      scope: 'account_manager',
      participantId: nextParticipant,
      instructorId: INSTRUCTOR_ID,
    });
  });

  it('H. instructor change issues one new request for the new key', async () => {
    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
      item: item(),
    });

    const { rerender } = render(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );
    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
    });

    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
      item: {
        ...item(),
        instructorId: 'ins_alex',
        instructorDisplayName: 'Alex',
      },
    });

    rerender(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId="ins_alex" />
    );

    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    });
    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenLastCalledWith({
      scope: 'account_manager',
      participantId: PARTICIPANT_ID,
      instructorId: 'ins_alex',
    });
  });

  it('I. mutation follow-up performs one deliberate refetch then stays stable', async () => {
    const user = userEvent.setup();
    queryParticipantInstructorAccessReadModelsMock
      .mockResolvedValueOnce({
        scope: 'account_manager',
        item: item({
          relationship: {
            instructorRelationshipId: 'rel_revoked_01',
            revision: 3,
            status: 'revoked',
          },
        }),
      })
      .mockResolvedValueOnce({
        scope: 'account_manager',
        item: item({
          relationship: {
            instructorRelationshipId: 'rel_active_02',
            revision: 4,
            status: 'active',
          },
          authorizedActions: {
            canCreateRelationship: false,
            canRevokeRelationship: true,
            canBlock: true,
            canUnblock: false,
          },
        }),
      });

    const { rerender } = render(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'collabBlockInstructor' })).toBeInTheDocument();
    });
    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);

    blockParticipantMock.mockImplementationOnce(async () => {
      await refetchParticipantAccessRead('account_manager', PARTICIPANT_ID, INSTRUCTOR_ID);
    });
    await user.click(screen.getByRole('button', { name: 'collabBlockInstructor' }));
    await user.type(screen.getByRole('textbox'), 'Reason');
    await user.click(screen.getByRole('button', { name: 'collabBlockConfirm' }));

    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    });

    rerender(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
  });

  it('J. error stays as error without uncontrolled retry loop', async () => {
    queryParticipantInstructorAccessReadModelsMock.mockRejectedValue(new Error('access boom'));

    render(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );

    await waitFor(() => {
      const queryKey = participantInstructorAccessQueryKey(
        'account_manager',
        PARTICIPANT_ID,
        INSTRUCTOR_ID
      );
      expect(
        useBookingCollaborationStore.getState().participantAccessQueries.get(queryKey)
      ).toEqual({ status: 'error', message: 'access boom' });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
  });
});

const INSTRUCTOR_A = 'ins_X9vUp3gIrbNFWUpWsEzvLCAEh7q2';
const INSTRUCTOR_B = 'ins_elena';

function TwoInstructorTrainerPanels() {
  return (
    <>
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_A} />
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_B} />
    </>
  );
}

describe('T32.9R.UI1B preserve access across Trainer remounts', () => {
  beforeEach(() => {
    managedParticipantState.includeDependent = false;
    useBookingCollaborationStore.getState().reset();
    queryParticipantInstructorAccessReadModelsMock.mockReset();
    createRelationshipMock.mockReset();
    queryBookingProposalReadModelsMock.mockReset();
    queryBookingChangeRequestReadModelsMock.mockReset();
    queryBookingProposalReadModelsMock.mockResolvedValue({ scope: 'account_open', items: [] });
    queryBookingChangeRequestReadModelsMock.mockResolvedValue({
      scope: 'account_open',
      items: [],
    });
    queryParticipantInstructorAccessReadModelsMock.mockImplementation(
      async (input: { instructorId: string }) => ({
        scope: 'account_manager',
        item: item({
          instructorId: input.instructorId,
          instructorDisplayName: input.instructorId,
        }),
      })
    );
  });

  it('A. two instructor keys on first mount issue exactly 2 calls', async () => {
    render(<TwoInstructorTrainerPanels />);

    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    });
    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledWith({
      scope: 'account_manager',
      participantId: PARTICIPANT_ID,
      instructorId: INSTRUCTOR_A,
    });
    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledWith({
      scope: 'account_manager',
      participantId: PARTICIPANT_ID,
      instructorId: INSTRUCTOR_B,
    });
  });

  it('B. Trainer → Training → Trainer keeps total calls at 2', async () => {
    const sync = renderHook(
      ({ customerEnabled }: { customerEnabled: boolean }) =>
        useBookingCollaborationReadSync({
          customerEnabled,
          instructorEnabled: false,
          accountId: 'account_fixture_01',
        }),
      { initialProps: { customerEnabled: true } }
    );

    const { unmount } = render(<TwoInstructorTrainerPanels />);
    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    });

    // Leave coach hot path for Training: collaboration list sync disables.
    act(() => {
      sync.rerender({ customerEnabled: false });
    });
    unmount();

    // Return to Trainer: list sync re-enables, panels remount, access must stay loaded.
    act(() => {
      sync.rerender({ customerEnabled: true });
    });
    render(<TwoInstructorTrainerPanels />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    sync.unmount();
  });

  it('C. Trainer → Home → Trainer keeps total calls at 2', async () => {
    const sync = renderHook(() =>
      useBookingCollaborationReadSync({
        customerEnabled: true,
        instructorEnabled: false,
        accountId: 'account_fixture_01',
      })
    );

    const { unmount } = render(<TwoInstructorTrainerPanels />);
    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    });

    unmount();
    render(<TwoInstructorTrainerPanels />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    sync.unmount();
  });

  it('D. unrelated store update does not refetch either key', async () => {
    render(<TwoInstructorTrainerPanels />);
    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    });

    act(() => {
      useBookingCollaborationStore.getState().setLoaded(true);
      useBookingCollaborationStore.getState().resetCollaborationLists();
    });

    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    expect(
      useBookingCollaborationStore
        .getState()
        .participantAccessQueries.get(
          participantInstructorAccessQueryKey('account_manager', PARTICIPANT_ID, INSTRUCTOR_A)
        )
    ).toEqual({ status: 'loaded' });
    expect(
      useBookingCollaborationStore
        .getState()
        .participantAccessQueries.get(
          participantInstructorAccessQueryKey('account_manager', PARTICIPANT_ID, INSTRUCTOR_B)
        )
    ).toEqual({ status: 'loaded' });
  });

  it('E. mutation for instructor A refreshes A only', async () => {
    render(<TwoInstructorTrainerPanels />);
    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      await refetchParticipantAccessRead('account_manager', PARTICIPANT_ID, INSTRUCTOR_A);
    });

    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(3);
    const callsForA = queryParticipantInstructorAccessReadModelsMock.mock.calls.filter(
      (call) => (call[0] as { instructorId: string }).instructorId === INSTRUCTOR_A
    );
    const callsForB = queryParticipantInstructorAccessReadModelsMock.mock.calls.filter(
      (call) => (call[0] as { instructorId: string }).instructorId === INSTRUCTOR_B
    );
    expect(callsForA).toHaveLength(2);
    expect(callsForB).toHaveLength(1);
  });

  it('F. logout clears access query state safely', async () => {
    const { unmount } = render(<TwoInstructorTrainerPanels />);
    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    });
    unmount();

    act(() => {
      resetUserScopedStores();
    });

    expect(useBookingCollaborationStore.getState().participantAccessQueries.size).toBe(0);
    expect(useBookingCollaborationStore.getState().participantAccess.size).toBe(0);
  });

  it('G. participant change loads the new key once', async () => {
    const { rerender } = render(
      <CoachParticipantAccessPanel
        accountId="account_fixture_01"
        instructorId={INSTRUCTOR_A}
        participantId={PARTICIPANT_ID}
      />
    );
    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(1);
    });

    const nextParticipant = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    rerender(
      <CoachParticipantAccessPanel
        accountId="account_fixture_01"
        instructorId={INSTRUCTOR_A}
        participantId={nextParticipant}
      />
    );

    await waitFor(() => {
      expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenCalledTimes(2);
    });
    expect(queryParticipantInstructorAccessReadModelsMock).toHaveBeenLastCalledWith({
      scope: 'account_manager',
      participantId: nextParticipant,
      instructorId: INSTRUCTOR_A,
    });
  });
});

describe('participant-scoped instructor blocking menu', () => {
  beforeEach(() => {
    managedParticipantState.includeDependent = false;
    useBookingCollaborationStore.getState().reset();
    blockParticipantMock.mockReset();
    unblockParticipantMock.mockReset();
    queryParticipantInstructorAccessReadModelsMock.mockReset();
  });
  it('has no manual grant controls and requires a reason and confirmation for the selected dependent', async () => {
    const user = userEvent.setup();
    const dependent = 'participant_dependent';
    managedParticipantState.includeDependent = true;
    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
      item: item({ participantId: dependent }),
    });
    render(
      <CoachParticipantAccessPanel
        accountId="account_fixture_01"
        instructorId={INSTRUCTOR_ID}
        participantId={dependent}
      />
    );
    await user.click(await screen.findByRole('button', { name: 'collabBlockInstructor' }));
    expect(screen.queryByText('collabCreateRelationship')).not.toBeInTheDocument();
    expect(screen.queryByText('collabRevokeRelationship')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'collabBlockConfirm' })).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'Selected participant reason');
    expect(blockParticipantMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'collabBlockConfirm' }));
    expect(blockParticipantMock).toHaveBeenCalledWith({
      participantId: dependent,
      targetInstructorId: INSTRUCTOR_ID,
      reason: 'Selected participant reason',
      scope: 'account_manager',
      exercisedCapability: 'parent_guardian',
    });
  });
  it('only removes the manager-created block, with confirmation', async () => {
    const user = userEvent.setup();
    queryParticipantInstructorAccessReadModelsMock.mockResolvedValue({
      scope: 'account_manager',
      item: item({
        managerBlock: { participantBlockId: 'block_manager', revision: 2, status: 'active' },
        instructorBlock: { participantBlockId: 'block_instructor', revision: 3, status: 'active' },
        authorizedActions: {
          canCreateRelationship: false,
          canRevokeRelationship: false,
          canBlock: false,
          canUnblock: true,
        },
      }),
    });
    render(
      <CoachParticipantAccessPanel accountId="account_fixture_01" instructorId={INSTRUCTOR_ID} />
    );
    await user.click(await screen.findByRole('button', { name: 'collabUnblockInstructor' }));
    expect(unblockParticipantMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'collabUnblockConfirm' }));
    await waitFor(() =>
      expect(unblockParticipantMock).toHaveBeenCalledWith(
        expect.objectContaining({
          participantBlockId: 'block_manager',
          blockRevision: 2,
          participantId: PARTICIPANT_ID,
        })
      )
    );
  });
});
