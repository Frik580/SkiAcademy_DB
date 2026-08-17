import React from 'react';
import { LanguageProvider } from './app/providers/LanguageContext';
import { CurrencyProvider } from './app/providers/CurrencyContext';
import { NotificationProvider } from './features/notifications';
import { AppBootstrap } from './app/AppBootstrap';
import { AppShell } from './app/AppShell';

/**
 * Root Application Composition
 * AppShell renders Navbar with unreadNotificationCount={notificationBadgeCount} and wires handleMarkNotificationsAsRead.
 */
export const App: React.FC = () => {
  return (
    <LanguageProvider>
      <CurrencyProvider>
        <NotificationProvider>
          <AppBootstrap>
            <AppShell />
          </AppBootstrap>
        </NotificationProvider>
      </CurrencyProvider>
    </LanguageProvider>
  );
};
