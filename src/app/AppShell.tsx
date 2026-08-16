import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { db, doc, updateDoc } from '../lib/firebase';
import { useLanguage } from '../lib/LanguageContext';
import { useNotifications } from '../components/PushNotificationHub';
import { useTheme } from '../hooks/useTheme';
import { useResortStats } from '../hooks/useResortStats';
import { useInstructorFilters } from '../hooks/useInstructorFilters';
import { Navbar } from '../components/Navbar';
import { ModalHost } from '../features/ui/ModalHost';
import { AppRoutes } from './routes/AppRoutes';
import { logger } from '../lib/logger';

import { useAuthStore } from '../features/auth/authStore';
import { useProfileStore } from '../features/profile/profileStore';
import { useNotificationsStore } from '../features/notifications/notificationsStore';
import { useUnreadNotificationCount } from '../features/notifications/notificationsSelectors';
import { useBookingStore } from '../store/bookingStore';
import { useUiStore } from '../features/ui/uiStore';

export const AppShell: React.FC = () => {
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const userProfile = useProfileStore((s) => s.userProfile);
  const dismissedReviewIds = useProfileStore((s) => s.dismissedReviewIds);
  const handleSignOut = useAuthStore((s) => s.handleSignOut);

  const bookings = useBookingStore((s) => s.bookings);
  const reviews = useBookingStore((s) => s.reviews);

  const unreadNotificationCount = useUnreadNotificationCount();
  const handleMarkNotificationsAsRead = useNotificationsStore(
    (s) => s.handleMarkNotificationsAsRead
  );

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
    if (userProfile) {
      try {
        await updateDoc(doc(db, 'users', userProfile.uid), {
          hasCompletedOnboarding: true,
        });
      } catch (err) {
        logger.warn('Failed to save onboarding completion', err);
      }
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

      <main
        className={`flex-1 w-full mx-auto ${
          isPaddedWorkspaceRoute && userProfile ? 'p-6 overflow-y-auto' : 'flex flex-col'
        }`}
      >
        {dbStatusWarning && (
          <div className="lg:col-span-3 bg-amber-950/40 border border-amber-900/60 text-amber-200 p-4 rounded-none text-xs font-semibold flex items-center justify-between gap-3 animate-fade-in shrink-0 m-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>{dbStatusWarning}</span>
            </div>
            <button
              onClick={() => setDbStatusWarning(null)}
              className="text-amber-500 hover:text-amber-200 font-black text-sm"
            >
              ×
            </button>
          </div>
        )}

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
      </main>

      <ModalHost
        onCompleteOnboarding={handleCompleteOnboarding}
        onScheduleFirstLessonFromOnboarding={handleScheduleFirstLessonFromOnboarding}
      />

      <footer
        className={`ui-footer ui-site-footer border-t border-[var(--border-subtle)] px-6 shrink-0 bg-[var(--profile-bg)]/40 ${
          isHomeRoute ? '' : 'max-[1199px]:hidden'
        }`}
      >
        <div className="max-w-7xl mx-auto w-full">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--ink-dim)] font-mono">
            <div>© {new Date().getFullYear()} Carve Academy</div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="hover:text-[var(--ink)] transition-colors cursor-default">
                Ski & Snowboard Instruction
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
