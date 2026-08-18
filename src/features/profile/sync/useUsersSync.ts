import { useEffect } from 'react';
import {
  collection,
  db,
  documentId,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  query,
  where,
} from '../../../infrastructure/firebase';
import { toUserProfile } from '../../../infrastructure/firebase';
import { useAuthStore } from '../../auth/authStore';
import { useBookingsStore } from '../../bookings/bookingsStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { useProfileStore } from '../profileStore';
import {
  chunkFirestoreInValues,
  getInstructorStudentProfileIds,
} from './instructorStudentProfiles';

/** Lazy users directory for admin and instructor workspaces. */
export const useUsersSync = () => {
  const { shouldSyncUsersList } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const userProfile = useProfileStore((s) => s.userProfile);
  const usersPageSize = useProfileStore((s) => s.usersPageSize);
  const bookings = useBookingsStore((s) => s.bookings);
  const isAdmin = userProfile?.role === 'admin';
  const instructorId = userProfile?.instructorId;

  useEffect(() => {
    useProfileStore.getState().resetUsersPagination();
  }, [firebaseUser?.uid, shouldSyncUsersList, userProfile?.instructorId, userProfile?.role]);

  useEffect(() => {
    if (!firebaseUser || !shouldSyncUsersList || (!isAdmin && !instructorId)) {
      useProfileStore.getState().setUsersList([]);
      return;
    }

    if (isAdmin) {
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
    }

    const studentProfileIds = getInstructorStudentProfileIds(bookings, instructorId!);
    if (studentProfileIds.length === 0) {
      useProfileStore.getState().setUsersList([]);
      useProfileStore.getState().setUsersHasMore(false);
      return;
    }

    const snapshots = new Map<string, import('../../../types').UserProfile[]>();
    const publish = () => {
      const users = [
        ...new Map(
          [...snapshots.values()].flat().map((profile) => [profile.uid, profile])
        ).values(),
      ];
      useProfileStore.getState().setUsersList(users);
      useProfileStore.getState().setUsersHasMore(false);
    };

    const unsubscribers = chunkFirestoreInValues(studentProfileIds).map((profileIds, index) =>
      onSnapshot(
        query(collection(db, 'users'), where(documentId(), 'in', profileIds)),
        (snapshot) => {
          snapshots.set(
            String(index),
            snapshot.docs.map((userDoc) => toUserProfile(userDoc.data()))
          );
          publish();
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'users')
      )
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [bookings, firebaseUser, instructorId, isAdmin, shouldSyncUsersList, usersPageSize]);
};
