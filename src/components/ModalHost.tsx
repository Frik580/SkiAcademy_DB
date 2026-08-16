import { ModalHost as FeatureModalHost } from '../features/ui/ModalHost';

export { ModalHost } from '../features/ui/ModalHost';

// Re-export references for backwards compatibility and static analysis
export type ModalHostHandleDeleteNotification = typeof FeatureModalHost;
// handleDeleteNotification is wired within ModalHost via useNotificationsStore
