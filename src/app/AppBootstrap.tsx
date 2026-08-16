import React, { useEffect } from 'react';
import { useLanguage } from '../lib/LanguageContext';
import { useNotifications } from '../components/PushNotificationHub';
import { setStoreContext } from '../store/storeContext';
import { useStoreSync } from '../store/useStoreSync';
import { applyDesignThemeToDOM } from '../lib/designTheme';
import { registerFirestoreErrorListener } from '../lib/firebase';
import { logger } from '../lib/logger';
import { useAuthStore } from '../features/auth/authStore';
import { useProfileStore } from '../features/profile/profileStore';
import { useSettingsStore } from '../features/settings/settingsStore';
import { useUiStore } from '../features/ui/uiStore';
import { AppInitSkeleton } from '../components/ui/Skeleton';

export interface AppBootstrapProps {
  children: React.ReactNode;
}

export const AppBootstrap: React.FC<AppBootstrapProps> = ({ children }) => {
  const { addNotification } = useNotifications();
  const { t, language } = useLanguage();

  // Initialize store context bridge for notifications and translations
  useEffect(() => {
    setStoreContext({
      notify: (type, title, message) =>
        addNotification(type as 'error' | 'success' | 'info' | 'warning', title, message),
      t: (key) => t(key as Parameters<typeof t>[0]),
      language: () => language,
    });
  }, [addNotification, t, language]);

  // Synchronize all Zustand stores with Firebase Firestore realtime listeners
  useStoreSync();

  const authLoading = useAuthStore((s) => s.authLoading);
  const userProfile = useProfileStore((s) => s.userProfile);
  const designTheme = useSettingsStore((s) => s.designTheme);
  const onboardingEnabled = useSettingsStore((s) => s.onboardingEnabled);
  const setIsOnboardingOpen = useUiStore((s) => s.setIsOnboardingOpen);
  const setDbStatusWarning = useUiStore((s) => s.setDbStatusWarning);

  // Apply visual theme to DOM
  useEffect(() => {
    applyDesignThemeToDOM(designTheme);
  }, [designTheme]);

  // Global Firestore Safe Fallback Listener
  useEffect(() => {
    registerFirestoreErrorListener((_err, op, path) => {
      logger.warn(`[Firestore Safe Fallback Triggered] Error during ${op} on ${path}`);
      setDbStatusWarning(
        `${t('dbRestricted')} (${t('operationLabel')}: ${op}, ${t('pathLabel')}: ${path})`
      );
    });
  }, [t, setDbStatusWarning]);

  // First-time onboarding trigger
  useEffect(() => {
    if (onboardingEnabled && userProfile && userProfile.hasCompletedOnboarding === false) {
      const sessionKey = `onboarding_shown_${userProfile.uid}`;
      if (!sessionStorage.getItem(sessionKey)) {
        sessionStorage.setItem(sessionKey, 'true');
        setIsOnboardingOpen(true);
      }
    }
  }, [userProfile, onboardingEnabled, setIsOnboardingOpen]);

  if (authLoading) {
    return <AppInitSkeleton label={t('checkingCredentials')} />;
  }

  return <>{children}</>;
};
