import type { Firestore } from 'firebase-admin/firestore';
import {
  BOOKING_INSTRUCTOR_CATALOGUE_READ_LIMIT,
  BookingInstructorCatalogueItemSchema,
  InstructorIdSchema,
  LIVE_CANONICAL_READ_SCOPE,
  identityDocumentMatchesReadScope,
  type BookingInstructorCatalogueItem,
  type CanonicalReadScope,
  type QueryBookingInstructorCatalogueReadModelsResult,
} from '@ski-academy/shared-domain';

const SPECIALTIES = new Set(['ski', 'snowboard', 'both']);

/**
 * Lesson-booking catalogue visibility.
 *
 * LIVE uses the identity compatibility rule: explicit LIVE and legacy
 * missing-scope instructors stay visible, explicit TEST stays hidden.
 * TEST is stricter than identityDocumentMatchesReadScope. Unstamped LIVE
 * identities are visible to other TEST product reads, but a booking picker
 * may offer only instructors stamped to the resolved TestSession.
 */
export function bookingInstructorMatchesCatalogueScope(
  readScope: CanonicalReadScope,
  persisted: unknown
): boolean {
  if (readScope.dataScope === 'live') {
    return identityDocumentMatchesReadScope(readScope, persisted);
  }
  if (!persisted || typeof persisted !== 'object') return false;
  const record = persisted as Record<string, unknown>;
  return record.dataScope === 'test' && record.testSessionId === readScope.testSessionId;
}

function optionalString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return undefined;
  return trimmed;
}

function toCatalogueItem(
  instructorId: string,
  data: Record<string, unknown>
): BookingInstructorCatalogueItem | undefined {
  const parsedId = InstructorIdSchema.safeParse(instructorId);
  const name = optionalString(data.name, 200);
  if (!parsedId.success || !name) return undefined;

  const pricePerHour =
    typeof data.pricePerHour === 'number' && Number.isFinite(data.pricePerHour)
      ? data.pricePerHour
      : undefined;
  const pricePerHourKZT =
    typeof data.pricePerHourKZT === 'number' &&
    Number.isFinite(data.pricePerHourKZT) &&
    Number.isInteger(data.pricePerHourKZT) &&
    data.pricePerHourKZT >= 0
      ? data.pricePerHourKZT
      : undefined;
  if (pricePerHour === undefined && pricePerHourKZT === undefined) return undefined;

  const languages = Array.isArray(data.languages)
    ? data.languages
        .map((language) => optionalString(language, 40))
        .filter((language): language is string => language !== undefined)
        .slice(0, 12)
    : undefined;
  const specialty =
    typeof data.specialty === 'string' && SPECIALTIES.has(data.specialty)
      ? (data.specialty as 'ski' | 'snowboard' | 'both')
      : undefined;
  const experienceYears =
    typeof data.experienceYears === 'number' &&
    Number.isInteger(data.experienceYears) &&
    data.experienceYears >= 0 &&
    data.experienceYears <= 80
      ? data.experienceYears
      : undefined;
  const bio = optionalString(data.bio, 4000);
  const avatarUrl = optionalString(data.avatarUrl, 2000);
  const phoneNumber = optionalString(data.phoneNumber, 40);

  const parsed = BookingInstructorCatalogueItemSchema.safeParse({
    instructorId: parsedId.data,
    name,
    isAvailable: data.isAvailable === true,
    ...(specialty ? { specialty } : {}),
    ...(languages && languages.length > 0 ? { languages } : {}),
    ...(experienceYears !== undefined ? { experienceYears } : {}),
    ...(bio ? { bio } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(pricePerHour !== undefined ? { pricePerHour } : {}),
    ...(pricePerHourKZT !== undefined ? { pricePerHourKZT } : {}),
    ...(phoneNumber ? { phoneNumber } : {}),
  });
  return parsed.success ? parsed.data : undefined;
}

export async function queryBookingInstructorCatalogueReadModels(
  firestore: Firestore,
  options: { readonly readScope?: CanonicalReadScope } = {}
): Promise<QueryBookingInstructorCatalogueReadModelsResult> {
  const readScope = options.readScope ?? LIVE_CANONICAL_READ_SCOPE;
  const snapshot = await firestore
    .collection('instructors')
    .limit(BOOKING_INSTRUCTOR_CATALOGUE_READ_LIMIT)
    .get();

  const items: BookingInstructorCatalogueItem[] = [];
  for (const document of snapshot.docs) {
    const data = document.data() as Record<string, unknown>;
    if (!bookingInstructorMatchesCatalogueScope(readScope, data)) continue;
    const item = toCatalogueItem(document.id, data);
    if (item) items.push(item);
  }
  items.sort(
    (left, right) =>
      left.name.localeCompare(right.name) || left.instructorId.localeCompare(right.instructorId)
  );
  return { scope: 'booking_catalogue', items };
}
