import {
  BookingChangeRequestSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  readAggregateRevision,
  type BookingChangeRequest,
} from '@ski-academy/shared-domain';

export const BOOKING_CHANGE_REQUEST_PLANNING_ESTIMATES = {
  requestBytes: 768,
} as const;

export function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function bookingChangeRequestPath(
  requestId: BookingChangeRequest['requestId']
): string {
  return toTransactionPath(canonicalPaths.bookingChangeRequest(requestId));
}

export function parseBookingChangeRequest(
  data: Record<string, unknown> | undefined
): BookingChangeRequest | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = BookingChangeRequestSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function readChangeRequestRevision(
  data: Record<string, unknown> | undefined
): number | undefined {
  return readAggregateRevision(data);
}

export function toFirestoreWritePayload(
  data: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
