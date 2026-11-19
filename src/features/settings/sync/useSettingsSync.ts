import { useLessonLevelsStore } from '../lessonLevelsStore';
import { useEffect } from 'react';
import { db, doc, onSnapshot } from '../../../infrastructure/firebase';
import {
  DEFAULT_ACHIEVEMENTS_CONFIG,
  normalizeAchievementsConfig,
} from '../../../domain/achievements';
import { DEFAULT_NOTIFICATION_RETENTION_DAYS } from '../../../domain/notifications';
import { DEFAULT_SKILL_CONFIG } from '../../../domain/achievements';
import { DEFAULT_STARTER_CREDIT_KZT, resolveStarterCreditAmountKzt } from '../../../domain/wallet';
import { logger } from '../../../shared';
import { useSettingsStore, type SecondarySetting } from '../settingsStore';
import {
  normalizeStudentDashboardLayout,
  STUDENT_DASHBOARD_LAYOUT_SETTING_ID,
} from '../studentDashboardLayout';
import type { DocumentData } from 'firebase/firestore';

const secondarySettingIds: Record<SecondarySetting, string> = {
  studentDashboardLayout: STUDENT_DASHBOARD_LAYOUT_SETTING_ID,
  notificationRetentionDays: 'notification_retention',
  starterCreditKzt: 'starter_credit',
  skillConfig: 'skill_config',
  achievementsConfig: 'achievements_config',
};

const receiveSecondarySetting: Record<SecondarySetting, (data?: DocumentData) => void> = {
  studentDashboardLayout: (data) =>
    useSettingsStore
      .getState()
      .receiveSecondarySetting(
        'studentDashboardLayout',
        normalizeStudentDashboardLayout(data),
        data !== undefined
      ),
  notificationRetentionDays: (data) =>
    useSettingsStore
      .getState()
      .receiveSecondarySetting(
        'notificationRetentionDays',
        data?.days ?? DEFAULT_NOTIFICATION_RETENTION_DAYS,
        data !== undefined
      ),
  starterCreditKzt: (data) =>
    useSettingsStore
      .getState()
      .receiveSecondarySetting(
        'starterCreditKzt',
        data ? resolveStarterCreditAmountKzt(data) : DEFAULT_STARTER_CREDIT_KZT,
        data !== undefined
      ),
  skillConfig: (data) =>
    useSettingsStore.getState().receiveSecondarySetting(
      'skillConfig',
      data
        ? {
            passPercentage: data.passPercentage ?? 80,
            items:
              Array.isArray(data.items) && data.items.length > 0
                ? data.items
                : DEFAULT_SKILL_CONFIG.items,
          }
        : DEFAULT_SKILL_CONFIG,
      data !== undefined
    ),
  achievementsConfig: (data) =>
    useSettingsStore
      .getState()
      .receiveSecondarySetting(
        'achievementsConfig',
        data ? normalizeAchievementsConfig(data) : DEFAULT_ACHIEVEMENTS_CONFIG,
        data !== undefined
      ),
};

const scheduleIdle = (fn: () => void): (() => void) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const id = window.requestIdleCallback(fn, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = globalThis.setTimeout(fn, 1);
  return () => globalThis.clearTimeout(id);
};

export const useSettingsSync = () => {
  useEffect(() => {
    const unsubscribeLessonLevels = onSnapshot(
      doc(db, 'settings', 'lesson_levels'),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!snapshot.metadata.hasPendingWrites) {
          useLessonLevelsStore.getState().receive(snapshot.exists() ? snapshot.data() : undefined);
        }
      },
      (error) => {
        useLessonLevelsStore.getState().fail();
        logger.error('Lesson levels sync error:', error);
      }
    );
    // Theme + filters affect first paint / home layout — subscribe immediately.
    const unsubscribeFilters = onSnapshot(
      doc(db, 'settings', 'instructor_filters'),
      (snapshot) =>
        useSettingsStore
          .getState()
          .setFiltersEnabled(snapshot.exists() ? (snapshot.data().enabled ?? true) : true),
      (error) => logger.error('Instructor filters settings sync error:', error)
    );
    // Each public setting keeps its own listener and retry lifecycle.
    const subscriptions = new Map<SecondarySetting, () => void>();
    const subscribe = (setting: SecondarySetting) => {
      subscriptions.get(setting)?.();
      const store = useSettingsStore.getState();
      const id = secondarySettingIds[setting];
      store.setSecondaryRead(
        setting,
        store.secondaryReads[setting].confirmed ? 'refreshing' : 'loading'
      );
      let active = true;
      const unsubscribe = onSnapshot(
        doc(db, 'settings', id),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!active || snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
          receiveSecondarySetting[setting](snapshot.exists() ? snapshot.data() : undefined);
        },
        (error) => {
          if (!active) return;
          active = false;
          useSettingsStore.getState().setSecondaryRead(setting, 'error');
          logger.error(`Setting sync error (${id}):`, error);
        }
      );
      subscriptions.set(setting, () => {
        active = false;
        unsubscribe();
      });
    };
    const retrySecondarySetting = (setting: SecondarySetting) => {
      if (useSettingsStore.getState().secondaryReads[setting].status === 'error') {
        subscribe(setting);
      }
    };
    const cancelIdle = scheduleIdle(() => {
      useSettingsStore.setState({ retrySecondarySetting });
      (Object.keys(secondarySettingIds) as SecondarySetting[]).forEach(subscribe);
    });

    return () => {
      cancelIdle();
      unsubscribeLessonLevels();
      unsubscribeFilters();
      subscriptions.forEach((unsubscribe) => unsubscribe());
      if (useSettingsStore.getState().retrySecondarySetting === retrySecondarySetting) {
        useSettingsStore.setState({ retrySecondarySetting: undefined });
      }
    };
  }, []);
};
