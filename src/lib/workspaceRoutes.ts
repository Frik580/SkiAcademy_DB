import { UserProfile } from '../types';
import { StudentCabinetTab } from '../components/personal_cabinet/student/studentCabinetUtils';

export const CABINET_TABS: StudentCabinetTab[] = [
  'home',
  'development',
  'calendar',
  'courses',
  'instructors',
  'settings',
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
