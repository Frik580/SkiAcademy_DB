type GuestReservationKind = 'lesson' | 'course';

const forgottenInThisSession = new Set<string>();

function key(kind: GuestReservationKind, catalogId: string): string {
  return `ski_academy_guest_reservation:${kind}:${catalogId}`;
}

/** Browser convenience only; the subject-scoped credential remains read authority. */
export function rememberGuestReservation(
  kind: GuestReservationKind,
  catalogId: string,
  subjectId: string
): void {
  forgottenInThisSession.delete(`${kind}:${catalogId}:${subjectId}`);
  try {
    localStorage.setItem(key(kind, catalogId), subjectId);
  } catch {
    // The current success view still works if browser storage is unavailable.
  }
}

export function rememberedGuestReservation(
  kind: GuestReservationKind,
  catalogId: string
): string | null {
  try {
    return localStorage.getItem(key(kind, catalogId));
  } catch {
    return null;
  }
}

export function forgetGuestReservation(
  kind: GuestReservationKind,
  catalogId: string,
  subjectId?: string
): void {
  try {
    const savedSubjectId = localStorage.getItem(key(kind, catalogId));
    if (subjectId || savedSubjectId) {
      forgottenInThisSession.add(`${kind}:${catalogId}:${subjectId ?? savedSubjectId}`);
    }
    if (!subjectId || savedSubjectId === subjectId) {
      localStorage.removeItem(key(kind, catalogId));
    }
  } catch {
    // Browser storage may be unavailable.
  }
}

/** Suppress a stale in-memory guest projection until the next page load. */
export function wasGuestReservationForgotten(
  kind: GuestReservationKind,
  catalogId: string,
  subjectId: string
): boolean {
  return forgottenInThisSession.has(`${kind}:${catalogId}:${subjectId}`);
}

/** A saved pointer cannot be used again when its subject or credential is gone. */
export function isUnusableGuestReservationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message, name } = error as { code?: string; message?: string; name?: string };
  return (
    name === 'ZodError' ||
    code === 'functions/not-found' ||
    code === 'functions/permission-denied' ||
    code === 'functions/unauthenticated' ||
    code === 'functions/invalid-argument' ||
    message === 'missing' ||
    message === 'expired' ||
    message === 'malformed' ||
    message === 'Guest booking read model was not found.' ||
    message === 'Guest course enrollment read model was not found.'
  );
}
