import type { User } from 'firebase/auth';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useProfileStore } from '../../src/features/profile/profileStore';
import { resetUserScopedStores } from '../../src/store/resetDataStores';
import type { UserProfile } from '../../src/types';

const mocks = vi.hoisted(() => ({
  ensureCanonicalSelfParticipant: vi.fn(),
  queryManagedParticipantPickerReadModels: vi.fn(),
}));

vi.mock('../../src/lib/canonical/canonicalAccountProvisioningClient', () => ({
  ensureCanonicalSelfParticipant: mocks.ensureCanonicalSelfParticipant,
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryManagedParticipantPickerReadModels: mocks.queryManagedParticipantPickerReadModels,
}));

import { useManagedParticipants } from '../../src/features/lesson-bookings/useManagedParticipants';

const selfItem = {
  participantId: 'participant_self',
  participantManagementId: 'management_self',
  displayName: 'Self Client',
  discipline: 'ski' as const,
  skillLevel: 'beginner',
  age: { kind: 'age_years' as const, years: 18 },
  authority: 'self' as const,
  revision: 1,
};

const otherItem = {
  ...selfItem,
  participantId: 'participant_b',
  participantManagementId: 'management_b',
  displayName: 'Account B',
};

function firebaseUser(uid: string): User {
  return { uid } as User;
}

function profileFor(uid: string): UserProfile {
  return {
    uid,
    email: `${uid}@example.com`,
    displayName: uid,
    role: 'user',
    avatarUrl: '',
  };
}

