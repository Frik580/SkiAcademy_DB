import { useEffect, useRef, useState } from 'react';
import { isInstructorWorkspaceUser } from '../../lib/workspaceRoutes';
import { useAuthStore } from '../auth/authStore';
import { useProfileStore } from '../profile/profileStore';
import {
  observeInstructorLessonRevenue,
  type InstructorRevenueRead,
} from './instructorLessonRevenue';

export function useInstructorLessonRevenue(accountId: string, instructorId: string | undefined) {
  const authGeneration = useAuthStore((state) => state.authGeneration);
  const authenticated = useAuthStore((state) => state.firebaseUser?.uid === accountId);
  const awaitingAccount = useProfileStore((state) => state.profileLoading);
  const dataScope = useProfileStore((state) => revenueAccountScope(state, accountId, instructorId));
  const testSessionId = useProfileStore(profileTestSessionId);
  const key = JSON.stringify([
    authGeneration,
    accountId,
    instructorId,
    dataScope,
    testSessionId,
    'all-time',
  ]);
  const [read, setRead] = useState<{ key: string; state: InstructorRevenueRead }>();
  const refresh = useRef<{ key: string; run: () => void }>(undefined);

  useEffect(() => {
    if (!authenticated || !instructorId || !dataScope) {
      setRead(undefined);
      return;
    }
    const observer = observeInstructorLessonRevenue({
      key,
      instructorId,
      dataScope,
      testSessionId,
      isCurrent: () => {
        const auth = useAuthStore.getState();
        const profile = useProfileStore.getState();
        return (
          auth.authGeneration === authGeneration &&
          auth.firebaseUser?.uid === accountId &&
          revenueAccountScope(profile, accountId, instructorId) === dataScope &&
          profileTestSessionId(profile) === testSessionId
        );
      },
      onState: (state) => setRead({ key, state }),
    });
    refresh.current = { key, run: observer.refresh };
    void observer.refresh();
    window.addEventListener('focus', observer.refresh);
    return () => {
      refresh.current = undefined;
      window.removeEventListener('focus', observer.refresh);
      observer.stop();
    };
  }, [key, authenticated, authGeneration, accountId, instructorId, dataScope, testSessionId]);

  const revenue: InstructorRevenueRead =
    !authenticated || !instructorId || (!dataScope && !awaitingAccount)
      ? { status: 'denied' }
      : dataScope && read?.key === key
        ? read.state
        : { status: 'loading' };
  return {
    revenue,
    retryRevenue: () => {
      if (refresh.current?.key === key) refresh.current.run();
    },
  };
}

function profileTestSessionId({ userProfile }: ReturnType<typeof useProfileStore.getState>) {
  if (
    userProfile &&
    'testSessionId' in userProfile &&
    typeof userProfile.testSessionId === 'string'
  ) {
    return userProfile.testSessionId;
  }
  return undefined;
}

function revenueAccountScope(
  {
    canonicalReadyAccountId,
    userProfile,
    profileLoading,
    profileLoadError,
  }: ReturnType<typeof useProfileStore.getState>,
  accountId: string,
  instructorId: string | undefined
) {
  if (
    profileLoading ||
    profileLoadError ||
    canonicalReadyAccountId !== accountId ||
    userProfile?.uid !== accountId ||
    userProfile.instructorId !== instructorId ||
    !isInstructorWorkspaceUser(userProfile)
  ) {
    return undefined;
  }
  return userProfile.dataScope;
}
