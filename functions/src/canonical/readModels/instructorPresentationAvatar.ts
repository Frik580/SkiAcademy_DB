/** Presentation bound shared with Admin Instructor / Planner avatarUrl schemas. */
export const INSTRUCTOR_PRESENTATION_AVATAR_URL_MAX = 2_000;

/**
 * Tolerant presentation sanitizer for historical Instructor catalog `avatarUrl`.
 * Omits oversized, empty, or data-URL values so read models stay available.
 * Does not mutate Firestore and must not be used to relax canonical writes.
 */
export function sanitizeInstructorPresentationAvatarUrl(
  avatarUrl: string | undefined
): string | undefined {
  if (typeof avatarUrl !== 'string') {
    return undefined;
  }
  const trimmed = avatarUrl.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > INSTRUCTOR_PRESENTATION_AVATAR_URL_MAX) {
    return undefined;
  }
  if (/^data:/i.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}
