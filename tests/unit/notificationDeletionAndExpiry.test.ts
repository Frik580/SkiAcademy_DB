import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_RETENTION_DAYS,
  getNotificationRetentionMs,
} from '../../src/lib/notificationConfig';
import { TWO_WEEKS_MS } from '../../src/hooks/useNotifications';

describe('notification deletion and auto-expiry', () => {
  it('defines default 14-day expiry constant', () => {
    expect(TWO_WEEKS_MS).toBe(getNotificationRetentionMs(DEFAULT_NOTIFICATION_RETENTION_DAYS));
    expect(TWO_WEEKS_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('wires single notification deletion and auto-cleanup of expired items', () => {
    const notificationsSource = readFileSync(
      join(process.cwd(), 'src/features/notifications/sync/useNotificationsSync.ts'),
      'utf8'
    );
    const uiStoreSource = readFileSync(join(process.cwd(), 'src/store/uiStore.ts'), 'utf8');
    const notificationsStoreSource = readFileSync(
      join(process.cwd(), 'src/features/notifications/notificationsStore.ts'),
      'utf8'
    );
    const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
    const hubSource = readFileSync(
      join(process.cwd(), 'src/components/PushNotificationHub.tsx'),
      'utf8'
    );

    const cleanupSource = readFileSync(
      join(process.cwd(), 'src/lib/notificationCleanup.ts'),
      'utf8'
    );

    // Auto-cleanup of expired notifications uses dedicated retention query
    expect(notificationsSource).toContain('purgeExpiredNotificationsForUser');
    expect(notificationsSource).toContain('isNotificationExpired');
    expect(cleanupSource).toContain('deleteDoc');

    // Retention setting is loaded and passed from ui store
    expect(uiStoreSource).toContain('notification_retention');
    expect(uiStoreSource).toContain('handleSetNotificationRetentionDays');

    // App.tsx passes handleDeleteNotification from notifications store
    expect(appSource).toContain('handleDeleteNotification');
    expect(notificationsStoreSource).toContain('handleDeleteNotification');

    // PushNotificationHub renders delete button per item
    expect(hubSource).toContain('onDeleteNotification');
    expect(hubSource).toContain('handleDeleteItem');
    expect(hubSource).toContain('delete-notif-');
  });
});
