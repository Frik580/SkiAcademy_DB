import { subscribeScopedDocuments } from '../../../lib/canonical/scopedClientDocuments';
import { useEffect } from 'react';
import { toActivityLog } from '../../../infrastructure/firebase';
import { logger } from '../../../shared';
import { useAuthStore } from '../../auth/authStore';
import { useDataSyncScope } from '../../../store/useDataSyncScope';
import { useProfileStore } from '../profileStore';

/** Route-scoped activity history listener for the signed-in profile. */
export const useProfileActivitySync = () => {
  const { shouldSyncActivityLogs } = useDataSyncScope();
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const activityLogsPageSize = useProfileStore((s) => s.activityLogsPageSize);

  useEffect(() => {
    useProfileStore.getState().resetActivityLogsPagination();
  }, [firebaseUser?.uid, shouldSyncActivityLogs]);

  useEffect(() => {
    if (!firebaseUser || !shouldSyncActivityLogs) {
      useProfileStore.getState().setActivityLogs([]);
      return;
    }

    const activityQuery = {
      collection: 'activity_logs' as const,
      take: activityLogsPageSize + 1,
      where: [{ field: 'userId' as const, op: '==' as const, value: firebaseUser.uid }],
      order: [{ field: 'timestamp' as const, direction: 'desc' as const }],
    };

    return subscribeScopedDocuments(
      activityQuery,
      (snapshot) => {
        const activityLogs = snapshot.docs
          .slice(0, activityLogsPageSize)
          .map((activityDoc) => toActivityLog(activityDoc.id, activityDoc.data()))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        useProfileStore.getState().setActivityLogs(activityLogs);
        useProfileStore
          .getState()
          .setActivityLogsHasMore(snapshot.docs.length > activityLogsPageSize);
      },
      (error) => logger.error('Activity log sync error:', error)
    );
  }, [activityLogsPageSize, firebaseUser, shouldSyncActivityLogs]);
};
