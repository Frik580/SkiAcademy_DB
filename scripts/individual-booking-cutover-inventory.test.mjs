/* global URL */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import {
  classifyBookingDocument,
  summarizeInventory,
} from './individual-booking-cutover-inventory.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const { canonicalBookingCollaborationFixtures } = require('@ski-academy/shared-domain/testing');
const now = new Date('2026-01-01T12:00:00.000Z');

test('uses the full canonical schema and document identity as discriminator', () => {
  const booking = canonicalBookingCollaborationFixtures.individualBooking;
  const row = classifyBookingDocument({
    documentId: booking.bookingId,
    data: booking,
    now,
    legacyTimeZone: 'Asia/Almaty',
  });
  assert.equal(row.classification, 'CANONICAL_CURRENT_FUTURE');

  const mismatch = classifyBookingDocument({
    documentId: 'different_document_id',
    data: booking,
    now,
    legacyTimeZone: 'Asia/Almaty',
  });
  assert.equal(mismatch.classification, 'AMBIGUOUS');
});

test('classifies the deployed pre-hourly F3 pricing snapshot as canonical', () => {
  const booking = canonicalBookingCollaborationFixtures.individualBooking;
  const participantIds = [
    booking.party.participantIds[0],
    'participant_inventory_pre_hourly_02',
    'participant_inventory_pre_hourly_03',
  ];
  const startsAt = booking.occurrence.interval.startsAt;
  const data = {
    ...booking,
    party: { kind: 'family_group', participantIds },
    occurrence: {
      ...booking.occurrence,
      interval: {
        startsAt,
        endsAt: { seconds: startsAt.seconds + 2 * 60 * 60, nanoseconds: startsAt.nanoseconds },
      },
      serviceParty: { ...booking.occurrence.serviceParty, participantIds },
    },
    pricingSnapshot: {
      strategyVersion: 'lesson_party:v1',
      baseLessonPriceKzt: 60_000,
      additionalParticipantSurchargeKzt: 10_000,
      settingsRevision: 1,
      participantCount: 3,
      totalPriceKzt: 80_000,
    },
  };

  const row = classifyBookingDocument({
    documentId: booking.bookingId,
    data,
    now,
    legacyTimeZone: 'Asia/Almaty',
  });
  assert.equal(row.classification, 'CANONICAL_CURRENT_FUTURE');
});

test('keeps active legacy rows current even when their scheduled time is past', () => {
  const row = classifyBookingDocument({
    documentId: 'legacy_active',
    data: legacyBooking({ date: '2025-01-01', status: 'confirmed' }),
    now,
    legacyTimeZone: 'Asia/Almaty',
  });
  assert.equal(row.classification, 'LEGACY_ONLY_CURRENT_FUTURE');
});

test('marks terminal legacy history disposable and malformed hybrids ambiguous', () => {
  const past = classifyBookingDocument({
    documentId: 'legacy_past',
    data: legacyBooking({ date: '2025-01-01', status: 'completed' }),
    now,
    legacyTimeZone: 'Asia/Almaty',
  });
  assert.equal(past.classification, 'LEGACY_PAST_DISPOSABLE');

  const hybrid = classifyBookingDocument({
    documentId: 'hybrid',
    data: { ...legacyBooking({ date: '2025-01-01', status: 'completed' }), lifecycle: {} },
    now,
    legacyTimeZone: 'Asia/Almaty',
  });
  assert.equal(hybrid.classification, 'AMBIGUOUS');
});

test('summary exposes blockers without personal information', () => {
  const rows = [
    classifyBookingDocument({
      documentId: 'legacy_active',
      data: legacyBooking({ date: '2025-01-01', status: 'confirmed' }),
      now,
      legacyTimeZone: 'Asia/Almaty',
    }),
  ];
  const summary = summarizeInventory(rows, { projectId: 'test-project' });
  assert.equal(summary.status, 'BLOCKED');
  assert.equal(summary.counts.LEGACY_ONLY_CURRENT_FUTURE, 1);
  assert.equal(summary.blockers.legacyOnlyCurrentFuture[0].actorMarker, 'account');
  assert.equal(JSON.stringify(summary).includes('user@example.com'), false);
});

function legacyBooking(overrides) {
  return {
    userId: 'user@example.com',
    instructorId: 'instructor_1',
    instructorName: 'Instructor',
    instructorAvatar: '',
    date: '2026-02-01',
    time: '10:00',
    durationHours: 1,
    totalPrice: 100,
    status: 'confirmed',
    difficulty: 'beginner',
    ...overrides,
  };
}
