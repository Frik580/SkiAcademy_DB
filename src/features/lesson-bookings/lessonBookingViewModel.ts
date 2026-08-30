import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import type { BookingStatus } from '@ski-academy/shared-domain';
import type { LessonBookingCabinetItem } from './lessonBookingContracts';
import { canonicalTimestampToLocalParts } from './mapCalendarInput';

function mapLifecycleStatus(status: LessonBookingReadModel['lifecycle']['status']): BookingStatus {
  if (status === 'no_show') return 'completed';
  return status;
}

export function mapLessonBookingReadModelToCabinetItem(
  readModel: LessonBookingReadModel
): LessonBookingCabinetItem {
  const { date, time } = canonicalTimestampToLocalParts(
    readModel.occurrence.startsAt.seconds,
    readModel.occurrence.startsAt.nanoseconds,
    readModel.occurrence.timeZone
  );
  const durationHours = readModel.occurrence.durationMinutes / 60;
  const paymentPresentation = readModel.paymentPresentation;
  const payment =
    paymentPresentation?.kind === 'visible'
      ? {
          kind: 'visible' as const,
          paymentStatus: paymentPresentation.paymentStatus,
          price: paymentPresentation.price,
        }
      : { kind: 'withheld' as const };
  const totalPrice =
    paymentPresentation?.kind === 'visible' ? paymentPresentation.price : undefined;

  return {
    id: readModel.bookingId,
    bookingId: readModel.bookingId,
    revision: readModel.revision,
    status: mapLifecycleStatus(readModel.lifecycle.status),
    date,
    time,
    durationHours,
    instructorId: readModel.instructor.instructorId,
    instructorName: readModel.instructor.displayName,
    instructorAvatar: readModel.instructor.avatarUrl ?? '',
    participantNames: readModel.participants.map((participant) => participant.displayName),
    partyKind: readModel.partyKind,
    payment,
    totalPrice,
    bookingOrigin: readModel.bookingOrigin,
    isLessonBooking: true,
    authorizedActions: readModel.authorizedActions,
    cancellationReason: readModel.lifecycle.reasonCode,
  };
}

export function mergeLessonBookingRecords(
  existing: ReadonlyMap<string, LessonBookingCabinetItem>,
  incoming: readonly LessonBookingReadModel[]
): Map<string, LessonBookingCabinetItem> {
  const merged = new Map(existing);
  for (const readModel of incoming) {
    const item = mapLessonBookingReadModelToCabinetItem(readModel);
    const cached = merged.get(item.bookingId);
    if (!cached || item.revision >= cached.revision) {
      merged.set(item.bookingId, item);
    }
  }
  return merged;
}
