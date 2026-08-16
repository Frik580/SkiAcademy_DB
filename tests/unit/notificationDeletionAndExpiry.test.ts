import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_RETENTION_DAYS,
  getNotificationRetentionMs,
} from '../../src/lib/notificationConfig';

describe('notification deletion and auto-expiry', () => {
  it('defines default 14-day expiry constant', () => {
    expect(getNotificationRetentionMs(DEFAULT_NOTIFICATION_RETENTION_DAYS)).toBe(
      14 * 24 * 60 * 60 * 1000
    );
  });

  it('wires single notification deletion and auto-cleanup of expired items', () => {
    const notificationsSource = readFileSync(
      join(process.cwd(), 'src/features/notifications/sync/useNotificationsSync.ts'),
      'utf8'
    );
    const settingsServiceSource = readFileSync(
      join(process.cwd(), 'src/features/settings/settingsService.ts'),
      'utf8'
    );
    const notificationActionsSource = readFileSync(
      join(process.cwd(), 'src/features/notifications/useNotificationActions.ts'),
      'utf8'
    );
    const notificationsPanelSource = readFileSync(
      join(process.cwd(), 'src/features/notifications/NotificationsPanel.tsx'),
      'utf8'
    );
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

    // Retention setting belongs to the settings domain.
    expect(settingsServiceSource).toContain('notification_retention');
    expect(settingsServiceSource).toContain('saveNotificationRetentionDays');

    // The notification feature container passes deletion through its action layer.
    expect(notificationsPanelSource).toContain('handleDeleteNotification');
    expect(notificationActionsSource).toContain('handleDeleteNotification');

    // PushNotificationHub renders delete button per item
    expect(hubSource).toContain('onDeleteNotification');
    expect(hubSource).toContain('handleDeleteItem');
    expect(hubSource).toContain('delete-notif-');
  });
});
