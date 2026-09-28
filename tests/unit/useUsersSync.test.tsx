import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '../../src/types';

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn((_db: unknown, path: string) => ({ kind: 'collection', path })),
  doc: vi.fn((_db: unknown, collectionPath: string, id: string) => ({
    kind: 'document',
    path: `${collectionPath}/${id}`,
  })),
  limit: vi.fn((count: number) => ({ kind: 'limit', count })),
  onSnapshot: vi.fn(),
  query: vi.fn((collectionRef: unknown, ...constraints: unknown[]) => ({
    kind: 'query',
    collectionRef,
    constraints,
  })),
}));

vi.mock('../../src/infrastructure/firebase', async () => {
  const actual = await vi.importActual<typeof import('../../src/infrastructure/firebase')>(
    '../../src/infrastructure/firebase'
  );
  return {
    ...actual,
    collection: firestoreMocks.collection,
    doc: firestoreMocks.doc,
    limit: firestoreMocks.limit,
    onSnapshot: firestoreMocks.onSnapshot,
    query: firestoreMocks.query,
  };
});

import { db } from '../../src/infrastructure/firebase';
import { useAuthStore } from '../../src/features/auth/authStore';
import { useCurrentUserProfileSync } from '../../src/features/profile/sync/useCurrentUserProfileSync';
import { useProfileStore } from '../../src/features/profile/profileStore';
import { useUsersSync } from '../../src/features/profile/sync/useUsersSync';

const adminInstructorProfile: UserProfile = {
  uid: 'account_admin_instructor_sync',
  email: 'admin-instructor@example.com',
  role: 'admin',
  isInstructor: true,
  instructorId: 'instructor_sync_01',
  displayName: 'Admin Instructor',
  avatarUrl: '',
};

function routerWrapper(initialPath: string) {
  const navigation: { current?: ReturnType<typeof useNavigate> } = {};
  const Wrapper = ({ children }: PropsWithChildren) => (
    <MemoryRouter initialEntries={[initialPath]}>
      <NavigationCapture navigation={navigation} />
      {children}
    </MemoryRouter>
  );
  return { Wrapper, navigation };
}

function NavigationCapture({
  navigation,
}: {
  navigation: { current?: ReturnType<typeof useNavigate> };
}) {
  navigation.current = useNavigate();
  return null;
}

describe('users sync scope and teardown', () => {
  beforeEach(() => {
    firestoreMocks.collection.mockClear();
    firestoreMocks.doc.mockClear();
    firestoreMocks.limit.mockClear();
    firestoreMocks.onSnapshot.mockReset();
    firestoreMocks.query.mockClear();
    firestoreMocks.onSnapshot.mockReturnValue(vi.fn());
    useAuthStore.setState({ firebaseUser: null } as never);
    useProfileStore.setState({
      userProfile: null,
      usersList: [],
    });
    useProfileStore.getState().resetUsersPagination();
  });

  it('does not request the broad users collection on the instructor route', async () => {
    useAuthStore.setState({ firebaseUser: { uid: adminInstructorProfile.uid } } as never);
    useProfileStore.setState({
      userProfile: adminInstructorProfile,
      usersList: [{ ...adminInstructorProfile, uid: 'stale-user' }],
    });
    const { Wrapper } = routerWrapper('/instructor');

    renderHook(() => useUsersSync(), { wrapper: Wrapper });

    await waitFor(() => expect(useProfileStore.getState().usersList).toEqual([]));
    expect(firestoreMocks.collection).not.toHaveBeenCalled();
    expect(firestoreMocks.onSnapshot).not.toHaveBeenCalled();
  });

  it('keeps the paged users directory on Admin and unsubscribes when switching to Instructor', async () => {
    const unsubscribe = vi.fn();
    firestoreMocks.onSnapshot.mockReturnValue(unsubscribe);
    useAuthStore.setState({ firebaseUser: { uid: adminInstructorProfile.uid } } as never);
    useProfileStore.setState({ userProfile: adminInstructorProfile });
    const { Wrapper, navigation } = routerWrapper('/admin');
    const hook = renderHook(() => useUsersSync(), { wrapper: Wrapper });

    await waitFor(() => expect(firestoreMocks.onSnapshot).toHaveBeenCalled());
    const activeSnapshotCount = firestoreMocks.onSnapshot.mock.calls.length;
    const usersQueries = firestoreMocks.onSnapshot.mock.calls.map(
      ([usersQuery]) =>
        usersQuery as { collectionRef: { path: string }; constraints: Array<{ count?: number }> }
    );
    expect(usersQueries.length).toBeGreaterThan(0);
    for (const usersQuery of usersQueries) {
      expect(usersQuery.collectionRef.path).toBe('users');
      expect(usersQuery.constraints[0]).toEqual({
        kind: 'limit',
        count: useProfileStore.getState().usersPageSize + 1,
      });
    }

    act(() => navigation.current?.('/instructor'));

    await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(activeSnapshotCount));
    await waitFor(() => expect(useProfileStore.getState().usersList).toEqual([]));
    expect(firestoreMocks.onSnapshot).toHaveBeenCalledTimes(activeSnapshotCount);
    hook.unmount();
  });

  it('unsubscribes the users directory and clears it on logout', async () => {
    const unsubscribe = vi.fn();
    firestoreMocks.onSnapshot.mockReturnValue(unsubscribe);
    useAuthStore.setState({ firebaseUser: { uid: adminInstructorProfile.uid } } as never);
    useProfileStore.setState({ userProfile: adminInstructorProfile });
    const { Wrapper } = routerWrapper('/admin');
    const hook = renderHook(() => useUsersSync(), { wrapper: Wrapper });
    await waitFor(() => expect(firestoreMocks.onSnapshot).toHaveBeenCalled());
    const activeSnapshotCount = firestoreMocks.onSnapshot.mock.calls.length;

    act(() => useAuthStore.setState({ firebaseUser: null } as never));

    await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(activeSnapshotCount));
    await waitFor(() => expect(useProfileStore.getState().usersList).toEqual([]));
    hook.unmount();
  });

  it('keeps the current account profile read on its own users document', async () => {
    useAuthStore.setState({ firebaseUser: { uid: adminInstructorProfile.uid } } as never);

    renderHook(() => useCurrentUserProfileSync());

    await waitFor(() => expect(firestoreMocks.doc).toHaveBeenCalledTimes(1));
    expect(firestoreMocks.doc).toHaveBeenCalledWith(db, 'users', adminInstructorProfile.uid);
    expect(firestoreMocks.collection).not.toHaveBeenCalled();
  });
});
