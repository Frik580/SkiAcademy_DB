export type StudentCabinetTab =
  | 'home'
  | 'training'
  | 'coach'
  | 'development'
  | 'calendar'
  | 'courses'
  | 'instructors'
  | 'settings'
  | 'profile_personal'
  | 'profile_wallet'
  | 'profile_journey'
  | 'profile_skills'
  | 'profile_certificates'
  | 'profile_achievements'
  | 'profile_season'
  | 'profile_videos'
  | 'profile_preferences'
  | 'profile_participants'
  | 'history';

export const PROFILE_TABS: StudentCabinetTab[] = [
  'settings',
  'profile_personal',
  'profile_wallet',
  'profile_journey',
  'profile_skills',
  'profile_certificates',
  'profile_achievements',
  'profile_season',
  'profile_videos',
  'profile_preferences',
  'profile_participants',
];

export const isProfileTab = (tab: StudentCabinetTab) => PROFILE_TABS.includes(tab);

/** Maps deep-link tabs to the bottom navigation item that should appear active. */
export const resolveStudentBottomNavTab = (tab: StudentCabinetTab): StudentCabinetTab => {
  if (tab === 'development' || tab === 'calendar' || tab === 'courses') return 'training';
  if (tab === 'instructors') return 'coach';
  if (isProfileTab(tab)) return 'settings';
  return tab;
};
