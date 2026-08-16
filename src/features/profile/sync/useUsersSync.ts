import { useEffect } from 'react';
import {
  collection,
  db,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  query,
} from '../../../lib/firebase';
import { QUERY_LIMITS } from '../../../lib/queryLimits';
import { UserProfile } from '../../../types';
import { useAuthStore } from '../../auth/authStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { useProfileStore } from '../profileStore';

/** Lazy users directory for admin and instructor workspaces. */
export const useUsersSync = () => {
  const { shouldSyncUsersList } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useProfileStore((s) => s.userProfile);

  useEffect(() => {
    const canReadUsers =
      (userProfile?.role === 'admin' || Boolean(userProfile?.instructorId)) && shouldSyncUsersList;
    if (!firebaseUser || !canReadUsers) {
      useProfileStore.getState().setUsersList([]);
      return;
    }

    return onSnapshot(
      query(collection(db, 'users'), limit(QUERY_LIMITS.users)),
      (snapshot) => {
        const users = snapshot.docs
          .filter((userDoc) => userDoc.id !== 'school_global_stats')
          .map((userDoc) => userDoc.data() as UserProfile);
        useProfileStore.getState().setUsersList(users);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users')
    );
  }, [firebaseUser, userProfile?.instructorId, userProfile?.role, shouldSyncUsersList]);
};
