import type { BookingChangeRequestReadModel } from '@ski-academy/shared-domain';
import type { BookingChangeRequestCabinetItem } from './bookingCollaborationContracts';

export function mapChangeRequestLifecycleLabel(status: string): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'resolved':
      return 'Resolved';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

export function mapBookingChangeRequestReadModelToCabinetItem(
  readModel: BookingChangeRequestReadModel
): BookingChangeRequestCabinetItem {
  return {
    requestId: readModel.requestId,
    revision: readModel.revision,
    bookingId: readModel.bookingId,
    requestType: readModel.requestType,
    reason: readModel.reason,
    lifecycleStatus: readModel.lifecycle.status,
    lifecycleLabel: mapChangeRequestLifecycleLabel(readModel.lifecycle.status),
    authorizedActions: readModel.authorizedActions,
  };
}

export function mergeChangeRequestRecords(
  existing: ReadonlyMap<string, BookingChangeRequestCabinetItem>,
  incoming: readonly BookingChangeRequestReadModel[]
): Map<string, BookingChangeRequestCabinetItem> {
  const merged = new Map(existing);
  for (const readModel of incoming) {
    const item = mapBookingChangeRequestReadModelToCabinetItem(readModel);
    const cached = merged.get(item.requestId);
    if (!cached || item.revision >= cached.revision) {
      merged.set(item.requestId, item);
    }
  }
  return merged;
}

export function selectOpenChangeRequestForBooking(
  items: readonly BookingChangeRequestCabinetItem[],
  bookingId: string
): BookingChangeRequestCabinetItem | undefined {
  return items.find((item) => item.bookingId === bookingId && item.lifecycleStatus === 'open');
}
