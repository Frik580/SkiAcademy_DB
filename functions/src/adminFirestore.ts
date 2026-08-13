import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const DEFAULT_PROJECT_ID = 'ski-school-8f3ca';

export function getAdminFirestore(): Firestore {
  if (getApps().length === 0) {
    initializeApp({
      projectId: process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? DEFAULT_PROJECT_ID,
    });
  }

  return getFirestore();
}
