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
import { isLiveCompatibleIdentity } from '../../../lib/canonical/liveCompatibleClientRead';

/** Lazy users directory for the admin workspace. */
export const useUsersSync = () => {
  const { shouldSyncUsersList } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useProfileStore((s) => s.userProfile);
  const usersPageSize = useProfileStore((s) => s.usersPageSize);
  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    useProfileStore.getState().resetUsersPagination();
  }, [firebaseUser?.uid, shouldSyncUsersList, userProfile?.role]);

  useEffect(() => {
    if (!firebaseUser || !shouldSyncUsersList || !isAdmin) {
      useProfileStore.getState().setUsersList([]);
      return;
    }

    return onSnapshot(
      query(collection(db, 'users'), limit(usersPageSize + 1)),
      (snapshot) => {
        const users = snapshot.docs
          .slice(0, usersPageSize)
          .filter((userDoc) => userDoc.id !== 'school_global_stats')
          .flatMap((userDoc) => {
            const data = userDoc.data();
            if (!isLiveCompatibleIdentity(data)) return [];
            const profile = toUserProfile(data, userDoc.id);
            return profile ? [profile] : [];
          });
        useProfileStore.getState().setUsersList(users);
        useProfileStore.getState().setUsersHasMore(snapshot.docs.length > usersPageSize);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );
  }, [firebaseUser, isAdmin, shouldSyncUsersList, usersPageSize]);
};
