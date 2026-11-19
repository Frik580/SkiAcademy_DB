import { useEffect } from 'react';
import { db, doc, onSnapshot } from '../../../infrastructure/firebase';
import { logger } from '../../../shared';
import { toUserProfile } from '../../../infrastructure/firebase';
import { isCanonicalAccountReadyForReads } from '../canonicalAccountReadiness';
import { useAuthStore } from '../../auth/authStore';
import { useProfileStore } from '../profileStore';

/** Keeps the current user's profile and local review-dismissal state in the profile domain. */
export const useCurrentUserProfileSync = () => {
  const accountId = useAuthStore((s) => s.firebaseUser?.uid);
  const authGeneration = useAuthStore((s) => s.authGeneration);
  const refreshNonce = useProfileStore((s) => s.profileRefreshNonce);

  useEffect(() => {
    if (!accountId) return;

    let active = true;
    const isCurrent = () =>
      active &&
      useAuthStore.getState().authGeneration === authGeneration &&
      useAuthStore.getState().firebaseUser?.uid === accountId &&
      useProfileStore.getState().profileRefreshNonce === refreshNonce;
    const fail = () => {
      useProfileStore.setState({
        canonicalReadyAccountId: null,
        profileLoading: false,
        profileLoadError: true,
      });
    };
    const userRef = doc(db, 'users', accountId);
    const unsubscribe = onSnapshot(
      userRef,
      { includeMetadataChanges: true },
      (userSnap) => {
        if (!isCurrent()) return;
        if (userSnap.metadata.fromCache || userSnap.metadata.hasPendingWrites) return;
        if (!userSnap.exists()) {
          useProfileStore.getState().resetProfileState();
          return;
        }

        const profile = toUserProfile(userSnap.data(), userSnap.id);
        if (!profile || profile.uid !== accountId) {
          fail();
          return;
        }
        // Gate canonical reads on the authoritative Account fields, not on the
        // presentation-only UserProfile (which exists before provisioning).
        useProfileStore
          .getState()
          .setCanonicalReadyAccountId(
            isCanonicalAccountReadyForReads(userSnap.data(), accountId) ? accountId : null
          );
        useProfileStore.getState().syncUserProfileFromSnapshot(profile);
        const dismissedIdsKey = `alpine_glide_dismissed_reviews_${accountId}`;
        const snapshotDismissedIds = Array.isArray(profile.dismissedReviewIds)
          ? profile.dismissedReviewIds
          : undefined;
        try {
          if (snapshotDismissedIds) {
            useProfileStore.getState().setDismissedReviewIds(snapshotDismissedIds);
            localStorage.setItem(dismissedIdsKey, JSON.stringify(snapshotDismissedIds));
          } else {
            const saved = localStorage.getItem(dismissedIdsKey);
            useProfileStore.getState().setDismissedReviewIds(saved ? JSON.parse(saved) : []);
          }
        } catch {
          useProfileStore.getState().setDismissedReviewIds(snapshotDismissedIds ?? []);
        }
      },
      (error) => {
        if (!isCurrent()) return;
        logger.error('Current user profile sync error:', error);
        fail();
      }
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [accountId, authGeneration, refreshNonce]);
};
