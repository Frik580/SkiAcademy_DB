import type { ActivityLog, Booking, Course, Instructor, Review, UserProfile } from '../../types';
import type { DbNotification } from '../../domain/notifications';
import type { WalletLedgerEntry } from '../../features/wallet/types';
import { logErrorToFirestore } from './firebase';
import { parseBooking, parseCourse, parseUserProfile } from './firestoreSchemas';

/** Raw Firestore shape: document fields without the Firestore document id. */
export type FirestoreModel<T extends { id: string }> = Omit<T, 'id'>;

/** Application-facing entity with its Firestore document id attached. */
export type DomainModel<T> = T;

/** Presentation-specific shape; kept distinct from persistence and domain types. */
export type UIModel<T> = T;

const loggedInvalidDocumentPaths = new Set<string>();

function logInvalidDocument(collection: string, id: string, reason: string): void {
  const path = `${collection}/${id}`;
  if (loggedInvalidDocumentPaths.has(path)) return;
  loggedInvalidDocumentPaths.add(path);
  void logErrorToFirestore(
    `Invalid Firestore document skipped: ${reason}`,
    undefined,
    'firestore_validation',
    'READ',
    path
  );
}

function toDocumentModel<T extends { id: string }>(id: string, fields: unknown): T {
  return { ...(fields as object), id } as T;
}

export const toBooking = (id: string, fields: unknown): Booking | null => {
  const result = parseBooking(fields, id);
  if (result.success) return result.data;
  logInvalidDocument('bookings', id, result.reason);
  return null;
};
export const toInstructor = (id: string, fields: unknown): Instructor =>
  toDocumentModel<Instructor>(id, fields);
export const toReview = (id: string, fields: unknown): Review =>
  toDocumentModel<Review>(id, fields);
export const toCourse = (id: string, fields: unknown): Course | null => {
  const result = parseCourse(fields, id);
  if (result.success) return result.data;
  logInvalidDocument('courses', id, result.reason);
  return null;
};
export const toNotification = (id: string, fields: unknown): DbNotification =>
  toDocumentModel<DbNotification>(id, fields);
export const toWalletLedgerEntry = (id: string, fields: unknown): WalletLedgerEntry =>
  toDocumentModel<WalletLedgerEntry>(id, fields);
export const toActivityLog = (id: string, fields: unknown): ActivityLog =>
  toDocumentModel<ActivityLog>(id, fields);

/** User documents already persist uid as a field, unlike collection models. */
export const toUserProfile = (fields: unknown, id = 'unknown'): UserProfile | null => {
  const result = parseUserProfile(fields);
  if (result.success) return result.data;
  logInvalidDocument('users', id, result.reason);
  return null;
};