function seedAuthenticatedProfile(uid: string) {
  useAuthStore.getState().setFirebaseUser(firebaseUser(uid));
  useProfileStore.setState({
    userProfile: profileFor(uid),
    profileLoading: false,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useManagedParticipants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ firebaseUser: null, authLoading: false, authGeneration: 0 });
    resetUserScopedStores();
    mocks.ensureCanonicalSelfParticipant.mockResolvedValue(undefined);
    mocks.queryManagedParticipantPickerReadModels.mockResolvedValue({ items: [selfItem] });
  });

  it('provisions through the canonical command before loading the picker', async () => {
    seedAuthenticatedProfile('account_self');
    const { result } = renderHook(() => useManagedParticipants('account_self'));

    await waitFor(() => expect(result.current.participants).toHaveLength(1));
    expect(result.current.loading).toBe(false);
    expect(mocks.ensureCanonicalSelfParticipant).toHaveBeenCalledWith('account_self');
    expect(mocks.queryManagedParticipantPickerReadModels).toHaveBeenCalledWith({});
    expect(mocks.ensureCanonicalSelfParticipant.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.queryManagedParticipantPickerReadModels.mock.invocationCallOrder[0]!
    );
    expect(result.current.participants).toEqual([
      {
        participantId: 'participant_self',
        participantManagementId: 'management_self',
        displayName: 'Self Client',
        discipline: 'ski',
        skillLevel: 'beginner',
        age: { kind: 'age_years', years: 18 },
        authority: 'self',
        revision: 1,
      },
    ]);
  });

  it('H. does not issue a picker read while Firebase Auth is resolved but profile is pending', async () => {
    useAuthStore.getState().setFirebaseUser(firebaseUser('account_self'));
    const { result } = renderHook(() => useManagedParticipants('account_self'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(useProfileStore.getState().userProfile).toBeNull();
    expect(mocks.ensureCanonicalSelfParticipant).not.toHaveBeenCalled();
    expect(mocks.queryManagedParticipantPickerReadModels).not.toHaveBeenCalled();
    expect(result.current.participants).toEqual([]);
  });

  it('I. issues an authenticated picker read after profile success and provisioning', async () => {
    seedAuthenticatedProfile('account_self');
    const { result } = renderHook(() => useManagedParticipants('account_self'));

    await waitFor(() => expect(result.current.participants).toHaveLength(1));
    expect(mocks.ensureCanonicalSelfParticipant).toHaveBeenCalledWith('account_self');
    expect(mocks.queryManagedParticipantPickerReadModels).toHaveBeenCalledWith({});
  });

  it('J. drops a stale picker request after profile parse failure', async () => {
    const picker = deferred<{ items: (typeof selfItem)[] }>();
    mocks.queryManagedParticipantPickerReadModels.mockReturnValue(picker.promise);
    seedAuthenticatedProfile('account_self');
    const { result } = renderHook(() => useManagedParticipants('account_self'));

    await waitFor(() => expect(mocks.ensureCanonicalSelfParticipant).toHaveBeenCalledOnce());
    act(() => {
      useProfileStore.getState().resetProfileState();
    });
    picker.resolve({ items: [selfItem] });

    await waitFor(() => expect(result.current.participants).toEqual([]));
    expect(result.current.loading).toBe(false);
  });

  it('K. never executes B picker under A or null auth after a direct A → B switch', async () => {
    const pickerA = deferred<{ items: (typeof selfItem)[] }>();
    mocks.queryManagedParticipantPickerReadModels.mockReturnValueOnce(pickerA.promise);
    mocks.queryManagedParticipantPickerReadModels.mockResolvedValue({ items: [otherItem] });

    seedAuthenticatedProfile('account_a');
    const { result, rerender } = renderHook(
      ({ accountId }: { accountId: string | undefined }) => useManagedParticipants(accountId),
      { initialProps: { accountId: 'account_a' } }
    );

    await waitFor(() =>
      expect(mocks.ensureCanonicalSelfParticipant).toHaveBeenCalledWith('account_a')
    );

    act(() => {
      useAuthStore.getState().setFirebaseUser(null);
    });
    rerender({ accountId: undefined });
    await act(async () => {
      pickerA.resolve({ items: [selfItem] });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.participants).toEqual([]));
    expect(mocks.queryManagedParticipantPickerReadModels).toHaveBeenCalledTimes(1);

    seedAuthenticatedProfile('account_b');
    rerender({ accountId: 'account_b' });

    await waitFor(() => expect(result.current.participants[0]?.displayName).toBe('Account B'));
    expect(mocks.ensureCanonicalSelfParticipant).toHaveBeenLastCalledWith('account_b');
    expect(mocks.queryManagedParticipantPickerReadModels).toHaveBeenCalledTimes(2);
  });

  it('L. delayed A picker response cannot populate B participant state', async () => {
    const pickerA = deferred<{ items: (typeof selfItem)[] }>();
    mocks.queryManagedParticipantPickerReadModels.mockReturnValueOnce(pickerA.promise);
    mocks.queryManagedParticipantPickerReadModels.mockResolvedValue({ items: [otherItem] });

    seedAuthenticatedProfile('account_a');
    const { result, rerender } = renderHook(
      ({ accountId }: { accountId: string | undefined }) => useManagedParticipants(accountId),
      { initialProps: { accountId: 'account_a' } }
    );

    await waitFor(() =>
      expect(mocks.ensureCanonicalSelfParticipant).toHaveBeenCalledWith('account_a')
    );

    act(() => {
      useAuthStore.getState().setFirebaseUser(firebaseUser('account_b'));
    });
    rerender({ accountId: undefined });
    act(() => {
      useProfileStore.setState({
        userProfile: profileFor('account_b'),
        profileLoading: false,
      });
    });
    rerender({ accountId: 'account_b' });

    await waitFor(() => expect(result.current.participants[0]?.displayName).toBe('Account B'));
    await act(async () => {
      pickerA.resolve({ items: [selfItem] });
      await Promise.resolve();
    });

    expect(result.current.participants).toEqual([
      {
        participantId: 'participant_b',
        participantManagementId: 'management_b',
        displayName: 'Account B',
        discipline: 'ski',
        skillLevel: 'beginner',
        age: { kind: 'age_years', years: 18 },
        authority: 'self',
        revision: 1,
      },
    ]);
  });
});
