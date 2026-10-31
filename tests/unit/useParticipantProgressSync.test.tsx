import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useParticipantProgressStore } from '../../src/features/participant-progress/participantProgressStore';

const mocks = vi.hoisted(() => ({
  authUid: 'pending-account' as string | null,
  profileUid: null as string | null,
  readyUid: null as string | null,
  pathname: '/' as string,
  refreshManaged: vi.fn(),
  refreshInstructor: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../src/features/auth/authStore', () => ({
  useAuthStore: (selector: (state: { firebaseUser: { uid: string } | null }) => unknown) =>
    selector({ firebaseUser: mocks.authUid ? { uid: mocks.authUid } : null }),
}));

vi.mock('../../src/features/profile/profileStore', () => ({
  useProfileStore: (
    selector: (state: {
      userProfile: { uid: string } | null;
      canonicalReadyAccountId: string | null;
    }) => unknown
  ) =>
    selector({
      userProfile: mocks.profileUid ? { uid: mocks.profileUid } : null,
      canonicalReadyAccountId: mocks.readyUid,
    }),
}));

vi.mock('../../src/features/booking-collaboration/bookingCollaborationStore', () => ({
  selectInstructorLessonBookings: (state: { lessonBookings: unknown[] }) => state.lessonBookings,
  useBookingCollaborationStore: (
    selector: (state: { lessonBookings: unknown[]; participantAccess: unknown[] }) => unknown
  ) => selector({ lessonBookings: [], participantAccess: [] }),
}));

vi.mock('../../src/features/booking-collaboration/useLessonStartClock', () => ({
  useLessonStartClock: () => 0,
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: mocks.pathname }),
}));

vi.mock('../../src/features/participant-progress/participantProgressService', () => ({
  refreshManagedParticipantProgress: mocks.refreshManaged,
  refreshInstructorParticipantProgress: mocks.refreshInstructor,
}));

vi.mock('../../src/shared', () => ({ logger: { warn: mocks.warn } }));

import { useParticipantProgressSync } from '../../src/features/participant-progress/useParticipantProgressSync';

describe('useParticipantProgressSync account readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUid = 'pending-account';
    mocks.profileUid = null;
    mocks.readyUid = null;
    mocks.pathname = '/';
    mocks.refreshManaged.mockResolvedValue([]);
    mocks.refreshInstructor.mockResolvedValue([]);
    useParticipantProgressStore.getState().clear();
  });

  it('does not query managed progress while an email-unverified signup has no Account', () => {
    renderHook(() => useParticipantProgressSync());
    expect(mocks.refreshManaged).not.toHaveBeenCalled();
    expect(mocks.refreshInstructor).not.toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it('waits for canonical initialization after the matching profile arrives', async () => {
    const { rerender } = renderHook(() => useParticipantProgressSync());
    expect(mocks.refreshManaged).not.toHaveBeenCalled();

    mocks.profileUid = 'pending-account';
    rerender();
    expect(mocks.refreshManaged).not.toHaveBeenCalled();

    mocks.readyUid = 'pending-account';
    rerender();
    await waitFor(() => expect(mocks.refreshManaged).toHaveBeenCalledTimes(1));
    expect(mocks.refreshInstructor).not.toHaveBeenCalled();
  });

  it("never reads a previous principal's progress during an account switch", async () => {
    mocks.profileUid = 'old-account';
    const { rerender } = renderHook(() => useParticipantProgressSync());
    expect(mocks.refreshManaged).not.toHaveBeenCalled();

    mocks.profileUid = 'pending-account';
    mocks.readyUid = 'pending-account';
    rerender();
    await waitFor(() => expect(mocks.refreshManaged).toHaveBeenCalledTimes(1));

    mocks.authUid = 'next-account';
    rerender();
    expect(mocks.refreshManaged).toHaveBeenCalledTimes(1);
  });

  it('retains sign-out cleanup', () => {
    mocks.authUid = null;
    useParticipantProgressStore.getState().setItems([]);
    expect(useParticipantProgressStore.getState().loaded).toBe(true);

    renderHook(() => useParticipantProgressSync());

    expect(mocks.refreshManaged).not.toHaveBeenCalled();
    expect(useParticipantProgressStore.getState().loaded).toBe(false);
  });
});
