import { UserProfile } from '../types';
import { StudentCabinetTab } from '../components/personal_cabinet/student/studentCabinetUtils';

export const CABINET_TABS: StudentCabinetTab[] = [
  'home',
  'training',
  'coach',
  'development',
  'calendar',
  'courses',
  'instructors',
  'settings',
  'profile_personal',
  'profile_journey',
  'profile_skills',
  'profile_certificates',
  'profile_achievements',
  'profile_season',
  'profile_videos',
  'profile_preferences',
  'history',
];

export const isInstructorWorkspaceUser = (profile: UserProfile) =>
  profile.role === 'admin' || !!profile.isInstructor;

export const getDefaultWorkspacePath = (profile: UserProfile) =>
  isInstructorWorkspaceUser(profile) ? '/instructor' : '/cabinet';

export const parseCabinetTabParam = (tab?: string): StudentCabinetTab => {
  if (tab && CABINET_TABS.includes(tab as StudentCabinetTab)) {
    return tab as StudentCabinetTab;
  }
  return 'home';
};

export const cabinetPathForTab = (tab: StudentCabinetTab) =>
  tab === 'home' ? '/cabinet' : `/cabinet/${tab}`;
