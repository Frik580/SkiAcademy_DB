import { create } from 'zustand';
import { User } from 'firebase/auth';
import { logger } from '../../shared';
import { resetUserScopedStores } from '../../store/resetDataStores';
import { useProfileStore } from '../profile/profileStore';
import { signOutService } from './authService';

export interface AuthState {
  firebaseUser: User | null;
  authLoading: boolean;
  /** Increments whenever the authenticated principal changes, including sign-out. */
  authGeneration: number;

  setFirebaseUser: (user: User | null) => void;
  setAuthLoading: (loading: boolean) => void;
  handleSignOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  authLoading: true,
  authGeneration: 0,

  setFirebaseUser: (user) => {
    const previousUid = get().firebaseUser?.uid;
    const nextUid = user?.uid;
    const principalChanged = previousUid !== nextUid;
    if (principalChanged) {
      // Invalidate the old principal synchronously. Store subscribers must never
      // observe account B together with account A's participant or read-model state.
      resetUserScopedStores();
    }
    if (!user) {
      useProfileStore.getState().setProfileLoading(false);
    } else if (principalChanged) {
      // Mark profile pending synchronously so RouteGate does not bounce to `/`
      // between auth resolve and the first Firestore profile snapshot.
      useProfileStore.getState().setProfileLoading(true);
    }
    set({
      firebaseUser: user,
      ...(principalChanged ? { authGeneration: get().authGeneration + 1 } : {}),
    });
  },
  setAuthLoading: (loading) => set({ authLoading: loading }),

  handleSignOut: async () => {
    try {
      // Drop the local principal before Firebase sign-out so in-flight
      // participant reads cannot continue after the ID token is gone.
      get().setFirebaseUser(null);
      await signOutService();
    } catch (err) {
      logger.error('Auth sign out failed:', err);
      throw err;
    }
  },
}));
