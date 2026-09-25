import {
  IdempotencyKeySchema,
  normalizeInstructorSpokenLanguage,
  normalizeInstructorSpokenLanguages,
  type AccountId,
  type AdminInstructorDetailReadModel,
  type AdminInstructorListItem,
  type InstructorId,
  type InstructorSpokenLanguageCode,
} from '@ski-academy/shared-domain';

export const ADMIN_INSTRUCTOR_DIRECTORY_PAGE_SIZE = 20;
export const ADMIN_INSTRUCTOR_CREATE_REASON = 'Admin instructor directory create';
export const ADMIN_INSTRUCTOR_PROFILE_REASON = 'Admin instructor directory profile update';
export const ADMIN_INSTRUCTOR_LIFECYCLE_REASON = 'Admin instructor directory lifecycle update';
export const ADMIN_INSTRUCTOR_LINK_REASON = 'Admin instructor directory account link';
export const ADMIN_INSTRUCTOR_UNLINK_REASON = 'Admin instructor directory account unlink';
export const ADMIN_INSTRUCTOR_DELETE_REASON = 'Admin instructor directory hard delete';

export type AdminInstructorDirectoryRow = Pick<
  AdminInstructorListItem,
  | 'instructorId'
  | 'name'
  | 'specialty'
  | 'isAvailable'
  | 'linkedAccountId'
  | 'linkedAccountDisplayName'
  | 'pricePerHourKZT'
  | 'revision'
  | 'authorizedActions'
>;

export type AdminInstructorDetailView = Pick<
  AdminInstructorDetailReadModel,
  | 'instructorId'
  | 'name'
  | 'specialty'
  | 'isAvailable'
  | 'linkedAccountId'
  | 'linkedAccountDisplayName'
  | 'linkedAccountLifecycle'
  | 'pricePerHourKZT'
  | 'bio'
  | 'bioRu'
  | 'bioEn'
  | 'avatarUrl'
  | 'phoneNumber'
  | 'languages'
  | 'experienceYears'
  | 'courseRosterCount'
  | 'courseDayAssignmentCount'
  | 'futureLessonCommitmentCount'
  | 'futureCourseDayAssignmentCount'
  | 'unlinkBlockedByCommitments'
  | 'activeAvailabilityBlockCount'
  | 'deleteBlockedByCommitments'
  | 'deleteBlockedReason'
  | 'diagnostics'
  | 'revision'
  | 'authorizedActions'
>;

export type AdminInstructorSpecialty = 'ski' | 'snowboard' | 'both';

export interface AdminInstructorProfileDraft {
  readonly name: string;
  readonly specialty: AdminInstructorSpecialty;
  readonly languages: string;
  readonly experienceYears: string;
  readonly bioRu: string;
  readonly bioEn: string;
  readonly phoneNumber: string;
  readonly pricePerHourKZT: string;
  readonly avatarUrl: string;
}

export const EMPTY_ADMIN_INSTRUCTOR_PROFILE_DRAFT: AdminInstructorProfileDraft = {
  name: '',
  specialty: 'ski',
  languages: '',
  experienceYears: '',
  bioRu: '',
  bioEn: '',
  phoneNumber: '',
  pricePerHourKZT: '',
  avatarUrl: '',
};

export function adminInstructorProfileDraftFromDetail(
  detail: Pick<
    AdminInstructorDetailView,
    | 'name'
    | 'specialty'
    | 'languages'
    | 'experienceYears'
    | 'bio'
    | 'bioRu'
    | 'bioEn'
    | 'phoneNumber'
    | 'pricePerHourKZT'
    | 'avatarUrl'
  >
): AdminInstructorProfileDraft {
  return {
    name: detail.name,
    specialty: detail.specialty ?? 'ski',
    languages: normalizeInstructorSpokenLanguages(detail.languages ?? []).join(', '),
    experienceYears: detail.experienceYears === undefined ? '' : String(detail.experienceYears),
    bioRu: detail.bioRu?.trim() || detail.bio?.trim() || '',
    bioEn: detail.bioEn?.trim() || '',
    phoneNumber: detail.phoneNumber ?? '',
    pricePerHourKZT: detail.pricePerHourKZT === undefined ? '' : String(detail.pricePerHourKZT),
    avatarUrl: detail.avatarUrl ?? '',
  };
}

export function localizedInstructorProfileFields(draft: AdminInstructorProfileDraft): {
  bio?: string;
  bioRu?: string;
  bioEn?: string;
} {
  const bioRu = draft.bioRu.trim();
  const bioEn = draft.bioEn.trim();
  return {
    ...(bioRu ? { bioRu, bio: bioRu } : {}),
    ...(bioEn ? { bioEn } : {}),
  };
}

export function parseInstructorLanguagesCsv(value: string): string[] {
  return normalizeInstructorSpokenLanguages(value.split(','));
}

export function formatInstructorSpokenLanguageList(
  languages: readonly string[] | undefined,
  labels: Readonly<Record<InstructorSpokenLanguageCode, string>>
): string {
  return normalizeInstructorSpokenLanguages(languages ?? [])
    .map((token) => {
      const code = normalizeInstructorSpokenLanguage(token);
      return code ? labels[code] : token;
    })
    .join(', ');
}

export function adminInstructorAttemptKey(
  action: string,
  subjectId: InstructorId | AccountId | string
) {
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  return IdempotencyKeySchema.parse(`admin_instructors:${action}:${subjectId}:${entropy}`);
}
