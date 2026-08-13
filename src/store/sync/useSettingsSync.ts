import { useEffect } from 'react';
import {
  collection,
  db,
  doc,
  getDoc,
  handleFirestoreError,
  limit,
  onSnapshot,
  OperationType,
  query,
} from '../../lib/firebase';
import { Instructor } from '../../types';
import { DEFAULT_SKILL_CONFIG } from '../../lib/skillData';
import {
  DEFAULT_ACHIEVEMENTS_CONFIG,
  normalizeAchievementsConfig,
} from '../../lib/achievementConfig';
import { DEFAULT_NOTIFICATION_RETENTION_DAYS } from '../../lib/notificationConfig';
import { parseDesignTheme } from '../../lib/designTheme';
import { QUERY_LIMITS } from '../../lib/queryLimits';
import { logger } from '../../lib/logger';
import { useBookingStore } from '../bookingStore';
import { useUiStore } from '../uiStore';

export const useSettingsSync = () => {
  // Initial settings load
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsSnapshot = await getDoc(doc(db, 'settings', 'instructor_filters'));
        useUiStore
          .getState()
          .setFiltersEnabled(
            settingsSnapshot.exists() ? (settingsSnapshot.data().enabled ?? true) : true
          );
      } catch {
        useUiStore.getState().setFiltersEnabled(true);
      }

      try {
        const onboardingSnapshot = await getDoc(doc(db, 'settings', 'onboarding'));
        useUiStore
          .getState()
          .setOnboardingEnabled(
            onboardingSnapshot.exists() ? (onboardingSnapshot.data().enabled ?? true) : true
          );
      } catch {
        useUiStore.getState().setOnboardingEnabled(true);
      }

      try {
        const designSnapshot = await getDoc(doc(db, 'settings', 'design_theme'));
        useUiStore
          .getState()
          .setDesignTheme(
            designSnapshot.exists() ? parseDesignTheme(designSnapshot.data().theme) : 'air'
          );
      } catch {
        useUiStore.getState().setDesignTheme('air');
      }

      try {
        const retentionSnapshot = await getDoc(doc(db, 'settings', 'notification_retention'));
        useUiStore
          .getState()
          .setNotificationRetentionDays(
            retentionSnapshot.exists()
              ? (retentionSnapshot.data().days ?? DEFAULT_NOTIFICATION_RETENTION_DAYS)
              : DEFAULT_NOTIFICATION_RETENTION_DAYS
          );
      } catch {
        useUiStore.getState().setNotificationRetentionDays(DEFAULT_NOTIFICATION_RETENTION_DAYS);
      }
    };

    loadSettings();
  }, []);

  // Instructors + settings listeners
  useEffect(() => {
    const unsubscribers = [
      onSnapshot(
        query(collection(db, 'instructors'), limit(QUERY_LIMITS.instructors)),
        (snapshot) => {
          useBookingStore
            .getState()
            .setInstructors(
              snapshot.docs.map(
                (instructorDoc) => ({ id: instructorDoc.id, ...instructorDoc.data() }) as Instructor
              )
            );
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'instructors')
      ),

      onSnapshot(
        doc(db, 'settings', 'skill_config'),
        (snapshot) => {
          if (!snapshot.exists()) return;
          const data = snapshot.data();
          useUiStore.getState().setSkillConfig({
            passPercentage: data.passPercentage ?? 80,
            items:
              Array.isArray(data.items) && data.items.length > 0
                ? data.items
                : DEFAULT_SKILL_CONFIG.items,
          });
        },
        (error) => logger.error('Skill config listener error:', error)
      ),

      onSnapshot(
        doc(db, 'settings', 'achievements_config'),
        (snapshot) => {
          if (!snapshot.exists()) {
            useUiStore.getState().setAchievementsConfig(DEFAULT_ACHIEVEMENTS_CONFIG);
            return;
          }
          useUiStore.getState().setAchievementsConfig(normalizeAchievementsConfig(snapshot.data()));
        },
        (error) => logger.error('Achievements config listener error:', error)
      ),

      onSnapshot(
        doc(db, 'settings', 'design_theme'),
        (snapshot) => {
          if (!snapshot.exists()) {
            useUiStore.getState().setDesignTheme('air');
            return;
          }
          useUiStore.getState().setDesignTheme(parseDesignTheme(snapshot.data().theme));
        },
        (error) => logger.error('Design theme listener error:', error)
      ),
    ];

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);
};
