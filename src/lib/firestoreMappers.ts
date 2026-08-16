import type { ActivityLog, Booking, Course, Instructor, Review, UserProfile } from '../types';
import type { DbNotification } from './notificationText';
import type { WalletLedgerEntry } from '../features/wallet/types';

/** Raw Firestore shape: document fields without the Firestore document id. */
export type FirestoreModel<T extends { id: string }> = Omit<T, 'id'>;

/** Application-facing entity with its Firestore document id attached. */
export type DomainModel<T> = T;

/** Presentation-specific shape; kept distinct from persistence and domain types. */
export type UIModel<T> = T;

function toDocumentModel<T extends { id: string }>(id: string, fields: unknown): T {
  return { id, ...(fields as object) } as T;
}

export const toBooking = (id: string, fields: unknown): Booking =>
  toDocumentModel<Booking>(id, fields);
export const toInstructor = (id: string, fields: unknown): Instructor =>
  toDocumentModel<Instructor>(id, fields);
export const toReview = (id: string, fields: unknown): Review =>
  toDocumentModel<Review>(id, fields);
export const toCourse = (id: string, fields: unknown): Course =>
  toDocumentModel<Course>(id, fields);
export const toNotification = (id: string, fields: unknown): DbNotification =>
  toDocumentModel<DbNotification>(id, fields);
export const toWalletLedgerEntry = (id: string, fields: unknown): WalletLedgerEntry =>
  toDocumentModel<WalletLedgerEntry>(id, fields);
export const toActivityLog = (id: string, fields: unknown): ActivityLog =>
  toDocumentModel<ActivityLog>(id, fields);

/** User documents already persist uid as a field, unlike collection models. */
export const toUserProfile = (fields: unknown): UserProfile => fields as UserProfile;
