import { getScopedDocumentPage } from '../../lib/canonical/scopedClientDocuments';
import { IdempotencyKeySchema } from '@ski-academy/shared-domain/canonical/commands/commandContext';
import { arrayUnion, db, deleteDoc, doc, setDoc, updateDoc } from '../../infrastructure/firebase';
import { executeAuthenticatedCanonicalCommand } from '../../lib/canonical/canonicalCommandClient';
import { mapCanonicalCommandResultError } from '../../lib/canonical/mapCanonicalCommandError';
import { ParticipantTodayChecklistState, UserProfile } from '../../types';
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

const PARTICIPANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/**
 * Writes one participant checklist entry. Field-path update leaves every other
 * participant entry on the account document unchanged.
 */
export async function updateParticipantTodayChecklistService(
  userId: string,
  participantId: string,
  checklist: ParticipantTodayChecklistState
): Promise<void> {
  if (!PARTICIPANT_ID_PATTERN.test(participantId)) {
    throw new Error('Invalid participant id');
  }
  await updateDoc(doc(db, 'users', userId), {
    [`participantTodayChecklists.${participantId}`]: checklist,
  } as Record<string, unknown>);
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
    let cursor: string | null = null;
    do {
      const page = await getScopedDocumentPage(
        {
          collection: 'notifications',
          take: 200,
          where: [{ field: 'userId', op: '==', value: userId }],
        },
        cursor
      );
      for (const item of page.docs) {
        const data = item.data;
        if (
          data.bookingId === bookingId ||
          (typeof data.messageEn === 'string' && data.messageEn.includes(bookingId)) ||
          (typeof data.messageRu === 'string' && data.messageRu.includes(bookingId))
        ) {
          deleteDoc(doc(db, 'notifications', item.id)).catch((err) =>
            logger.error('Failed to delete review notification from DB:', err)
          );
        }
      }
      cursor = page.cursor;
    } while (cursor);
  } catch (err) {
    logger.error('Error removing review notification from notifications collection:', err);
  }
}
