import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipantPicker } from '../../src/features/participants/components/ParticipantPicker';
import { translations } from '../../src/lib/i18n/translations';
import { useBookingCollaborationStore } from '../../src/features/booking-collaboration/bookingCollaborationStore';
import {
  participantInstructorAccessKey,
  participantInstructorAccessQueryKey,
} from '../../src/features/booking-collaboration/deriveCollaborationIdempotencyKeys';
import {
  getBookingParticipantAccess,
  useBookingParticipantAccess,
} from '../../src/features/bookings/components/booking_modal/useBookingParticipantAccess';
import type { ManagedParticipantOption } from '../../src/features/lesson-bookings/lessonBookingContracts';
import type { ParticipantAccessCabinetItem } from '../../src/features/booking-collaboration/bookingCollaborationContracts';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryParticipantInstructorAccessReadModels: (...args: unknown[]) => mocks.query(...args),
}));
const instructorId = 'instructor_access_test';
const ids = ['participant_one', 'participant_two', 'participant_three'];
const participants = ids.map((participantId, i) => ({
  participantId,
  displayName: `Person ${i + 1}`,
  authority: 'self',
})) as ManagedParticipantOption[];
function setAccess(id: string, changes: Partial<ParticipantAccessCabinetItem> = {}) {
  const store = useBookingCollaborationStore.getState();
  store.mergeParticipantAccess(
    new Map([
      [
        participantInstructorAccessKey(id, instructorId),
        {
          participantId: id,
          instructorId,
          participantDisplayName: id,
          instructorDisplayName: 'Coach',
          authorizedActions: {},
          ...changes,
        } as ParticipantAccessCabinetItem,
      ],
    ])
  );
  store.setParticipantAccessQuery(
    participantInstructorAccessQueryKey('account_manager', id, instructorId),
    { status: 'loaded' }
  );
}
beforeEach(() => {
  useBookingCollaborationStore.getState().reset();
  mocks.query.mockReset().mockResolvedValue({ item: undefined });
});
describe('canonical booking participant access', () => {
  it.each(['managerBlockStatus', 'instructorBlockStatus'] as const)(
    'only active %s disables its pair',
    (field) => {
      ids.forEach((id) => setAccess(id));
      expect(getBookingParticipantAccess(ids[0], instructorId)).toBe('available');
      setAccess(ids[1], { [field]: 'active' });
      expect(ids.map((id) => getBookingParticipantAccess(id, instructorId))).toEqual([
        'available',
        'blocked',
        'available',
      ]);
      setAccess(ids[1], { [field]: 'removed' });
      expect(getBookingParticipantAccess(ids[1], instructorId)).toBe('available');
      expect(getBookingParticipantAccess(ids[1], 'instructor_other')).toBe('loading');
    }
  );
  it('fails closed while loading and on error, retries, and reacts to unblock without polling', async () => {
    let rejectRead!: (reason: Error) => void;
    mocks.query.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectRead = reject;
        })
    );
    const { result } = renderHook(() =>
      useBookingParticipantAccess(true, 'account_access_test', instructorId, [ids[0]])
    );
    expect(result.current.statuses[ids[0]]).toBe('loading');
    await act(async () => {
      rejectRead(new Error('offline'));
    });
    expect(result.current.statuses[ids[0]]).toBe('error');
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.statuses[ids[0]]).toBe('available'));
    act(() => setAccess(ids[0], { instructorBlockStatus: 'active' }));
    expect(result.current.statuses[ids[0]]).toBe('blocked');
    act(() => setAccess(ids[0], { instructorBlockStatus: 'removed' }));
    expect(result.current.statuses[ids[0]]).toBe('available');
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it('reads each participant/instructor pair once and refreshes on reopening', async () => {
    const { result, rerender } = renderHook(
      ({ open }) => useBookingParticipantAccess(open, 'account_access_test', instructorId, ids),
      { initialProps: { open: true } }
    );
    await waitFor(() =>
      expect(Object.values(result.current.statuses)).toEqual([
        'available',
        'available',
        'available',
      ])
    );
    expect(mocks.query).toHaveBeenCalledTimes(3);
    rerender({ open: false });
    rerender({ open: true });
    await waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(6));
    expect(mocks.query).toHaveBeenCalledWith({
      scope: 'account_manager',
      participantId: ids[1],
      instructorId,
    });
  });
});
describe('unavailable participant picker', () => {
  it('offers explicit removal of a selected unavailable participant', async () => {
    const remove = vi.fn();
    render(
      <ParticipantPicker
        participants={participants}
        selectedParticipantIds={[ids[1]]}
        onToggleParticipant={vi.fn()}
        loading={false}
        maxParticipants={2}
        t={(key) => key}
        unavailableParticipantReasons={{ [ids[1]]: 'Blocked' }}
        onRemoveUnavailableParticipants={remove}
      />
    );
    expect(screen.getByRole('button', { name: /Person 2/ })).toBeDisabled();
    await userEvent.click(
      screen.getByRole('button', { name: 'bookingRemoveUnavailableParticipants' })
    );
    expect(remove).toHaveBeenCalledOnce();
  });
  it.each(['ru', 'en'] as const)(
    'keeps all three visible with a portalled hover/focus tooltip in %s',
    async (language) => {
      const toggle = vi.fn();
      const t = (key: string) =>
        translations[language][key as keyof typeof translations.en] as string;
      const message = t('bookingParticipantInstructorBlocked');
      const props = {
        participants,
        selectedParticipantIds: [],
        onToggleParticipant: toggle,
        loading: false,
        maxParticipants: 3,
        t,
      };
      const { container, rerender } = render(
        <ParticipantPicker {...props} unavailableParticipantReasons={{ [ids[1]]: message }} />
      );
      const blocked = screen.getByRole('button', { name: /Person 2/ });
      expect(blocked).toBeDisabled();
      const wrapper = screen.getByRole('group', { name: 'Person 2' });
      await userEvent.hover(wrapper);
      expect(screen.getByRole('tooltip')).toHaveTextContent(message);
      expect(container.contains(screen.getByRole('tooltip'))).toBe(false);
      await userEvent.unhover(wrapper);
      expect(screen.queryByRole('tooltip')).toBeNull();
      act(() => wrapper.focus());
      expect(wrapper).toHaveAccessibleDescription(message);
      await userEvent.keyboard('{Enter} ');
      fireEvent.click(blocked);
      expect(toggle).not.toHaveBeenCalled();
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('tooltip')).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: /Person 1/ }));
      await userEvent.click(screen.getByRole('button', { name: /Person 3/ }));
      expect(toggle.mock.calls).toEqual([[ids[0]], [ids[2]]]);
      rerender(<ParticipantPicker {...props} unavailableParticipantReasons={{}} />);
      expect(screen.getByRole('button', { name: /Person 2/ })).toBeEnabled();
      await userEvent.click(screen.getByRole('button', { name: /Person 2/ }));
      expect(toggle).toHaveBeenLastCalledWith(ids[1]);
    }
  );
});
