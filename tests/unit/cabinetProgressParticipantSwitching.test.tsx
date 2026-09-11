import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import { ParticipantPicker } from '../../src/features/participants/components/ParticipantPicker';
import {
  applyParticipantProgressToProfile,
  overlaySelfParticipantProgress,
  resolveSelfParticipantIdFromAccount,
  selectCabinetProgressView,
  type ParticipantProgressView,
} from '../../src/features/participant-progress/applyParticipantProgressToProfile';
import {
  nextCabinetProgressParticipantId,
  reconcileCabinetProgressParticipantId,
  resolveInitialCabinetProgressParticipantId,
} from '../../src/features/student-cabinet/cabinetProgressParticipantSelection';
import { useCabinetProgressParticipantSelection } from '../../src/features/student-cabinet/useCabinetProgressParticipantSelection';
import type { UserProfile } from '../../src/types';

const selfParticipant: ManagedParticipantOption = {
  participantId: 'participant_self',
  participantManagementId: 'management_self',
  displayName: 'Self',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 30 },
  authority: 'self',
  revision: 1,
};

const childA: ManagedParticipantOption = {
  participantId: 'participant_child_a',
  participantManagementId: 'management_child_a',
  displayName: 'Child A',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 8 },
  authority: 'parent_guardian',
  revision: 1,
};

const childB: ManagedParticipantOption = {
  participantId: 'participant_child_b',
  participantManagementId: 'management_child_b',
  displayName: 'Child B',
  discipline: 'ski',
  skillLevel: 'beginner',
  age: { kind: 'age_years', years: 10 },
  authority: 'parent_guardian',
  revision: 1,
};

const family = [selfParticipant, childA, childB];
const dependentsOnly = [childA, childB];

const profile = {
  uid: 'account_cabinet_01',
  email: 'self@example.com',
  displayName: 'Self',
  role: 'user',
  avatarUrl: '',
  balanceUSD: 0,
  isClientActive: true,
  level: 4,
  skillScores: { carving: 99 },
  skillComments: { carving: 'Account leftover' },
} as UserProfile;

function progress(participantId: string, level: number, skillId: string): ParticipantProgressView {
  return {
    participantId,
    level,
    skillScores: { [skillId]: level * 10 },
    skillComments: { [skillId]: `${participantId} note` },
    revision: level,
  };
}

function CabinetSwitcher(props: {
  readonly participants: readonly ManagedParticipantOption[];
  readonly loading?: boolean;
  readonly accountId?: string;
}) {
  const { selectedParticipantId, selectParticipant } = useCabinetProgressParticipantSelection({
    accountId: props.accountId ?? 'account_cabinet_01',
    participants: props.participants,
    loading: props.loading ?? false,
  });
  return (
    <div>
      <div data-testid="selected">{selectedParticipantId ?? ''}</div>
      <ParticipantPicker
        participants={props.participants}
        selectedParticipantIds={selectedParticipantId ? [selectedParticipantId] : []}
        onToggleParticipant={selectParticipant}
        loading={props.loading ?? false}
        selectionMode="single"
        t={(key) => key}
      />
    </div>
  );
}

