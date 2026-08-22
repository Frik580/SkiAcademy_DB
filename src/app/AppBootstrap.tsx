import React, { useEffect } from 'react';
import { useLanguage } from '../app/providers/LanguageContext';
import { useNotifications } from '../features/notifications';
import { setStoreContext } from '../store/storeContext';
import { useStoreSync } from '../store/useStoreSync';
import { registerFirestoreErrorListener } from '../infrastructure/firebase';
import { logger } from '../shared';
import { useUiStore } from '../features/shell';
import { useAchievementsSync } from '../features/profile';

export interface AppBootstrapProps {
  children: React.ReactNode;
}

/**
 * Bootstraps stores and theme without blocking the public shell on auth.
 * Protected routes wait on auth + profile loading inside RouteGate so LCP can paint.
 */
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

  const setDbStatusWarning = useUiStore((s) => s.setDbStatusWarning);

  // Global Firestore Safe Fallback Listener
  useEffect(() => {
    registerFirestoreErrorListener((_err, op, path) => {
      logger.warn(`[Firestore Safe Fallback Triggered] Error during ${op} on ${path}`);
      setDbStatusWarning(
        `${t('dbRestricted')} (${t('operationLabel')}: ${op}, ${t('pathLabel')}: ${path})`
      );
    });
  }, [t, setDbStatusWarning]);

  return <>{children}</>;
};
