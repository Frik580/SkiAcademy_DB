import { useEffect, useState } from 'react';

export const useDismissedReviews = (userId?: string) => {
  const [dismissedReviewIds, setDismissedReviewIds] = useState<string[]>([]);

  useEffect(() => {
    if (userId) {
      const saved = localStorage.getItem(`alpine_glide_dismissed_reviews_${userId}`);
      setDismissedReviewIds(saved ? JSON.parse(saved) : []);
    } else {
      setDismissedReviewIds([]);
    }
  }, [userId]);

  const handleDismissReview = (bookingId: string) => {
    if (userId) {
      const updated = [...dismissedReviewIds, bookingId];
      setDismissedReviewIds(updated);
      localStorage.setItem(
        `alpine_glide_dismissed_reviews_${userId}`,
        JSON.stringify(updated)
      );
    }
  };

  return { dismissedReviewIds, handleDismissReview };
};
