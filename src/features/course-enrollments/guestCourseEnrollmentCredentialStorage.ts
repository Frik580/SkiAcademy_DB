import {
  GuestCourseEnrollmentLinkCredentialSchema,
  type GuestCourseEnrollmentLinkCredential,
} from '@ski-academy/shared-domain';

const STORAGE_KEY_PREFIX = 'ski_academy_guest_course_enrollment_credential:';

export type GuestCourseCredentialStorageError = 'missing' | 'expired' | 'malformed';

export function guestCourseEnrollmentCredentialStorageKey(enrollmentId: string): string {
  return `${STORAGE_KEY_PREFIX}${enrollmentId}`;
}

export function persistGuestCourseEnrollmentCredential(
  credential: GuestCourseEnrollmentLinkCredential
): void {
  const key = guestCourseEnrollmentCredentialStorageKey(credential.enrollmentId);
  localStorage.setItem(key, JSON.stringify(credential));
}

export function readGuestCourseEnrollmentCredential(enrollmentId: string): {
  readonly credential?: GuestCourseEnrollmentLinkCredential;
  readonly error?: GuestCourseCredentialStorageError;
} {
  const raw = localStorage.getItem(guestCourseEnrollmentCredentialStorageKey(enrollmentId));
  if (!raw) {
    return { error: 'missing' };
  }
  try {
    const parsed = JSON.parse(raw);
    const result = GuestCourseEnrollmentLinkCredentialSchema.safeParse(parsed);
    if (!result.success) {
      return { error: 'malformed' };
    }
    const nowMs = Date.now();
    const expiresMs =
      result.data.expiresAt.seconds * 1000 + result.data.expiresAt.nanoseconds / 1_000_000;
    if (expiresMs <= nowMs) {
      return { error: 'expired' };
    }
    return { credential: result.data };
  } catch {
    return { error: 'malformed' };
  }
}

export function removeGuestCourseEnrollmentCredential(enrollmentId: string): void {
  localStorage.removeItem(guestCourseEnrollmentCredentialStorageKey(enrollmentId));
}
