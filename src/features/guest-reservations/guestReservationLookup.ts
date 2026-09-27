type GuestReservationKind = 'lesson' | 'course';

function key(kind: GuestReservationKind, catalogId: string): string {
  return `ski_academy_guest_reservation:${kind}:${catalogId}`;
}

/** Browser convenience only; the subject-scoped credential remains read authority. */
export function rememberGuestReservation(
  kind: GuestReservationKind,
  catalogId: string,
  subjectId: string
): void {
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
