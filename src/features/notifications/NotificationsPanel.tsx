import React, { useMemo } from 'react';
import { NotificationHubModal } from '../../features/notifications';
import { useUiStore } from '../shell/uiStore';
import { useProfileStore } from '../profile/profileStore';
import { useBookingsStore } from '../bookings/bookingsStore';
import { useNotificationsStore } from './notificationsStore';
import { useNotificationActions } from './useNotificationActions';
import {
  selectLessonBookingItems,
  useLessonBookingStore,
} from '../lesson-bookings';
import { cabinetItemToLegacyPresentation } from '../lesson-bookings/mergeCabinetBookings';

/** Feature container for notification history and review prompts. */
export const NotificationsPanel: React.FC = () => {
  const isOpen = useUiStore((state) => state.isNotifHistoryOpen);
  const setIsOpen = useUiStore((state) => state.setIsNotifHistoryOpen);
  const userProfile = useProfileStore((state) => state.userProfile);
  const dismissedReviewIds = useProfileStore((state) => state.dismissedReviewIds);
  const handleDismissReview = useProfileStore((state) => state.handleDismissReview);
  const lessonBookings = useLessonBookingStore(selectLessonBookingItems);
  const reviews = useBookingsStore((state) => state.reviews);
  const reviewBookingStates = useBookingsStore((state) => state.reviewBookingStates);
  const dbNotifications = useNotificationsStore((state) => state.dbNotifications);
  const { handleClearNotifications, handleDeleteNotification } = useNotificationActions();
  const bookings = useMemo(
    () =>
      userProfile
        ? lessonBookings.map((booking) =>
            cabinetItemToLegacyPresentation(booking, userProfile.uid)
          )
        : [],
    [lessonBookings, userProfile]
  );

  return (
    <NotificationHubModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      bookings={bookings}
      reviews={reviews}
      reviewBookingStates={reviewBookingStates}
      userProfile={userProfile}
      dismissedReviewIds={dismissedReviewIds}
      onDismissReview={handleDismissReview}
      dbNotifications={dbNotifications}
      onClearNotifications={handleClearNotifications}
      onDeleteNotification={handleDeleteNotification}
    />
  );
};
