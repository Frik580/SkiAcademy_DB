import type { Booking } from '../../../types';

const NON_PROFILE_USER_ID_PREFIXES = ['guest_', 'system_block_'] as const;

/** Returns profile IDs that an instructor needs to enrich their currently loaded bookings. */
export function getInstructorStudentProfileIds(
  bookings: Booking[],
  instructorId: string
): string[] {
  return [
    ...new Set(
      bookings
        .filter((booking) => booking.instructorId === instructorId)
        .map((booking) => booking.userId)
        .filter(
          (userId) =>
            Boolean(userId) &&
            !NON_PROFILE_USER_ID_PREFIXES.some((prefix) => userId.startsWith(prefix))
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
