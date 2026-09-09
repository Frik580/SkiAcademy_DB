import type { BookingChangeRequestReadModel } from '@ski-academy/shared-domain';
import type {
  BookingChangeRequestCabinetItem,
  BookingChangeRequestCabinetSourceScope,
} from './bookingCollaborationContracts';

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
  readModel: BookingChangeRequestReadModel,
  sourceScope: BookingChangeRequestCabinetSourceScope = 'account_open'
): BookingChangeRequestCabinetItem {
  return {
    requestId: readModel.requestId,
    revision: readModel.revision,
    bookingId: readModel.bookingId,
    requestType: readModel.requestType,
    reason: readModel.reason,
    lifecycleStatus: readModel.lifecycle.status,
    lifecycleLabel: mapChangeRequestLifecycleLabel(readModel.lifecycle.status),
    sourceScope,
    authorizedActions: readModel.authorizedActions,
  };
}

export function mergeChangeRequestRecords(
  existing: ReadonlyMap<string, BookingChangeRequestCabinetItem>,
  incoming: readonly BookingChangeRequestReadModel[],
  sourceScope: BookingChangeRequestCabinetSourceScope
): Map<string, BookingChangeRequestCabinetItem> {
  const merged = new Map(existing);
  const incomingIds = new Set<string>(incoming.map((readModel) => readModel.requestId));
  for (const [requestId, item] of merged) {
    if (
      item.sourceScope === sourceScope &&
      item.lifecycleStatus === 'open' &&
      !incomingIds.has(requestId)
    ) {
      merged.delete(requestId);
    }
  }
  for (const readModel of incoming) {
    const item = mapBookingChangeRequestReadModelToCabinetItem(readModel, sourceScope);
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
