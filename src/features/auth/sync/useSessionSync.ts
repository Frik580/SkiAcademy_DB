import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { useAuthStore } from '../authStore';

/** Owns Firebase Auth session state only. Profile data is synchronized separately. */
export const useSessionSync = () => {
  useEffect(() => {
    return onAuthStateChanged(auth, (firebaseUser) => {
      useAuthStore.getState().setFirebaseUser(firebaseUser);
      useAuthStore.getState().setAuthLoading(false);
    });
  }, []);
};
