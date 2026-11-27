import { GuestCourseEnrollmentLinkCredentialSchema } from '@ski-academy/shared-domain/canonical/commands/commandResultPayloads';
import { type CommandEnvelope, type GuestCourseEnrollmentLinkCredential } from '@ski-academy/shared-domain';

const STORAGE_KEY_PREFIX = 'ski_academy_guest_course_enrollment_credential:';
const PARTICIPANT_ORIGIN_KEY = 'ski_academy_guest_course_participant_origin';

export function rememberGuestCourseParticipantOrigin(participantId: string, enrollmentId: string): void {
  localStorage.setItem(PARTICIPANT_ORIGIN_KEY, JSON.stringify([participantId, enrollmentId]));
}

export function readGuestCourseParticipantProof(
  participantId: string,
  fallbackEnrollmentIds: readonly string[] = []
): CommandEnvelope<'create_course_enrollments'>['intent']['guestParticipantProof'] {
  const candidateIds = [...fallbackEnrollmentIds];
  try {
    const origin: unknown = JSON.parse(localStorage.getItem(PARTICIPANT_ORIGIN_KEY) ?? 'null');
    if (Array.isArray(origin) && origin[0] === participantId && typeof origin[1] === 'string') {
      candidateIds.unshift(origin[1]);
    }
  } catch {
    // Older browser storage may have a credential and no origin reference.
  }
  for (const enrollmentId of candidateIds) {
    const credential = readGuestCourseEnrollmentCredential(enrollmentId).credential;
    if (credential?.enrollmentId !== enrollmentId || credential.participantReadCredential) continue;
    const { nonce, signature, expiresAt } = credential;
    return { courseEnrollmentId: credential.enrollmentId, credential: { nonce, signature, expiresAt } };
  }
  return undefined;
}

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

export function listStoredGuestCourseEnrollmentCredentials(): readonly GuestCourseEnrollmentLinkCredential[] {
  const credentials: GuestCourseEnrollmentLinkCredential[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(STORAGE_KEY_PREFIX)) {
      continue;
    }
    const enrollmentId = key.slice(STORAGE_KEY_PREFIX.length);
    const stored = readGuestCourseEnrollmentCredential(enrollmentId);
    if (stored.credential) {
      credentials.push(stored.credential);
    }
  }
  return credentials;
}
