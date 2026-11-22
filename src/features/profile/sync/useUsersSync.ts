import { subscribeScopedDocuments } from '../../../lib/canonical/scopedClientDocuments';
import { useEffect } from 'react';
import { handleFirestoreError, OperationType } from '../../../infrastructure/firebase';
import { toUserProfile } from '../../../infrastructure/firebase';
import { useAuthStore } from '../../auth/authStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { useProfileStore } from '../profileStore';
import { isLiveCompatibleIdentity } from '../../../lib/canonical/liveCompatibleClientRead';

/** Lazy users directory for the admin workspace. */
export const useUsersSync = () => {
  const { shouldSyncUsersList } = useDataSyncScope();
  const accountId = useAuthStore((s) => s.firebaseUser?.uid);
  const authGeneration = useAuthStore((s) => s.authGeneration);
  const userProfile = useProfileStore((s) => s.userProfile);
  const usersPageSize = useProfileStore((s) => s.usersPageSize);
  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    useProfileStore.getState().resetUsersPagination();
  }, [accountId, shouldSyncUsersList, userProfile?.role]);

  useEffect(() => {
    if (!accountId || !shouldSyncUsersList || !isAdmin) {
      useProfileStore.getState().setUsersList([]);
      return;
    }

    let active = true;
    const isCurrent = () =>
      active &&
      useAuthStore.getState().firebaseUser?.uid === accountId &&
      useAuthStore.getState().authGeneration === authGeneration &&
      useProfileStore.getState().userProfile?.role === 'admin';
    const unsubscribe = subscribeScopedDocuments(
      { collection: 'users', take: usersPageSize + 1 },
      (snapshot) => {
        if (!isCurrent()) return;
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
      (error) => {
        if (isCurrent()) handleFirestoreError(error, OperationType.LIST, 'users');
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [accountId, authGeneration, isAdmin, shouldSyncUsersList, usersPageSize]);
};
