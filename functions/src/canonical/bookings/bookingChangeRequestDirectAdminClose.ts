import {
  BookingChangeRequestSchema,
  nextAggregateRevision,
  timestampFromDate,
  type Booking,
  type BookingChangeRequest,
  type BookingChangeRequestResolution,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import {
  BOOKING_CHANGE_REQUEST_PLANNING_ESTIMATES,
  bookingChangeRequestPath,
  isOpenBookingChangeRequest,
  parseBookingChangeRequest,
  toFirestoreWritePayload as toChangeRequestWritePayload,
} from './bookingChangeRequestStore';

export interface PlannedDirectAdminChangeRequestClose {
  readonly changeRequest: BookingChangeRequest;
  readonly plannedRevision: number;
  readonly documentPath: string;
  readonly resolution: Extract<BookingChangeRequestResolution, 'rescheduled' | 'booking_cancelled'>;
}

interface CommandMetadata {
  readonly commandId: string;
  readonly correlationId: CommandEnvelope['context']['correlationId'];
}

export async function planCloseOpenBookingChangeRequestsForDirectAdminMutation(
  session: CanonicalAtomicTransactionSession,
  bookingId: Booking['bookingId'],
  resolution: PlannedDirectAdminChangeRequestClose['resolution']
): Promise<PlannedDirectAdminChangeRequestClose[]> {
  const documents = await session.tx.query({
    collection: 'booking_change_requests',
    where: { field: 'bookingId', op: '==', value: bookingId },
    limit: 10,
  });
  session.plan.planRead({
    path: `booking_change_requests/query:${bookingId}`,
    category: 'aggregate',
  });

  const planned: PlannedDirectAdminChangeRequestClose[] = [];
  for (const document of documents) {
    const changeRequest = parseBookingChangeRequest(document.data);
    if (!changeRequest || !isOpenBookingChangeRequest(changeRequest)) {
      continue;
    }
    const documentPath = bookingChangeRequestPath(changeRequest.requestId);
    session.plan.planMutation({
      path: documentPath,
      kind: 'update',
      category: 'aggregate',
      estimatedPayloadBytes: BOOKING_CHANGE_REQUEST_PLANNING_ESTIMATES.requestBytes,
    });
    planned.push({
      changeRequest,
      plannedRevision: nextAggregateRevision(changeRequest.revision),
      documentPath,
      resolution,
    });
  }
  return planned;
}

export function commitClosedBookingChangeRequestsForDirectAdminMutation(
  session: CanonicalAtomicTransactionSession,
  planned: readonly PlannedDirectAdminChangeRequestClose[],
  metadata: CommandMetadata,
  decidedAt: Date
): void {
  const resolvedAt = timestampFromDate(decidedAt);
  for (const item of planned) {
    const updated = BookingChangeRequestSchema.parse({
      ...item.changeRequest,
      lifecycle: {
        status: 'resolved',
        resolvedAt,
        resolution: item.resolution,
      },
      revision: item.plannedRevision,
      updatedAt: resolvedAt,
      audit: {
        ...item.changeRequest.audit,
        lastChangedByCommandId: metadata.commandId,
        correlationId: metadata.correlationId,
      },
    });
    session.tx.update({ path: item.documentPath }, toChangeRequestWritePayload(updated as Record<string, unknown>));
  }
}
