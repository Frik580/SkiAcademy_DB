import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getOrInitApp } from './adminApp';

let firestore: Firestore | undefined;

export function getAdminFirestore(): Firestore {
  if (!firestore) {
    firestore = getFirestore(getOrInitApp());
  }
  return firestore;
}
