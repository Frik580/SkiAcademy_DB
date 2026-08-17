import { create } from 'zustand';
import { User } from 'firebase/auth';
import { logger } from '../../shared/logger';
import { signOutService } from './authService';

export interface AuthState {
  firebaseUser: User | null;
  authLoading: boolean;

  setFirebaseUser: (user: User | null) => void;
  setAuthLoading: (loading: boolean) => void;
  handleSignOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  authLoading: true,

  setFirebaseUser: (user) => set({ firebaseUser: user }),
  setAuthLoading: (loading) => set({ authLoading: loading }),

  handleSignOut: async () => {
    try {
      await signOutService();
      set({ firebaseUser: null });
    } catch (err) {
      logger.error('Auth sign out failed:', err);
      throw err;
    }
  },
}));
