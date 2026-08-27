import { describe, expect, it } from 'vitest';
import {
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  timestampFromDate,
  type LessonBookingReadModel,
} from '@ski-academy/shared-domain';
import {
  mapLessonBookingReadModelToCabinetItem,
  mergeLessonBookingRecords,
} from '../../src/features/lesson-bookings/lessonBookingViewModel';

function buildReadModel(
  overrides: Partial<LessonBookingReadModel> &
    Pick<LessonBookingReadModel, 'bookingId' | 'revision'>
): LessonBookingReadModel {
  const startsAt = timestampFromDate(new Date('2026-06-15T04:00:00.000Z'));
  const endsAt = timestampFromDate(new Date('2026-06-15T06:00:00.000Z'));
  const updatedAt = timestampFromDate(new Date('2026-06-01T00:00:00.000Z'));
  const participantId = ParticipantIdSchema.parse('participant_fixture_01');
  return {
    bookingId: overrides.bookingId,
    revision: overrides.revision,
    partyKind: overrides.partyKind ?? 'individual',
    participantIds: overrides.participantIds ?? [participantId],
    participants: overrides.participants ?? [{ participantId, displayName: 'Alice Student' }],
    instructor: overrides.instructor ?? {
      instructorId: InstructorIdSchema.parse('instructor_fixture_01'),
      displayName: 'Coach Ivan',
      avatarUrl: 'https://example.com/avatar.png',
    },
    occurrence: overrides.occurrence ?? {
      startsAt,
      endsAt,
      timeZone: 'Asia/Almaty',
      durationMinutes: 120,
    },
    lifecycle: overrides.lifecycle ?? { status: 'confirmed' },
    bookingOrigin: overrides.bookingOrigin ?? 'account',
    paymentPresentation: overrides.paymentPresentation,
    updatedAt: overrides.updatedAt ?? updatedAt,
  };
}

describe('lessonBookingViewModel', () => {
  it('maps visible payment presentation from canonical read model', () => {
    const readModel = buildReadModel({
      bookingId: BookingIdSchema.parse('booking_visible_01'),
      revision: 2,
      paymentPresentation: { kind: 'visible', paymentStatus: 'settled', paymentRevision: 1 },
    });
    const item = mapLessonBookingReadModelToCabinetItem(readModel);
    expect(item.payment).toEqual({
      kind: 'visible',
      paymentStatus: 'settled',
    });
    expect(item.isLessonBooking).toBe(true);
    expect(item.participantNames).toEqual(['Alice Student']);
  });

  it('maps withheld payment presentation without inferring amounts', () => {
    const readModel = buildReadModel({
      bookingId: BookingIdSchema.parse('booking_withheld_01'),
      revision: 1,
      paymentPresentation: { kind: 'withheld' },
    });
    const item = mapLessonBookingReadModelToCabinetItem(readModel);
    expect(item.payment).toEqual({ kind: 'withheld' });
    expect(item.totalPrice).toBeUndefined();
  });

  it('mergeLessonBookingRecords keeps newer revision and rejects stale overwrite', () => {
    const bookingId = BookingIdSchema.parse('booking_merge_01');
    const newer = buildReadModel({ bookingId, revision: 5 });
    const stale = buildReadModel({ bookingId, revision: 3 });
    const initial = mergeLessonBookingRecords(new Map(), [newer]);
    const merged = mergeLessonBookingRecords(initial, [stale]);
    expect(merged.get(bookingId)?.revision).toBe(5);
    const upgraded = mergeLessonBookingRecords(merged, [
      buildReadModel({ bookingId, revision: 7 }),
    ]);
    expect(upgraded.get(bookingId)?.revision).toBe(7);
  });
});
