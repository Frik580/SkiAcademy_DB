import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_RETENTION_DAYS,
  getNotificationRetentionMs,
} from '../../src/lib/notificationConfig';
import { TWO_WEEKS_MS } from '../../src/components/useNotifications';

describe('notification deletion and auto-expiry', () => {
  it('defines default 14-day expiry constant', () => {
    expect(TWO_WEEKS_MS).toBe(getNotificationRetentionMs(DEFAULT_NOTIFICATION_RETENTION_DAYS));
    expect(TWO_WEEKS_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('wires single notification deletion and auto-cleanup of expired items', () => {
    const notificationsSource = readFileSync(
      join(process.cwd(), 'src/components/useNotifications.ts'),
      'utf8'
    );
    const uiStoreSource = readFileSync(join(process.cwd(), 'src/store/uiStore.ts'), 'utf8');
    const authStoreSource = readFileSync(join(process.cwd(), 'src/store/authStore.ts'), 'utf8');
    const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
    const hubSource = readFileSync(
      join(process.cwd(), 'src/components/PushNotificationHub.tsx'),
      'utf8'
    );

    // Single notification deletion function
    expect(notificationsSource).toContain('handleDeleteNotification');
    expect(notificationsSource).toContain('deleteDoc');

    // Auto-cleanup of expired notifications uses configurable retention
    expect(notificationsSource).toContain('retentionDays');
    expect(notificationsSource).toContain('getNotificationRetentionMs');
    expect(notificationsSource).toContain('expiredNotifications');
    expect(notificationsSource).toContain("deleteDoc(doc(db, 'notifications', expired.id))");

    // Retention setting is loaded and passed from ui store
    expect(uiStoreSource).toContain('notification_retention');
    expect(uiStoreSource).toContain('handleSetNotificationRetentionDays');

    // App.tsx passes handleDeleteNotification from auth store
    expect(appSource).toContain('handleDeleteNotification');
    expect(authStoreSource).toContain('handleDeleteNotification');

    // PushNotificationHub renders delete button per item
    expect(hubSource).toContain('onDeleteNotification');
    expect(hubSource).toContain('handleDeleteItem');
    expect(hubSource).toContain('delete-notif-');
  });
});
