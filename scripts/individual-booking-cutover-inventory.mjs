#!/usr/bin/env node
/* global URL, console, process */
/**
 * Read-only production inventory for T32.9A.9A/T32.9D.
 *
 * Reads every /bookings document and classifies it with the authoritative
 * canonical and legacy schemas. It performs no writes.
 *
 * Usage:
 *   node scripts/individual-booking-cutover-inventory.mjs \
 *     --project <project-id> [--legacy-time-zone Asia/Almaty] [--now <ISO instant>]
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const rootRequire = createRequire(new URL('../package.json', import.meta.url));
const functionsRequire = createRequire(new URL('../functions/package.json', import.meta.url));
const {
  BookingSchema,
  IanaTimeZoneSchema,
  localCalendarInputToUtcDate,
  normalizeFirestoreDocument,
} = rootRequire('@ski-academy/shared-domain');
const { BookingDocumentSchema } = rootRequire('@ski-academy/shared-domain/entities');

const ACTIVE_STATUSES = new Set(['pending', 'confirmed', 'pending_cancellation']);
const CANONICAL_SIGNAL_FIELDS = [
  'bookingId',
  'attribution',
  'party',
  'occurrence',
  'lifecycle',
  'revision',
  'audit',
];

export function classifyBookingDocument({ documentId, data, now, legacyTimeZone }) {
  const normalized = normalizeFirestoreDocument(data) ?? data;
  const canonical = BookingSchema.safeParse(normalized);

  if (canonical.success) {
    if (canonical.data.bookingId !== documentId) {
      return ambiguous(documentId, normalized, 'canonical bookingId does not match document ID');
    }
    const status = canonical.data.lifecycle.status;
    const endsAtMs = timestampMilliseconds(canonical.data.occurrence.interval.endsAt);
    const currentFuture = ACTIVE_STATUSES.has(status) || endsAtMs >= now.getTime();
    return {
      classification: currentFuture ? 'CANONICAL_CURRENT_FUTURE' : 'CANONICAL_PAST',
      documentId,
      scheduledAt: canonicalInstant(canonical.data.occurrence.interval.startsAt),
      endsAt: canonicalInstant(canonical.data.occurrence.interval.endsAt),
      lifecycle: status,
      actorMarker: canonical.data.attribution.bookingOrigin,
      reason: currentFuture
        ? ACTIVE_STATUSES.has(status)
          ? 'canonical schema; lifecycle remains active'
          : 'canonical schema; occurrence has not ended'
        : 'canonical schema; terminal lifecycle and occurrence ended',
    };
  }

  if (CANONICAL_SIGNAL_FIELDS.some((field) => normalized?.[field] !== undefined)) {
    return ambiguous(
      documentId,
      normalized,
      `canonical-shaped document failed BookingSchema: ${formatSchemaIssues(canonical.error)}`
    );
  }

  const legacy = BookingDocumentSchema.safeParse(normalized);
  if (!legacy.success) {
    return ambiguous(
      documentId,
      normalized,
      `document matches neither BookingSchema nor BookingDocumentSchema: ${formatSchemaIssues(legacy.error)}`
    );
  }

  const schedule = legacySchedule(legacy.data, legacyTimeZone);
  if (!schedule) {
    return ambiguous(documentId, normalized, 'legacy date/time/duration cannot be resolved');
  }
  const status = legacy.data.status;
  const currentFuture = ACTIVE_STATUSES.has(status) || schedule.endsAt.getTime() >= now.getTime();
  return {
    classification: currentFuture ? 'LEGACY_ONLY_CURRENT_FUTURE' : 'LEGACY_PAST_DISPOSABLE',
    documentId,
    scheduledAt: schedule.startsAt.toISOString(),
    endsAt: schedule.endsAt.toISOString(),
    lifecycle: status,
    actorMarker:
      legacy.data.isGuest === true ? 'guest' : legacy.data.userId ? 'account' : 'unknown',
    reason: currentFuture
      ? ACTIVE_STATUSES.has(status)
        ? 'legacy schema; lifecycle remains active'
        : 'legacy schema; lesson has not ended'
      : 'legacy schema; terminal lifecycle and lesson ended',
  };
}

export function summarizeInventory(rows, metadata) {
  const classifications = {
    CANONICAL_CURRENT_FUTURE: [],
    LEGACY_ONLY_CURRENT_FUTURE: [],
    CANONICAL_PAST: [],
    LEGACY_PAST_DISPOSABLE: [],
    AMBIGUOUS: [],
  };
  for (const row of rows) classifications[row.classification].push(row);

  return {
    ...metadata,
    counts: Object.fromEntries(
      Object.entries(classifications).map(([name, items]) => [name, items.length])
    ),
    blockers: {
      legacyOnlyCurrentFuture: classifications.LEGACY_ONLY_CURRENT_FUTURE,
      ambiguous: classifications.AMBIGUOUS,
    },
    destructiveResetCandidates: classifications.LEGACY_PAST_DISPOSABLE.map((row) => ({
      documentId: row.documentId,
      scheduledAt: row.scheduledAt,
      endsAt: row.endsAt,
      lifecycle: row.lifecycle,
      reason: row.reason,
    })),
    status:
      classifications.LEGACY_ONLY_CURRENT_FUTURE.length > 0 || classifications.AMBIGUOUS.length > 0
        ? 'BLOCKED'
        : 'PASS',
  };
}

async function main() {
  const projectId = readArg('--project');
  if (!projectId) throw new Error('Missing required --project <firebase-project-id>');

  const legacyTimeZone = IanaTimeZoneSchema.parse(readArg('--legacy-time-zone') ?? 'Asia/Almaty');
  const now = parseNow(readArg('--now'));
  const { getApps, initializeApp } = functionsRequire('firebase-admin/app');
  const { getFirestore } = functionsRequire('firebase-admin/firestore');

  if (getApps().length === 0) initializeApp({ projectId });
  const snapshot = await getFirestore().collection('bookings').get();
  const rows = snapshot.docs.map((document) =>
    classifyBookingDocument({
      documentId: document.id,
      data: document.data(),
      now,
      legacyTimeZone,
    })
  );

  console.log(
    JSON.stringify(
      summarizeInventory(rows, {
        projectId,
        generatedAt: new Date().toISOString(),
        cutoffInstant: now.toISOString(),
        legacyTimeZone,
        totalBookingDocuments: snapshot.size,
        discriminator:
          'CANONICAL only when normalized data passes strict BookingSchema and bookingId equals document ID; LEGACY only when it passes BookingDocumentSchema and has no canonical signal fields; otherwise AMBIGUOUS.',
      }),
      null,
      2
    )
  );
}

function legacySchedule(booking, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.date) || !/^\d{2}:\d{2}$/.test(booking.time)) {
    return undefined;
  }
  try {
    const startsAt = localCalendarInputToUtcDate(
      { localDate: booking.date, localTime: booking.time, durationMinutes: 1 },
      timeZone
    );
    const storedEnd = typeof booking.endsAt === 'string' ? new Date(booking.endsAt) : undefined;
    const endsAt =
      storedEnd && Number.isFinite(storedEnd.getTime())
        ? storedEnd
        : new Date(startsAt.getTime() + booking.durationHours * 60 * 60 * 1_000);
    return Number.isFinite(startsAt.getTime()) && Number.isFinite(endsAt.getTime())
      ? { startsAt, endsAt }
      : undefined;
  } catch {
    return undefined;
  }
}

function timestampMilliseconds(timestamp) {
  return timestamp.seconds * 1_000 + Math.floor(timestamp.nanoseconds / 1_000_000);
}

function canonicalInstant(timestamp) {
  return new Date(timestampMilliseconds(timestamp)).toISOString();
}

function ambiguous(documentId, data, reason) {
  return {
    classification: 'AMBIGUOUS',
    documentId,
    scheduledAt: safeScheduleMarker(data),
    lifecycle: safeLifecycleMarker(data),
    actorMarker: safeActorMarker(data),
    reason,
  };
}

function safeScheduleMarker(data) {
  if (typeof data?.date === 'string') {
    return `${data.date}${typeof data.time === 'string' ? ` ${data.time}` : ''}`;
  }
  const startsAt = data?.occurrence?.interval?.startsAt;
  return startsAt && Number.isInteger(startsAt.seconds) ? canonicalInstant(startsAt) : 'unknown';
}

function safeLifecycleMarker(data) {
  return typeof data?.lifecycle?.status === 'string'
    ? data.lifecycle.status
    : typeof data?.status === 'string'
      ? data.status
      : 'unknown';
}

function safeActorMarker(data) {
  if (typeof data?.attribution?.bookingOrigin === 'string') return data.attribution.bookingOrigin;
  if (data?.isGuest === true) return 'guest';
  if (typeof data?.userId === 'string' && data.userId.length > 0) return 'account';
  return 'unknown';
}

function formatSchemaIssues(error) {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
}

function parseNow(value) {
  const now = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(now.getTime())) throw new Error('--now must be a valid ISO instant');
  return now;
}

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
