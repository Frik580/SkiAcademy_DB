/**
 * @deprecated Import UI state from features/ui/uiStore and server settings from
 * features/settings/settingsStore. Settings such as `notification_retention`
 * and `handleSetNotificationRetentionDays` now belong to the settings domain.
 */
export * from '../features/ui/uiStore';
export { useSettingsStore } from '../features/settings/settingsStore';
