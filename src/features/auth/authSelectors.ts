import { useAuthStore } from './authStore';
import { User } from 'firebase/auth';

export const selectFirebaseUser = (state: ReturnType<typeof useAuthStore.getState>): User | null =>
  state.firebaseUser;

export const selectAuthLoading = (state: ReturnType<typeof useAuthStore.getState>): boolean =>
  state.authLoading;

export const selectIsAuthenticated = (state: ReturnType<typeof useAuthStore.getState>): boolean =>
  Boolean(state.firebaseUser);
