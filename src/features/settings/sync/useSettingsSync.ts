import { useEffect } from 'react';
import { db, doc, onSnapshot } from '../../../infrastructure/firebase';
import {
  DEFAULT_ACHIEVEMENTS_CONFIG,
  normalizeAchievementsConfig,
} from '../../../domain/achievements';
import { DEFAULT_NOTIFICATION_RETENTION_DAYS } from '../../../domain/notifications';
import { DEFAULT_SKILL_CONFIG } from '../../../domain/achievements';
import { DEFAULT_STARTER_CREDIT_USD, normalizeStarterCreditUsd } from '../../../domain/wallet';
import { logger } from '../../../shared';
import { useSettingsStore } from '../settingsStore';

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
    // Theme + filters affect first paint / home layout — subscribe immediately.
    const unsubscribeFilters = onSnapshot(
      doc(db, 'settings', 'instructor_filters'),
      (snapshot) =>
        useSettingsStore
          .getState()
          .setFiltersEnabled(snapshot.exists() ? (snapshot.data().enabled ?? true) : true),
      (error) => logger.error('Instructor filters settings sync error:', error)
    );
    // Secondary settings — defer until idle to shorten critical-path Listen spam.
    let unsubscribeRetention: (() => void) | undefined;
    let unsubscribeStarterCredit: (() => void) | undefined;
    let unsubscribeSkills: (() => void) | undefined;
    let unsubscribeAchievements: (() => void) | undefined;

    const cancelIdle = scheduleIdle(() => {
      unsubscribeRetention = onSnapshot(
        doc(db, 'settings', 'notification_retention'),
        (snapshot) =>
          useSettingsStore
            .getState()
            .setNotificationRetentionDays(
              snapshot.exists()
                ? (snapshot.data().days ?? DEFAULT_NOTIFICATION_RETENTION_DAYS)
                : DEFAULT_NOTIFICATION_RETENTION_DAYS
            ),
        (error) => logger.error('Notification retention settings sync error:', error)
      );
      unsubscribeStarterCredit = onSnapshot(
        doc(db, 'settings', 'starter_credit'),
        (snapshot) =>
          useSettingsStore
            .getState()
            .setStarterCreditUsd(
              snapshot.exists()
                ? normalizeStarterCreditUsd(snapshot.data().amountUsd)
                : DEFAULT_STARTER_CREDIT_USD
            ),
        (error) => logger.error('Starter credit settings sync error:', error)
      );
      unsubscribeSkills = onSnapshot(
        doc(db, 'settings', 'skill_config'),
        (snapshot) =>
          useSettingsStore.getState().setSkillConfig(
            snapshot.exists()
              ? {
                  passPercentage: snapshot.data().passPercentage ?? 80,
                  items:
                    Array.isArray(snapshot.data().items) && snapshot.data().items.length > 0
                      ? snapshot.data().items
                      : DEFAULT_SKILL_CONFIG.items,
                }
              : DEFAULT_SKILL_CONFIG
          ),
        (error) => logger.error('Skill config settings sync error:', error)
      );
      unsubscribeAchievements = onSnapshot(
        doc(db, 'settings', 'achievements_config'),
        (snapshot) =>
          useSettingsStore
            .getState()
            .setAchievementsConfig(
              snapshot.exists()
                ? normalizeAchievementsConfig(snapshot.data())
                : DEFAULT_ACHIEVEMENTS_CONFIG
            ),
        (error) => logger.error('Achievements settings sync error:', error)
      );
    });

    return () => {
      cancelIdle();
      unsubscribeFilters();
      unsubscribeRetention?.();
      unsubscribeStarterCredit?.();
      unsubscribeSkills?.();
      unsubscribeAchievements?.();
    };
  }, []);
};
