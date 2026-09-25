import { normalizeInstructorSpokenLanguages } from '@ski-academy/shared-domain';
import type { ActivityLog, Booking, Course, Instructor, UserProfile } from '../../types';
import type { DbNotification } from '../../domain/notifications';
import type { WalletLedgerEntry } from '../../features/wallet/types';
import { parseBooking, parseCourse, readUserProfile } from './firestoreSchemas';
import { logErrorToFirestore } from './firebase';

export { readUserProfile };

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
function optionalInstructorBio(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 4_000 ? trimmed : undefined;
}

export const toInstructor = (id: string, fields: unknown): Instructor => {
  const record =
    fields && typeof fields === 'object' ? (fields as Record<string, unknown>) : undefined;
  const languages = Array.isArray(record?.languages)
    ? normalizeInstructorSpokenLanguages(
        record.languages.filter((item): item is string => typeof item === 'string')
      )
    : [];
  const bioRu = optionalInstructorBio(record?.bioRu);
  const bioEn = optionalInstructorBio(record?.bioEn);
  const model = toDocumentModel<Instructor>(id, fields);
  delete model.bioRu;
  delete model.bioEn;
  return {
    ...model,
    bio: typeof model.bio === 'string' ? model.bio : '',
    languages,
    ...(bioRu ? { bioRu } : {}),
    ...(bioEn ? { bioEn } : {}),
    // Legacy catalog aggregates are untrusted after the canonical review cutover.
    rating: null,
    reviewsCount: 0,
  };
};
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

export const toUserProfile = (fields: unknown, id = 'unknown'): UserProfile | null => {
  const result = readUserProfile(fields, id);
  if (result.success) return result.data;
  logInvalidDocument('users', id, result.reason);
  return null;
};
