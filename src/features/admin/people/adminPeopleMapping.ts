import type { AdminAccountListItem, AdminInstructorListItem } from '@ski-academy/shared-domain';
import type { Instructor, UserProfile } from '../../../types';

export function accountListItemToUserProfile(item: AdminAccountListItem): UserProfile {
  return {
    uid: item.accountId,
    email: item.email ?? '',
    displayName: item.displayName,
    role: item.role.role === 'admin' ? 'admin' : 'user',
    systemRole: item.role.systemRole,
    avatarUrl: '',
    balanceUSD: 0,
    isClientActive: item.lifecycle === 'active',
    instructorId: item.instructorLink.instructorId,
    isInstructor: item.instructorLink.isInstructor,
  };
}

export function mergeAdminClientDirectory(
  storeUsers: readonly UserProfile[],
  identityAccounts: readonly AdminAccountListItem[]
): UserProfile[] {
  const byId = new Map(storeUsers.map((user) => [user.uid, user]));
  for (const item of identityAccounts) {
    const mapped = accountListItemToUserProfile(item);
    const existing = byId.get(mapped.uid);
    byId.set(
      mapped.uid,
      existing
        ? {
            ...existing,
            ...mapped,
            avatarUrl: existing.avatarUrl,
            balanceUSD: existing.balanceUSD,
          }
        : mapped
    );
  }
  return [...byId.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
}

export function instructorListItemToInstructor(
  item: AdminInstructorListItem,
  fallback?: Instructor
): Instructor {
  return {
    id: item.instructorId,
    name: item.name,
    specialty: fallback?.specialty ?? 'ski',
    rating: fallback?.rating ?? 0,
    reviewsCount: fallback?.reviewsCount ?? 0,
    languages: fallback?.languages ?? [],
    experienceYears: fallback?.experienceYears ?? 0,
    bio: fallback?.bio ?? '',
    avatarUrl: fallback?.avatarUrl ?? '',
    pricePerHour: fallback?.pricePerHour ?? fallback?.pricePerHourKZT ?? 0,
    pricePerHourKZT: fallback?.pricePerHourKZT,
    phoneNumber: fallback?.phoneNumber,
    isAvailable: item.isAvailable,
  };
}

export function mergeAdminInstructorDirectory(
  storeInstructors: readonly Instructor[],
  identityInstructors: readonly AdminInstructorListItem[]
): Instructor[] {
  const fallbackById = new Map(storeInstructors.map((instructor) => [instructor.id, instructor]));
  if (identityInstructors.length === 0) return [...storeInstructors];
  const byId = new Map<string, Instructor>();
  for (const item of identityInstructors) {
    byId.set(item.instructorId, instructorListItemToInstructor(item, fallbackById.get(item.instructorId)));
  }
  for (const instructor of storeInstructors) {
    if (!byId.has(instructor.id)) byId.set(instructor.id, instructor);
  }
  return [...byId.values()];
}

export function filterPeopleBySearch<T extends { displayName?: string; name?: string; email?: string }>(
  items: readonly T[],
  search: string
): T[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) => {
    const name = ('displayName' in item ? item.displayName : item.name) ?? '';
    const email = item.email ?? '';
    return name.toLowerCase().includes(needle) || email.toLowerCase().includes(needle);
  });
}
