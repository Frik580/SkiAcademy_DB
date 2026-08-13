import { useEffect, useState } from 'react';
import { UserProfile } from '../types';
import {
  arrayUnion,
  collection,
  db,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from '../lib/firebase';
import { logger } from '../lib/logger';

export const useDismissedReviews = (userId?: string, userProfile?: UserProfile | null) => {
  const [dismissedReviewIds, setDismissedReviewIds] = useState<string[]>([]);

  useEffect(() => {
    if (userProfile?.dismissedReviewIds && Array.isArray(userProfile.dismissedReviewIds)) {
      setDismissedReviewIds(userProfile.dismissedReviewIds);
      if (userId) {
        localStorage.setItem(
          `alpine_glide_dismissed_reviews_${userId}`,
          JSON.stringify(userProfile.dismissedReviewIds)
        );
      }
    } else if (userId) {
      const saved = localStorage.getItem(`alpine_glide_dismissed_reviews_${userId}`);
      setDismissedReviewIds(saved ? JSON.parse(saved) : []);
    } else {
      setDismissedReviewIds([]);
    }
  }, [userId, userProfile?.dismissedReviewIds]);

  const handleDismissReview = async (bookingId: string) => {
    if (!userId) return;

    const updated = Array.from(new Set([...dismissedReviewIds, bookingId]));
    setDismissedReviewIds(updated);
    localStorage.setItem(`alpine_glide_dismissed_reviews_${userId}`, JSON.stringify(updated));

    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
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
  };

  return { dismissedReviewIds, handleDismissReview };
};
