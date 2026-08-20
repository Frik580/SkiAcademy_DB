import { getApp, initializeApp } from 'firebase-admin/app';

/** Shared Admin app bootstrap for Firestore, Storage, etc. */
export function getOrInitApp() {
  try {
    return getApp();
  } catch {
    return initializeApp();
  }
}
