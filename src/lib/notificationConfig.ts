export const DEFAULT_NOTIFICATION_RETENTION_DAYS = 14;
export const MIN_NOTIFICATION_RETENTION_DAYS = 1;
export const MAX_NOTIFICATION_RETENTION_DAYS = 365;

export const getNotificationRetentionMs = (days: number): number => days * 24 * 60 * 60 * 1000;
