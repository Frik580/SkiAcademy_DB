import {
  arrayUnion,
  collection,
  db,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from '../../infrastructure/firebase';
import { UserProfile } from '../../types';
import { logger } from '../../shared';

export async function updateUserProfileService(
  userId: string,
  updatedData: Partial<UserProfile>,
  instructorId?: string
): Promise<void> {
  await updateDoc(doc(db, 'users', userId), updatedData);

  if (instructorId && Object.prototype.hasOwnProperty.call(updatedData, 'phoneNumber')) {
    const phoneNumber = (updatedData.phoneNumber || '').trim();
    await updateDoc(doc(db, 'instructors', instructorId), { phoneNumber });
  }
}

export async function updateUserRoleService(
  targetUid: string,
  newRole: 'admin' | 'user'
): Promise<void> {
  await updateDoc(doc(db, 'users', targetUid), { role: newRole });
}

export async function updateStudentSkillsService(
  studentUid: string,
  skillScores: Record<string, number>,
  skillComments: Record<string, string>,
  level: number
): Promise<void> {
  await updateDoc(doc(db, 'users', studentUid), { skillScores, skillComments, level });
}

export async function updateStudentLevelService(studentUid: string, level: number): Promise<void> {
  await updateDoc(doc(db, 'users', studentUid), { level });
}

export async function addUserService(newUser: UserProfile): Promise<void> {
  await setDoc(doc(db, 'users', newUser.uid), newUser);
}

export async function updateUserDataWithoutMoneyService(updatedUser: UserProfile): Promise<void> {
  const nonMonetaryProfile: Partial<UserProfile> = { ...updatedUser };
  delete nonMonetaryProfile.balanceUSD;
  delete nonMonetaryProfile.walletBalances;
  delete nonMonetaryProfile.pendingWalletCredit;
  delete nonMonetaryProfile.lastRefundBookingId;
  await updateDoc(doc(db, 'users', updatedUser.uid), nonMonetaryProfile);
}

export async function dismissReviewService(userId: string, bookingId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'users', userId), {
      dismissedReviewIds: arrayUnion(bookingId),
    });
  } catch (err) {
    logger.error('Failed to update dismissedReviewIds in Firestore:', err);
  }

  try {
    const notifQuery = query(collection(db, 'notifications'), where('userId', '==', userId));
    const snapshot = await getDocs(notifQuery);
    snapshot.docs.forEach((d) => {
      const data = d.data();
      if (
        data.bookingId === bookingId ||
        (data.messageEn && data.messageEn.includes(bookingId)) ||
        (data.messageRu && data.messageRu.includes(bookingId))
      ) {
        deleteDoc(doc(db, 'notifications', d.id)).catch((err) =>
          logger.error('Failed to delete review notification from DB:', err)
        );
      }
    });
  } catch (err) {
    logger.error('Error removing review notification from notifications collection:', err);
  }
}
