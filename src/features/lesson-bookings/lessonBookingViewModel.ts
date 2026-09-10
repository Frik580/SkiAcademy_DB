import type { LessonBookingReadModel } from '@ski-academy/shared-domain';
import type { LessonBookingCabinetItem } from './lessonBookingContracts';
import { canonicalTimestampToLocalParts } from './mapCalendarInput';
import { useLessonBookingStore } from './lessonBookingStore';

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
    status: readModel.lifecycle.status,
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
    ...(readModel.clientExercisedCapability
      ? { clientExercisedCapability: readModel.clientExercisedCapability }
      : {}),
    cancellationReason: readModel.lifecycle.reasonCode,
    ...(readModel.difficulty ? { difficulty: readModel.difficulty } : {}),
    ...(readModel.notes ? { notes: readModel.notes } : {}),
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

export function patchLessonBookingCancellationInStore(input: {
  readonly bookingId: string;
  readonly lifecycleStatus: 'cancelled' | 'pending_cancellation';
  readonly nextRevision: number;
}): void {
  const existing = useLessonBookingStore.getState().items.get(input.bookingId);
  if (!existing || input.nextRevision < existing.revision) {
    return;
  }

  const updated: LessonBookingCabinetItem = {
    ...existing,
    status: input.lifecycleStatus,
    revision: input.nextRevision,
    authorizedActions: {
      canRequestCancellation: false,
      canWithdrawCancellation: input.lifecycleStatus === 'pending_cancellation',
      canReschedule: false,
      canCreateChangeRequest: false,
    },
  };
  useLessonBookingStore.getState().mergeItems(new Map([[input.bookingId, updated]]));
}
