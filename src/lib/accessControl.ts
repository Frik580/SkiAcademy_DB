import { UserProfile } from '../types';

export const isSystemOwner = (
  profile: Pick<UserProfile, 'systemRole'> | null | undefined
): boolean => profile?.systemRole === 'owner';

export const canManageAdminRoles = (
  profile: Pick<UserProfile, 'role' | 'systemRole'> | null | undefined
): boolean => profile?.role === 'admin' && isSystemOwner(profile);
