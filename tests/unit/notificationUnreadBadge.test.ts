import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('notification unread badge wiring', () => {
  it('tracks unread notifications and shows badge count in navbar', () => {
    const notificationsSource = readFileSync(
      join(process.cwd(), 'src/hooks/useNotifications.ts'),
      'utf8'
    );
    const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
    const navbarSource = readFileSync(join(process.cwd(), 'src/components/Navbar.tsx'), 'utf8');
    const hubSource = readFileSync(
      join(process.cwd(), 'src/components/PushNotificationHub.tsx'),
      'utf8'
    );

    expect(notificationsSource).toContain('unreadNotificationCount');
    expect(notificationsSource).toContain('handleMarkNotificationsAsRead');
    expect(notificationsSource).toContain('isRead: true');
    expect(appSource).toContain('unreadNotificationCount={notificationBadgeCount}');
    expect(appSource).toContain('handleMarkNotificationsAsRead');
    expect(navbarSource).toContain('unreadNotificationCount');
    expect(navbarSource).toContain('hasUnreadNotifications');
    expect(hubSource).toContain('newBadge');
  });
});
