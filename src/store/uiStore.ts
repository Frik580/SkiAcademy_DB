export * from '../features/ui/uiStore';
import type { UiState } from '../features/ui/uiStore';

// Retention keys and handler signature references for backwards compatibility and static analysis
export const NOTIFICATION_RETENTION_SETTING_KEY = 'notification_retention';
export type HandleSetNotificationRetentionDays = UiState['handleSetNotificationRetentionDays'];
