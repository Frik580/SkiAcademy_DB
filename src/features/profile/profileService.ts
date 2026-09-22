import { IdempotencyKeySchema } from '@ski-academy/shared-domain';
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
import { executeAuthenticatedCanonicalCommand } from '../../lib/canonical/canonicalCommandClient';
import { mapCanonicalCommandResultError } from '../../lib/canonical/mapCanonicalCommandError';
import { UserProfile } from '../../types';
import { logger } from '../../shared';

function deriveOwnAccountContactIdempotencyKey(): ReturnType<typeof IdempotencyKeySchema.parse> {
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return IdempotencyKeySchema.parse(`own-account-contact:${entropy}`);
}

async function updateOwnAccountContact(userId: string, phoneNumber: string): Promise<void> {
  const result = await executeAuthenticatedCanonicalCommand(userId, {
    kind: 'update_own_account_contact',
    intent: { phoneNumber },
    idempotencyKey: deriveOwnAccountContactIdempotencyKey(),
    exercisedCapability: 'account_owner',
  });
  const error = mapCanonicalCommandResultError(result);
  if (error) throw error;
}

export async function updateUserProfileService(
  userId: string,
  updatedData: Partial<UserProfile>,
  _instructorId?: string
): Promise<void> {
  const rest: Partial<UserProfile> = { ...updatedData };
  if (Object.prototype.hasOwnProperty.call(updatedData, 'phoneNumber')) {
    await updateOwnAccountContact(userId, (updatedData.phoneNumber || '').trim());
    delete rest.phoneNumber;
  }

  if (Object.keys(rest).length === 0) return;
  await updateDoc(doc(db, 'users', userId), rest);
}

export async function updateUserRoleService(
  targetUid: string,
  newRole: 'admin' | 'user'
): Promise<void> {
  await updateDoc(doc(db, 'users', targetUid), { role: newRole });
}

export async function addUserService(newUser: UserProfile): Promise<void> {
  const { testSessionId: _testSessionId, ...liveProfile } = newUser as UserProfile & {
    testSessionId?: unknown;
  };
  await setDoc(doc(db, 'users', newUser.uid), { ...liveProfile, dataScope: 'live' });
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
