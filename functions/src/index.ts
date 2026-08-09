import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { autoCompletePastBookings } from './autoCompleteBookings';

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();

export const scheduledAutoCompleteBookings = onSchedule(
  {
    schedule: 'every 60 minutes',
    timeZone: 'Asia/Almaty',
  },
  async () => {
    const completedCount = await autoCompletePastBookings(db);
    console.log(`Auto-completed ${completedCount} booking(s).`);
  }
);
