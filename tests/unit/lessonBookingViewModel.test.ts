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
      paymentPresentation: {
        kind: 'visible',
        paymentStatus: 'paid',
        paymentRevision: 1,
        price: 50000,
      },
    });
    const item = mapLessonBookingReadModelToCabinetItem(readModel);
    expect(item.payment).toEqual({
      kind: 'visible',
      paymentStatus: 'paid',
      price: 50000,
    });
    expect(item.totalPrice).toBe(50000);
    expect(item.isLessonBooking).toBe(true);
    expect(item.participantNames).toEqual(['Alice Student']);
  });

  it('maps production-like paid KZT payment through calendar cabinet item', () => {
    const readModel = buildReadModel({
      bookingId: BookingIdSchema.parse('booking_b30f2dfe00f04cdb85d5092902bf99d4'),
      revision: 3,
      participants: [
        {
          participantId: ParticipantIdSchema.parse(
            '29ea271f35c01d51545cd77e56c3d2fc5990712f40f49279d98a83eb127c67b2'
          ),
          displayName: 'Ксюша',
        },
      ],
      paymentPresentation: {
        kind: 'visible',
        paymentStatus: 'paid',
        paymentRevision: 2,
        price: 50000,
      },
    });
    const item = mapLessonBookingReadModelToCabinetItem(readModel);
    expect(item.payment).toEqual({
      kind: 'visible',
      paymentStatus: 'paid',
      price: 50000,
    });
    expect(item.totalPrice).toBe(50000);
    expect(item.participantNames).toEqual(['Ксюша']);
  });

  it('maps production-like dependent participant booking for calendar cards', () => {
    const readModel = buildReadModel({
      bookingId: BookingIdSchema.parse('booking_633eed84516f4459a8baba8a20af0667'),
      revision: 2,
      participants: [
        {
          participantId: ParticipantIdSchema.parse(
            '2df3b3f88bad9e47232a77a29813a5eb220bc2917f6495db87d3edc0d0323bd7'
          ),
          displayName: 'Маша',
        },
      ],
    });
    const item = mapLessonBookingReadModelToCabinetItem(readModel);
    expect(item.participantNames).toEqual(['Маша']);
  });

  it('maps multi-participant family group names for calendar cards', () => {
    const readModel = buildReadModel({
      bookingId: BookingIdSchema.parse('booking_family_group_01'),
      revision: 1,
      partyKind: 'family_group',
      participantIds: [
        ParticipantIdSchema.parse('participant_fixture_01'),
        ParticipantIdSchema.parse('participant_fixture_02'),
      ],
      participants: [
        { participantId: ParticipantIdSchema.parse('participant_fixture_01'), displayName: 'Ксюша' },
        { participantId: ParticipantIdSchema.parse('participant_fixture_02'), displayName: 'Маша' },
      ],
    });
    const item = mapLessonBookingReadModelToCabinetItem(readModel);
    expect(item.participantNames).toEqual(['Ксюша', 'Маша']);
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
