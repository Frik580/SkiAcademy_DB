import type {
  InstructorLessonBookingItem,
  ParticipantAccessCabinetItem,
} from '../booking-collaboration/bookingCollaborationContracts';
import { canonicalTimestampToEpochMs } from '@ski-academy/shared-domain';

export function instructorProgressParticipantIds(
  bookings: readonly InstructorLessonBookingItem[],
  access: ReadonlyMap<string, ParticipantAccessCabinetItem>,
  instructorId: string,
  nowEpochMs: number
): string[] {
  const ids = new Set<string>();

  for (const booking of bookings) {
    if (
      (booking.status !== 'confirmed' && booking.status !== 'completed') ||
      booking.instructorId !== instructorId ||
      (booking.status === 'confirmed' && booking.startsAtEpochMs > nowEpochMs)
    ) {
      continue;
    }
    const bookingParticipantIds = new Set(booking.participants.map((item) => item.participantId));
    for (const row of booking.attendance) {
      if (row.attendanceStatus === 'present' && bookingParticipantIds.has(row.participantId)) {
        ids.add(row.participantId);
      }
    }
  }

  for (const item of access.values()) {
    if (
      item.instructorId === instructorId &&
      item.relationshipStatus === 'active' &&
      item.relationshipValidFrom !== undefined &&
      canonicalTimestampToEpochMs(item.relationshipValidFrom) <= nowEpochMs &&
      item.relationshipExpiresAt !== undefined &&
      nowEpochMs < canonicalTimestampToEpochMs(item.relationshipExpiresAt) &&
      item.managerBlockStatus !== 'active' &&
      item.instructorBlockStatus !== 'active'
    ) {
      ids.add(item.participantId);
    }
  }

  return [...ids];
}
