import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../lib/LanguageContext';
import { useNotifications } from '../components/PushNotificationHub';
import { useTheme } from '../hooks/useTheme';
import { useResortStats } from '../hooks/useResortStats';
import { useInstructorFilters } from '../hooks/useInstructorFilters';
import { Navbar } from '../components/Navbar';
import { ModalHost } from '../features/ui/ModalHost';
import { AppRoutes } from './routes/AppRoutes';
import { FeaturePageShell } from './FeaturePageShell';
import { logger } from '../lib/logger';

import { useAuthStore } from '../features/auth/authStore';
import { useProfileStore } from '../features/profile/profileStore';
import { useNotificationActions } from '../features/notifications/useNotificationActions';
import { useUnreadNotificationCount } from '../features/notifications/notificationsSelectors';
import { useBookingsStore } from '../features/bookings/bookingsStore';
import { useUiStore } from '../features/ui/uiStore';

export const AppShell: React.FC = () => {
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const userProfile = useProfileStore((s) => s.userProfile);
  const dismissedReviewIds = useProfileStore((s) => s.dismissedReviewIds);
  const handleCompleteOnboardingForProfile = useProfileStore((s) => s.handleCompleteOnboarding);
  const handleSignOut = useAuthStore((s) => s.handleSignOut);

  const bookings = useBookingsStore((s) => s.bookings);
  const reviews = useBookingsStore((s) => s.reviews);

  const unreadNotificationCount = useUnreadNotificationCount();
  const { handleMarkNotificationsAsRead } = useNotificationActions();

  const dbStatusWarning = useUiStore((s) => s.dbStatusWarning);
  const setDbStatusWarning = useUiStore((s) => s.setDbStatusWarning);
  const setIsNotifHistoryOpen = useUiStore((s) => s.setIsNotifHistoryOpen);
  const setIsOnboardingOpen = useUiStore((s) => s.setIsOnboardingOpen);
  const setIsAuthModalOpen = useUiStore((s) => s.setIsAuthModalOpen);

  const {
    resortConfig,
    tempC,
    snowDepthCm,
    newSnow24h,
    windKmh,
    weatherCode,
    openLifts,
    isFahrenheit,
    setIsFahrenheit,
    isResortLoading,
    lastUpdated,
    handleRefreshResortStats,
  } = useResortStats();

  useInstructorFilters(language);

  const isAdminRoute = location.pathname === '/admin';
  const isPaddedWorkspaceRoute = isAdminRoute || location.pathname === '/instructor';
  const isHomeRoute = location.pathname === '/';

  const unreviewedCompletedCount = useMemo(() => {
    if (!userProfile?.uid) return 0;

    const userBookings = bookings.filter(
      (booking) => booking.userId === userProfile.uid && !booking.isDeleted
    );

    return userBookings.filter((booking) => {
      if (booking.status !== 'completed') return false;
      if (dismissedReviewIds.includes(booking.id)) return false;

      const alreadyReviewed = reviews.some(
        (review) =>
          review.bookingId === booking.id ||
          (review.userId === userProfile.uid &&
            review.instructorId === booking.instructorId &&
            review.date === booking.date)
      );

      return !alreadyReviewed;
    }).length;
  }, [bookings, reviews, userProfile?.uid, dismissedReviewIds]);

  const notificationBadgeCount = unreadNotificationCount + unreviewedCompletedCount;

  const handleOpenNotifications = () => {
    setIsNotifHistoryOpen(true);
    void handleMarkNotificationsAsRead();
  };

  const handleCompleteOnboarding = async () => {
    setIsOnboardingOpen(false);
    try {
      await handleCompleteOnboardingForProfile();
    } catch (err) {
      logger.warn('Failed to save onboarding completion', err);
    }
  };

  const handleScheduleFirstLessonFromOnboarding = () => {
    handleCompleteOnboarding();
    setTimeout(() => {
      const el =
        document.getElementById('coaches-grid') || document.getElementById('group-courses-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  const onSignOut = async () => {
    try {
      await handleSignOut();
      navigate('/', { replace: true });
      addNotification('info', t('loggedOut'), t('loggedOutDesc'));
    } catch (err) {
      logger.error(err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--ink)] transition-colors duration-300">
      <Navbar
        userProfile={userProfile}
        onOpenNotifications={handleOpenNotifications}
        unreadNotificationCount={notificationBadgeCount}
        onSignOut={onSignOut}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignInClick={() => setIsAuthModalOpen(true)}
      />

      <FeaturePageShell
        isPaddedWorkspace={isPaddedWorkspaceRoute}
        isHomeRoute={isHomeRoute}
        isAuthenticated={Boolean(userProfile)}
        dbStatusWarning={dbStatusWarning}
        onDismissDbWarning={() => setDbStatusWarning(null)}
      >
        <AppRoutes
          resortData={{
            resortConfig,
            tempC,
            snowDepthCm,
            newSnow24h,
            windKmh,
            weatherCode,
            openLifts,
            isFahrenheit,
            isResortLoading,
            lastUpdated,
          }}
          setIsFahrenheit={setIsFahrenheit}
          onRefreshResortStats={handleRefreshResortStats}
          onSignOut={onSignOut}
        />
      </FeaturePageShell>

      <ModalHost
        onCompleteOnboarding={handleCompleteOnboarding}
        onScheduleFirstLessonFromOnboarding={handleScheduleFirstLessonFromOnboarding}
      />
    </div>
  );
};
