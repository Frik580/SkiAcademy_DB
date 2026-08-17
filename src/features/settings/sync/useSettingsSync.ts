import { useEffect } from 'react';
import { db, doc, onSnapshot } from '../../../infrastructure/firebase/firebase';
import {
  DEFAULT_ACHIEVEMENTS_CONFIG,
  normalizeAchievementsConfig,
} from '../../../lib/achievementConfig';
import { parseDesignTheme } from '../../../lib/designTheme';
import { DEFAULT_NOTIFICATION_RETENTION_DAYS } from '../../../lib/notificationConfig';
import { DEFAULT_SKILL_CONFIG } from '../../../lib/skillData';
import { logger } from '../../../lib/logger';
import { useSettingsStore } from '../settingsStore';

export const useSettingsSync = () => {
  useEffect(() => {
    const unsubscribeFilters = onSnapshot(
      doc(db, 'settings', 'instructor_filters'),
      (snapshot) =>
        useSettingsStore
          .getState()
          .setFiltersEnabled(snapshot.exists() ? (snapshot.data().enabled ?? true) : true),
      (error) => logger.error('Instructor filters settings sync error:', error)
    );
    const unsubscribeOnboarding = onSnapshot(
      doc(db, 'settings', 'onboarding'),
      (snapshot) =>
        useSettingsStore
          .getState()
          .setOnboardingEnabled(snapshot.exists() ? (snapshot.data().enabled ?? true) : true),
      (error) => logger.error('Onboarding settings sync error:', error)
    );
    const unsubscribeTheme = onSnapshot(
      doc(db, 'settings', 'design_theme'),
      (snapshot) =>
        useSettingsStore
          .getState()
          .setDesignTheme(snapshot.exists() ? parseDesignTheme(snapshot.data().theme) : 'air'),
      (error) => logger.error('Design theme settings sync error:', error)
    );
    const unsubscribeRetention = onSnapshot(
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
    const unsubscribeSkills = onSnapshot(
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
    const unsubscribeAchievements = onSnapshot(
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

    return () => {
      unsubscribeFilters();
      unsubscribeOnboarding();
      unsubscribeTheme();
      unsubscribeRetention();
      unsubscribeSkills();
      unsubscribeAchievements();
    };
  }, []);
};
