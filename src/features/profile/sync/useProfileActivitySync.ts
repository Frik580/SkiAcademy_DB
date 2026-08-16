import { useEffect } from 'react';
import { collection, db, limit, onSnapshot, orderBy, query, where } from '../../../lib/firebase';
import { ActivityLog } from '../../../types';
import { QUERY_LIMITS } from '../../../lib/queryLimits';
import { logger } from '../../../lib/logger';
import { useAuthStore } from '../../auth/authStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { useProfileStore } from '../profileStore';

/** Route-scoped activity history listener for the signed-in profile. */
export const useProfileActivitySync = () => {
  const { shouldSyncActivityLogs } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);

  useEffect(() => {
    if (!firebaseUser || !shouldSyncActivityLogs) {
      useProfileStore.getState().setActivityLogs([]);
      return;
    }

    const activityQuery = query(
      collection(db, 'activity_logs'),
      where('userId', '==', firebaseUser.uid),
      orderBy('timestamp', 'desc'),
      limit(QUERY_LIMITS.activityLogs)
    );

    return onSnapshot(
      activityQuery,
      (snapshot) => {
        const activityLogs = snapshot.docs
          .map((activityDoc) => ({ id: activityDoc.id, ...activityDoc.data() }) as ActivityLog)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        useProfileStore.getState().setActivityLogs(activityLogs);
      },
      (error) => logger.error('Activity log sync error:', error)
    );
  }, [firebaseUser, shouldSyncActivityLogs]);
};
