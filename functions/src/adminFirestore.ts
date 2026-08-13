import { getApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let firestore: Firestore | undefined;

function getOrInitApp() {
  try {
    return getApp();
  } catch {
    return initializeApp();
  }
}

export function getAdminFirestore(): Firestore {
  if (!firestore) {
    firestore = getFirestore(getOrInitApp());
  }
  return firestore;
}
