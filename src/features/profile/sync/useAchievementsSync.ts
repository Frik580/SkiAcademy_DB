import { useParticipantAchievementsSync } from '../../participant-achievements';

/** Loads canonical participant-scoped earned achievements. Does not use legacy bookings. */
export const useAchievementsSync = () => {
  useParticipantAchievementsSync();
};
