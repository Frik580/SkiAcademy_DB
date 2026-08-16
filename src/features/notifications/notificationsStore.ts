import { create } from 'zustand';
import type { DbNotification } from '../../lib/notificationText';
import type { NotificationsState } from './types';

export const useNotificationsStore = create<NotificationsState>((set) => ({
  dbNotifications: [],

  setDbNotifications: (notifications: DbNotification[]) => {
    set({ dbNotifications: notifications });
  },
}));
