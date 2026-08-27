import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import type { BookingStatus } from '@ski-academy/shared-domain';
import { canonicalTimestampToLocalParts } from '../lesson-bookings/mapCalendarInput';
import type { InstructorLessonBookingItem } from './bookingCollaborationContracts';

function mapLifecycleStatus(status: LessonBookingReadModel['lifecycle']['status']): BookingStatus {
  if (status === 'no_show') return 'completed';
  return status;
}

export function mapInstructorLessonBookingReadModel(
  readModel: LessonBookingReadModel
): InstructorLessonBookingItem {
  const { date, time } = canonicalTimestampToLocalParts(
    readModel.occurrence.startsAt.seconds,
    readModel.occurrence.startsAt.nanoseconds,
    readModel.occurrence.timeZone
  );

  return {
    bookingId: readModel.bookingId,
    revision: readModel.revision,
    status: mapLifecycleStatus(readModel.lifecycle.status),
    date,
    time,
    durationHours: readModel.occurrence.durationMinutes / 60,
    instructorId: readModel.instructor.instructorId,
    instructorName: readModel.instructor.displayName,
    participantIds: readModel.participantIds,
    participantNames: readModel.participants.map((participant) => participant.displayName),
    partyKind: readModel.partyKind,
    authorizedActions: readModel.authorizedActions,
  };
}

export function mergeInstructorLessonBookingRecords(
  existing: ReadonlyMap<string, InstructorLessonBookingItem>,
  incoming: readonly LessonBookingReadModel[]
): Map<string, InstructorLessonBookingItem> {
  const merged = new Map(existing);
  for (const readModel of incoming) {
    const item = mapInstructorLessonBookingReadModel(readModel);
    const cached = merged.get(item.bookingId);
    if (!cached || item.revision >= cached.revision) {
      merged.set(item.bookingId, item);
    }
  }
  return merged;
}

export function buildInstructorLessonBookingsList(
  items: ReadonlyMap<string, InstructorLessonBookingItem>
): InstructorLessonBookingItem[] {
  return [...items.values()].sort((left, right) => right.date.localeCompare(left.date));
}
