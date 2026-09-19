import type { User } from 'firebase/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signOutService: vi.fn(),
}));

vi.mock('../../src/features/auth/authService', () => ({
  signOutService: mocks.signOutService,
}));

import { useAuthStore } from '../../src/features/auth/authStore';
import { useBookingCollaborationStore } from '../../src/features/booking-collaboration/bookingCollaborationStore';
import { useCourseEnrollmentStore } from '../../src/features/course-enrollments/courseEnrollmentStore';
import { useLessonBookingStore } from '../../src/features/lesson-bookings/lessonBookingStore';
import { useProfileStore } from '../../src/features/profile/profileStore';
import { useCabinetProgressParticipantSelectionStore } from '../../src/features/student-cabinet/cabinetProgressParticipantSelectionStore';
import { resetUserScopedStores } from '../../src/store/resetDataStores';

function firebaseUser(uid: string): User {
  return { uid } as User;
}

describe('authenticated principal switching', () => {
  beforeEach(() => {
    mocks.signOutService.mockReset();
    mocks.signOutService.mockResolvedValue(undefined);
    useAuthStore.setState({ firebaseUser: null, authLoading: false, authGeneration: 0 });
    resetUserScopedStores();
  });

  it('invalidates account A state synchronously before publishing account B', () => {
    useAuthStore.getState().setFirebaseUser(firebaseUser('account-a'));
    useProfileStore.setState({
      userProfile: {
        uid: 'account-a',
        email: 'a@example.com',
        displayName: 'Account A',
        role: 'user',
        avatarUrl: '',
      },
      profileLoading: false,
    });
    useCabinetProgressParticipantSelectionStore.setState({
      accountId: 'account-a',
      selectedParticipantId: 'participant-a',
      initialized: true,
    });
    useCourseEnrollmentStore.getState().beginScopedLoad('participant-a');
    useLessonBookingStore.getState().setLoaded(true);
    useBookingCollaborationStore.getState().setLoaded(true);

    useAuthStore.getState().setFirebaseUser(firebaseUser('account-b'));

    expect(useAuthStore.getState().firebaseUser?.uid).toBe('account-b');
    expect(useProfileStore.getState()).toMatchObject({
      userProfile: null,
      profileLoading: true,
    });
    expect(useCabinetProgressParticipantSelectionStore.getState()).toMatchObject({
      accountId: undefined,
      selectedParticipantId: undefined,
      initialized: false,
    });
    expect(useCourseEnrollmentStore.getState()).toMatchObject({
      scopedParticipantId: undefined,
      loaded: false,
    });
    expect(useLessonBookingStore.getState()).toMatchObject({ loaded: false });
    expect(useBookingCollaborationStore.getState()).toMatchObject({ loaded: false });
    expect(useAuthStore.getState().authGeneration).toBe(2);
  });

  it('supports A -> B -> A without retaining either account selection', () => {
    useAuthStore.getState().setFirebaseUser(firebaseUser('account-a'));
    useCabinetProgressParticipantSelectionStore.setState({
      accountId: 'account-a',
      selectedParticipantId: 'participant-a',
      initialized: true,
    });

    useAuthStore.getState().setFirebaseUser(firebaseUser('account-b'));
    useCabinetProgressParticipantSelectionStore.setState({
      accountId: 'account-b',
      selectedParticipantId: 'participant-b',
      initialized: true,
    });

    useAuthStore.getState().setFirebaseUser(firebaseUser('account-a'));

    expect(
      useCabinetProgressParticipantSelectionStore.getState().selectedParticipantId
    ).toBeUndefined();
    expect(useCabinetProgressParticipantSelectionStore.getState().accountId).toBeUndefined();
  });

  it('does not reset participant state for a token refresh of the same UID', () => {
    useAuthStore.getState().setFirebaseUser(firebaseUser('account-a'));
    useCabinetProgressParticipantSelectionStore.setState({
      accountId: 'account-a',
      selectedParticipantId: 'participant-a',
      initialized: true,
    });

    useAuthStore.getState().setFirebaseUser(firebaseUser('account-a'));

    expect(useCabinetProgressParticipantSelectionStore.getState().selectedParticipantId).toBe(
      'participant-a'
    );
    expect(useAuthStore.getState().authGeneration).toBe(1);
  });

  it('rejects an enrollment result started before the principal reset', () => {
    const generation = useCourseEnrollmentStore.getState().beginScopedLoad('participant-a');
    useCourseEnrollmentStore.getState().clearScopedEnrollments();

    const applied = useCourseEnrollmentStore.getState().applyScopedItems({
      participantId: 'participant-a',
      generation,
      incoming: new Map(),
      mode: 'replace',
    });

    expect(applied).toBe(false);
    expect(useCourseEnrollmentStore.getState().scopedParticipantId).toBeUndefined();
  });

  it('invalidates the local principal before Firebase sign-out drops the ID token', async () => {
    useAuthStore.getState().setFirebaseUser(firebaseUser('account-a'));
    useProfileStore.setState({
      userProfile: {
        uid: 'account-a',
        email: 'a@example.com',
        displayName: 'Account A',
        role: 'user',
        avatarUrl: '',
      },
      profileLoading: false,
    });

    let uidWhileSigningOut: string | null | undefined = 'unset';
    mocks.signOutService.mockImplementation(async () => {
      uidWhileSigningOut = useAuthStore.getState().firebaseUser?.uid ?? null;
    });

    await useAuthStore.getState().handleSignOut();

    expect(uidWhileSigningOut).toBeNull();
    expect(useAuthStore.getState().firebaseUser).toBeNull();
    expect(useProfileStore.getState().userProfile).toBeNull();
    expect(mocks.signOutService).toHaveBeenCalledOnce();
  });
});
