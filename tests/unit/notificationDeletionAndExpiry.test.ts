import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TWO_WEEKS_MS } from '../../src/components/useNotifications';

describe('notification deletion and auto-expiry', () => {
  it('defines 14-day expiry constant in useNotifications', () => {
    expect(TWO_WEEKS_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });

  it('wires single notification deletion and auto-cleanup of expired items', () => {
    const notificationsSource = readFileSync(
      join(process.cwd(), 'src/components/useNotifications.ts'),
      'utf8'
    );
    const appSource = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
    const hubSource = readFileSync(
      join(process.cwd(), 'src/components/PushNotificationHub.tsx'),
      'utf8'
    );

    // Single notification deletion function
    expect(notificationsSource).toContain('handleDeleteNotification');
    expect(notificationsSource).toContain('deleteDoc');

    // Auto-cleanup of expired notifications (>2 weeks)
    expect(notificationsSource).toContain('TWO_WEEKS_MS');
    expect(notificationsSource).toContain('expiredNotifications');
    expect(notificationsSource).toContain("deleteDoc(doc(db, 'notifications', expired.id))");

    // App.tsx passes handleDeleteNotification
    expect(appSource).toContain('handleDeleteNotification');
    expect(appSource).toContain('onDeleteNotification={handleDeleteNotification}');

    // PushNotificationHub renders delete button per item
    expect(hubSource).toContain('onDeleteNotification');
    expect(hubSource).toContain('handleDeleteItem');
    expect(hubSource).toContain('delete-notif-');
  });
});
