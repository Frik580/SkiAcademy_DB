import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import {
  auth,
  db,
  doc,
  getDoc,
  handleFirestoreError,
  migratePreExistingProfile,
  OperationType,
  setDoc,
  googleProvider,
} from '../../infrastructure/firebase';
import type { UserProfile } from '../../types';
import { toUserProfile } from '../../infrastructure/firebase';

export async function signOutService(): Promise<void> {
  await fbSignOut(auth);
}

export function getCurrentAuthenticatedUser(): User | null {
  return auth.currentUser;
}

export async function signInWithEmailService(email: string, password: string): Promise<User> {
  return (await signInWithEmailAndPassword(auth, email, password)).user;
}

export async function signUpWithEmailService(email: string, password: string): Promise<User> {
  return (await createUserWithEmailAndPassword(auth, email, password)).user;
}

export async function signInWithGoogleService(): Promise<User> {
  return (await signInWithPopup(auth, googleProvider)).user;
}

export async function requestPasswordResetService(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function getUserProfileService(userId: string): Promise<UserProfile | null> {
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    return userSnap.exists() ? toUserProfile(userSnap.data(), userSnap.id) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
    return null;
  }
}

export async function saveUserProfileService(profile: UserProfile): Promise<void> {
  try {
    await setDoc(doc(db, 'users', profile.uid), profile);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${profile.uid}`);
  }
}

export async function migrateExistingProfileService(
  userId: string,
  email: string,
  displayName?: string
): Promise<UserProfile | null> {
  return migratePreExistingProfile(userId, email, displayName);
}
