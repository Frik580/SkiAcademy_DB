import { useEffect } from 'react';
import {
  collection,
  db,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  query,
} from '../../../infrastructure/firebase';
import { toUserProfile } from '../../../infrastructure/firebase';
import { useAuthStore } from '../../auth/authStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { useProfileStore } from '../profileStore';

/** Lazy users directory for admin and instructor workspaces. */
export const useUsersSync = () => {
  const { shouldSyncUsersList } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useProfileStore((s) => s.userProfile);
  const usersPageSize = useProfileStore((s) => s.usersPageSize);

  useEffect(() => {
    useProfileStore.getState().resetUsersPagination();
  }, [firebaseUser?.uid, shouldSyncUsersList, userProfile?.instructorId, userProfile?.role]);

  useEffect(() => {
    const canReadUsers =
      (userProfile?.role === 'admin' || Boolean(userProfile?.instructorId)) && shouldSyncUsersList;
    if (!firebaseUser || !canReadUsers) {
      useProfileStore.getState().setUsersList([]);
      return;
    }

    return onSnapshot(
      query(collection(db, 'users'), limit(usersPageSize + 1)),
      (snapshot) => {
        const users = snapshot.docs
          .slice(0, usersPageSize)
          .filter((userDoc) => userDoc.id !== 'school_global_stats')
          .map((userDoc) => toUserProfile(userDoc.data()));
        useProfileStore.getState().setUsersList(users);
        useProfileStore.getState().setUsersHasMore(snapshot.docs.length > usersPageSize);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );
  }, [
    firebaseUser,
    userProfile?.instructorId,
    userProfile?.role,
    shouldSyncUsersList,
    usersPageSize,
  ]);
};
