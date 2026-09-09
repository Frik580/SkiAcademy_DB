import type { BookingProposalReadModel } from '@ski-academy/shared-domain';
import { canonicalTimestampToLocalParts } from '../lesson-bookings/mapCalendarInput';
import type {
  BookingProposalCabinetItem,
  BookingProposalCabinetSourceScope,
} from './bookingCollaborationContracts';

export function mapProposalLifecycleLabel(status: string): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'expired':
      return 'Expired';
    case 'unavailable':
      return 'Unavailable';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export function mapBookingProposalReadModelToCabinetItem(
  readModel: BookingProposalReadModel,
  sourceScope: BookingProposalCabinetSourceScope = 'account_open'
): BookingProposalCabinetItem {
  const { date, time } = canonicalTimestampToLocalParts(
    readModel.proposedService.startsAt.seconds,
    readModel.proposedService.startsAt.nanoseconds,
    readModel.proposedService.timeZone
  );

  return {
    proposalId: readModel.proposalId,
    revision: readModel.revision,
    participantIds: readModel.participantIds,
    instructorId: readModel.instructorId,
    participantDisplayName: readModel.participantDisplayNames.join(' · '),
    instructorDisplayName: readModel.instructorDisplayName,
    date,
    time,
    durationHours: readModel.proposedService.durationMinutes / 60,
    lifecycleStatus: readModel.lifecycle.status,
    lifecycleLabel: mapProposalLifecycleLabel(readModel.lifecycle.status),
    authorizedActions: readModel.authorizedActions,
    ...(readModel.clientExercisedCapability
      ? { clientExercisedCapability: readModel.clientExercisedCapability }
      : {}),
    sourceScope,
  };
}

export function mergeProposalRecords(
  existing: ReadonlyMap<string, BookingProposalCabinetItem>,
  incoming: readonly BookingProposalReadModel[],
  sourceScope: BookingProposalCabinetSourceScope
): Map<string, BookingProposalCabinetItem> {
  const merged = new Map(existing);
  const incomingIds = new Set<string>(incoming.map((readModel) => readModel.proposalId));
  for (const [proposalId, item] of merged) {
    if (
      item.sourceScope === sourceScope &&
      item.lifecycleStatus === 'open' &&
      !incomingIds.has(proposalId)
    ) {
      merged.delete(proposalId);
    }
  }
  for (const readModel of incoming) {
    const item = mapBookingProposalReadModelToCabinetItem(readModel, sourceScope);
    const cached = merged.get(item.proposalId);
    if (!cached || item.revision >= cached.revision) {
      merged.set(item.proposalId, item);
    }
  }
  return merged;
}