describe('cabinet progress participant switching', () => {
  it('1. auto-selects the sole managed participant', () => {
    expect(resolveInitialCabinetProgressParticipantId([selfParticipant])).toBe('participant_self');
    expect(resolveInitialCabinetProgressParticipantId([childA])).toBe('participant_child_a');
  });

  it('2. selects self on first init when self and children exist', () => {
    expect(resolveInitialCabinetProgressParticipantId(family)).toBe('participant_self');
    expect(
      nextCabinetProgressParticipantId({
        participants: family,
        selectedParticipantId: undefined,
        initialized: false,
      })
    ).toEqual({ selectedParticipantId: 'participant_self', initialized: true });
  });

  it('3. leaves selection empty for 2+ without self', () => {
    expect(resolveInitialCabinetProgressParticipantId(dependentsOnly)).toBeUndefined();
  });

  it('4. keeps a user-selected child after rerender', () => {
    expect(
      nextCabinetProgressParticipantId({
        participants: family,
        selectedParticipantId: 'participant_child_a',
        initialized: true,
      }).selectedParticipantId
    ).toBe('participant_child_a');
  });

  it('5. allows self → child A → child B → self', () => {
    let selected: string | undefined = 'participant_self';
    selected = nextCabinetProgressParticipantId({
      participants: family,
      selectedParticipantId: 'participant_child_a',
      initialized: true,
    }).selectedParticipantId;
    expect(selected).toBe('participant_child_a');
    selected = nextCabinetProgressParticipantId({
      participants: family,
      selectedParticipantId: 'participant_child_b',
      initialized: true,
    }).selectedParticipantId;
    expect(selected).toBe('participant_child_b');
    selected = nextCabinetProgressParticipantId({
      participants: family,
      selectedParticipantId: 'participant_self',
      initialized: true,
    }).selectedParticipantId;
    expect(selected).toBe('participant_self');
  });

  it('6. preserves selection when the managed set is refetched with the same ids', () => {
    const afterRefetch = nextCabinetProgressParticipantId({
      participants: [...family],
      selectedParticipantId: 'participant_child_b',
      initialized: true,
    });
    expect(afterRefetch.selectedParticipantId).toBe('participant_child_b');
  });

  it('7. does not treat a progress refetch as a reason to reset selection', () => {
    const { result, rerender } = renderHook(
      (props: { participants: readonly ManagedParticipantOption[] }) =>
        useCabinetProgressParticipantSelection({
          accountId: 'account_cabinet_01',
          participants: props.participants,
          loading: false,
        }),
      { initialProps: { participants: family } }
    );

    act(() => {
      result.current.selectParticipant('participant_child_a');
    });
    rerender({ participants: family });
    expect(result.current.selectedParticipantId).toBe('participant_child_a');
  });

  it('8. falls back to self when the selected participant is removed', () => {
    expect(
      reconcileCabinetProgressParticipantId('participant_child_b', [selfParticipant, childA])
    ).toBe('participant_self');
  });

  it('9. falls back to empty when the selected participant is removed and there is no self', () => {
    expect(reconcileCabinetProgressParticipantId('participant_child_b', [childA])).toBe(
      'participant_child_a'
    );
    expect(
      reconcileCabinetProgressParticipantId('participant_removed', [childA, childB])
    ).toBeUndefined();
  });

  it('10. never falls back to the first participant for 2+ without self', () => {
    expect(resolveInitialCabinetProgressParticipantId(dependentsOnly)).not.toBe(
      dependentsOnly[0]?.participantId
    );
    expect(
      nextCabinetProgressParticipantId({
        participants: dependentsOnly,
        selectedParticipantId: undefined,
        initialized: true,
      }).selectedParticipantId
    ).toBeUndefined();
  });

  it('11-14. switches self ↔ children in the picker without reload APIs', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const assign = vi.fn();
    const replace = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      reload,
      assign,
      replace,
      href: 'http://localhost/cabinet',
    });

    const { rerender } = render(<CabinetSwitcher participants={family} />);
    expect(screen.getByTestId('selected').textContent).toBe('participant_self');

    await user.click(screen.getByRole('button', { name: /Child A/i }));
    expect(screen.getByTestId('selected').textContent).toBe('participant_child_a');
    expect(screen.getByRole('button', { name: /Child B/i })).not.toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Child B/i }));
    expect(screen.getByTestId('selected').textContent).toBe('participant_child_b');

    await user.click(screen.getByRole('button', { name: /Self/i }));
    expect(screen.getByTestId('selected').textContent).toBe('participant_self');

    rerender(<CabinetSwitcher participants={family} />);
    expect(screen.getByTestId('selected').textContent).toBe('participant_self');
    expect(reload).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('14. cabinet shell does not reload or route-refresh to switch participants', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const shell = readFileSync(
      join(here, '../../src/features/student-cabinet/components/student/StudentCabinetShell.tsx'),
      'utf8'
    );
    const hook = readFileSync(
      join(here, '../../src/features/student-cabinet/useCabinetProgressParticipantSelection.ts'),
      'utf8'
    );
    expect(shell).toContain('selectionMode="single"');
    expect(shell).toContain('selectParticipant');
    expect(shell).not.toMatch(/location\.reload|router\.refresh|window\.location\.href\s*=/);
    expect(hook).not.toMatch(/location\.reload|router\.refresh|navigate\(/);
  });

  it('15-17. switching changes level, radar scores, and comments source', () => {
    const byId = {
      participant_self: progress('participant_self', 3, 'carving'),
      participant_child_a: progress('participant_child_a', 2, 'balance'),
    };
    const selfProfile = applyParticipantProgressToProfile(
      profile,
      selectCabinetProgressView(byId, 'participant_self')
    );
    const childProfile = applyParticipantProgressToProfile(
      profile,
      selectCabinetProgressView(byId, 'participant_child_a')
    );
    expect(selfProfile.level).toBe(3);
    expect(childProfile.level).toBe(2);
    expect(selfProfile.skillScores).toEqual({ carving: 30 });
    expect(childProfile.skillScores).toEqual({ balance: 20 });
    expect(selfProfile.skillComments).toEqual({ carving: 'participant_self note' });
    expect(childProfile.skillComments).toEqual({ balance: 'participant_child_a note' });
  });

  it('18. does not leak another participant cached row into the selected view', () => {
    const leaked = selectCabinetProgressView(
      {
        participant_self: progress('participant_self', 3, 'carving'),
        participant_child_a: {
          ...progress('participant_child_a', 2, 'balance'),
          participantId: 'participant_self',
        },
      },
      'participant_child_a'
    );
    expect(leaked?.participantId).toBe('participant_child_a');
    expect(leaked?.level).toBe(1);
    expect(leaked?.skillScores).toEqual({});
  });

  it('19. a slow update for the previous participant does not override the new selection', () => {
    const afterSwitch = {
      participant_self: progress('participant_self', 3, 'carving'),
      participant_child_a: progress('participant_child_a', 2, 'balance'),
    };
    const lateSelf = {
      ...afterSwitch,
      participant_self: progress('participant_self', 4, 'carving'),
    };
    const selected = selectCabinetProgressView(lateSelf, 'participant_child_a');
    expect(selected?.participantId).toBe('participant_child_a');
    expect(selected?.level).toBe(2);
    expect(selected?.skillScores).not.toEqual({ carving: 40 });
  });

  it('20. while the next participant is missing from cache, previous data is not shown', () => {
    const overlay = applyParticipantProgressToProfile(
      profile,
      selectCabinetProgressView(
        { participant_self: progress('participant_self', 3, 'carving') },
        'participant_child_a'
      )
    );
    expect(overlay.level).toBe(1);
    expect(overlay.skillScores).toEqual({});
    expect(overlay.skillComments).toEqual({});
    expect(overlay.skillScores).not.toEqual({ carving: 30 });
  });

  it('21. navbar self overlay does not reset cabinet selection', () => {
    const { result } = renderHook(() =>
      useCabinetProgressParticipantSelection({
        accountId: 'account_cabinet_01',
        participants: family,
        loading: false,
      })
    );
    act(() => {
      result.current.selectParticipant('participant_child_a');
    });
    const selfId = resolveSelfParticipantIdFromAccount(profile.uid);
    expect(selfId).toBeTruthy();
    const navbarProfile = overlaySelfParticipantProgress(profile, {
      [selfId!]: progress(selfId!, 3, 'carving'),
    });
    expect(navbarProfile.level).toBe(3);
    expect(result.current.selectedParticipantId).toBe('participant_child_a');
  });

  it('keeps other participants enabled in single selection mode after a choice', async () => {
    const user = userEvent.setup();
    render(
      <ParticipantPicker
        participants={family}
        selectedParticipantIds={['participant_self']}
        onToggleParticipant={() => undefined}
        loading={false}
        selectionMode="single"
        maxParticipants={1}
        t={(key) => key}
      />
    );
    expect(screen.getByRole('button', { name: /Child A/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Child B/i })).not.toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Child A/i }));
  });

  it('booking multi-select still disables unselected options at max=1', () => {
    render(
      <ParticipantPicker
        participants={family}
        selectedParticipantIds={['participant_self']}
        onToggleParticipant={() => undefined}
        loading={false}
        maxParticipants={1}
        t={(key) => key}
      />
    );
    expect(screen.getByRole('button', { name: /Child A/i })).toBeDisabled();
  });

  it('waits for the first non-empty managed set before initializing', () => {
    const { result, rerender } = renderHook(
      (props: { participants: readonly ManagedParticipantOption[]; loading: boolean }) =>
        useCabinetProgressParticipantSelection({
          accountId: 'account_cabinet_01',
          participants: props.participants,
          loading: props.loading,
        }),
      { initialProps: { participants: [] as ManagedParticipantOption[], loading: true } }
    );
    expect(result.current.selectedParticipantId).toBeUndefined();
    rerender({ participants: family, loading: false });
    expect(result.current.selectedParticipantId).toBe('participant_self');
  });
});
