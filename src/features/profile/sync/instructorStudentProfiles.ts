import type { InstructorLessonBookingItem } from '../../booking-collaboration/bookingCollaborationContracts';

const NON_PROFILE_USER_ID_PREFIXES = ['guest_', 'system_block_'] as const;

/** Returns profile IDs that an instructor needs to enrich their currently loaded bookings. */
export function getInstructorStudentProfileIds(
  bookings: readonly InstructorLessonBookingItem[]
): string[] {
  return [
    ...new Set(
      bookings
        .flatMap((booking) => booking.participants)
        .map((participant) => participant.selfAccountId)
        .filter(
          (userId): userId is string =>
            Boolean(userId) &&
            !NON_PROFILE_USER_ID_PREFIXES.some((prefix) => userId!.startsWith(prefix))
        )
    ),
  ];
}

/** Firestore permits at most 30 values in an `in` query. */
export function chunkFirestoreInValues<T>(values: T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += 30) {
    chunks.push(values.slice(index, index + 30));
  }
  return chunks;
}
