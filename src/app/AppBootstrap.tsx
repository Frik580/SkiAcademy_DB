import React, { useEffect } from 'react';
import { useLanguage } from '../app/providers/LanguageContext';
import { useNotifications } from '../features/notifications';
import { setStoreContext } from '../store/storeContext';
import { useStoreSync } from '../store/useStoreSync';
import { applyDesignThemeToDOM } from '../lib/designTheme';
import { registerFirestoreErrorListener } from '../infrastructure/firebase/firebase';
import { logger } from '../lib/logger';
import { useAuthStore } from '../features/auth';
import { useSettingsStore } from '../features/settings';
import { useUiStore } from '../features/shell';
import { useAchievementsSync } from '../features/profile';
import { AppInitSkeleton } from '../ui/Skeleton';

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
  useAchievementsSync();

  const authLoading = useAuthStore((s) => s.authLoading);
  const designTheme = useSettingsStore((s) => s.designTheme);
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

  if (authLoading) {
    return <AppInitSkeleton label={t('checkingCredentials')} />;
  }

  return <>{children}</>;
};
