import { useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, doc, onSnapshot } from '../../lib/firebase';
import { UserProfile } from '../../types';
import { logger } from '../../lib/logger';
import { useAuthStore } from '../authStore';

export const useAuthSync = () => {
  const profileUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      profileUnsubscribeRef.current?.();
      profileUnsubscribeRef.current = null;

      if (user) {
        useAuthStore.getState().setFirebaseUser(user);
        const userRef = doc(db, 'users', user.uid);

        profileUnsubscribeRef.current = onSnapshot(
          userRef,
          (userSnap) => {
            if (userSnap.exists()) {
              const data = userSnap.data() as UserProfile;
              useAuthStore.getState().syncUserProfileFromSnapshot(data);

              if (data.dismissedReviewIds && Array.isArray(data.dismissedReviewIds)) {
                useAuthStore.getState().setDismissedReviewIds(data.dismissedReviewIds);
                localStorage.setItem(
                  `alpine_glide_dismissed_reviews_${user.uid}`,
                  JSON.stringify(data.dismissedReviewIds)
                );
              } else {
                const saved = localStorage.getItem(`alpine_glide_dismissed_reviews_${user.uid}`);
                useAuthStore.getState().setDismissedReviewIds(saved ? JSON.parse(saved) : []);
              }
            } else {
              useAuthStore.getState().syncUserProfileFromSnapshot(null);
            }
            useAuthStore.getState().setAuthLoading(false);
          },
          (error) => {
            logger.error('Auth profile snapshot error:', error);
            useAuthStore.getState().setAuthLoading(false);
          }
        );
      } else {
        useAuthStore.getState().syncUserProfileFromSnapshot(null);
        useAuthStore.getState().setFirebaseUser(null);
        useAuthStore.getState().setDismissedReviewIds([]);
        useAuthStore.getState().setAuthLoading(false);
      }
    });

    return () => {
      profileUnsubscribeRef.current?.();
      profileUnsubscribeRef.current = null;
      unsubscribeAuth();
    };
  }, []);
};
