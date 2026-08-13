import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, db, limit, onSnapshot, orderBy, query, where } from '../lib/firebase';
import { QUERY_LIMITS } from '../lib/queryLimits';
import { logger } from '../lib/logger';
import { ActivityLog } from '../types';

export const useActivityLog = (firebaseUser: User | null) => {
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    if (!firebaseUser) {
      setActivityLogs([]);
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
        const logs = snapshot.docs.map(
          (activityDoc) =>
            ({
              id: activityDoc.id,
              ...activityDoc.data(),
            }) as ActivityLog
        );
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setActivityLogs(logs);
      },
      (error) => logger.error('Activity log sync error:', error)
    );
  }, [firebaseUser]);

  return { activityLogs };
};
