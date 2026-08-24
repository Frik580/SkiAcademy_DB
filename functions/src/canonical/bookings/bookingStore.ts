import {
  BookingSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  readAggregateRevision,
  type Booking,
  type InstructorId,
} from '@ski-academy/shared-domain';

export const BOOKING_PLANNING_ESTIMATES = {
  bookingBytes: 1_536,
  instructorBytes: 512,
} as const;

export function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function bookingPath(bookingId: Booking['bookingId']): string {
  return toTransactionPath(canonicalPaths.booking(bookingId));
}

export function instructorCatalogPath(instructorId: InstructorId): string {
  return toTransactionPath(canonicalPaths.instructor(instructorId));
}

export function parseBooking(data: Record<string, unknown> | undefined): Booking | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = BookingSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export interface InstructorCatalogRecord {
  readonly instructorId: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly pricePerHour?: number;
  readonly pricePerHourKZT?: number;
  readonly isAvailable?: boolean;
}

export function parseInstructorCatalog(
  instructorId: string,
  data: Record<string, unknown> | undefined
): InstructorCatalogRecord | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const name = typeof normalized.name === 'string' ? normalized.name.trim() : '';
  if (!name) return undefined;
  if (typeof normalized.id === 'string' && normalized.id !== instructorId) {
    return undefined;
  }
  const pricePerHour =
    typeof normalized.pricePerHour === 'number' && Number.isFinite(normalized.pricePerHour)
      ? normalized.pricePerHour
      : undefined;
  const pricePerHourKZT =
    typeof normalized.pricePerHourKZT === 'number' && Number.isFinite(normalized.pricePerHourKZT)
      ? normalized.pricePerHourKZT
      : undefined;
  if (pricePerHour === undefined && pricePerHourKZT === undefined) {
    return undefined;
  }
  return {
    instructorId,
    name,
    ...(typeof normalized.avatarUrl === 'string' && normalized.avatarUrl.trim().length > 0
      ? { avatarUrl: normalized.avatarUrl }
      : {}),
    ...(pricePerHour !== undefined ? { pricePerHour } : {}),
    ...(pricePerHourKZT !== undefined ? { pricePerHourKZT } : {}),
    ...(typeof normalized.isAvailable === 'boolean' ? { isAvailable: normalized.isAvailable } : {}),
  };
}

export function readRevision(data: Record<string, unknown> | undefined): number | undefined {
  return readAggregateRevision(data);
}

export function toFirestoreWritePayload(
  data: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}
