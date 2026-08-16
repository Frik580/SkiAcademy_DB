import React from 'react';
import { NotificationHubModal } from '../../components/PushNotificationHub';
import { useUiStore } from '../ui/uiStore';
import { useProfileStore } from '../profile/profileStore';
import { useBookingsStore } from '../bookings/bookingsStore';
import { useNotificationsStore } from './notificationsStore';
import { useNotificationActions } from './useNotificationActions';

/** Feature container for notification history and review prompts. */
export const NotificationsPanel: React.FC = () => {
  const isOpen = useUiStore((state) => state.isNotifHistoryOpen);
  const setIsOpen = useUiStore((state) => state.setIsNotifHistoryOpen);
  const userProfile = useProfileStore((state) => state.userProfile);
  const dismissedReviewIds = useProfileStore((state) => state.dismissedReviewIds);
  const handleDismissReview = useProfileStore((state) => state.handleDismissReview);
  const bookings = useBookingsStore((state) => state.bookings);
  const reviews = useBookingsStore((state) => state.reviews);
  const dbNotifications = useNotificationsStore((state) => state.dbNotifications);
  const { handleClearNotifications, handleDeleteNotification } = useNotificationActions();

  return (
    <NotificationHubModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      bookings={bookings}
      reviews={reviews}
      userProfile={userProfile}
      dismissedReviewIds={dismissedReviewIds}
      onDismissReview={handleDismissReview}
      dbNotifications={dbNotifications}
      onClearNotifications={handleClearNotifications}
      onDeleteNotification={handleDeleteNotification}
    />
  );
};
