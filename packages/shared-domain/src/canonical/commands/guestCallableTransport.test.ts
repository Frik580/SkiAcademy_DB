import { describe, expect, it } from 'vitest';
import { BookingIdSchema, CorrelationIdSchema, InstructorIdSchema } from '../identifiers';
import {
  buildFrontendGuestLessonBookingCallablePayload,
  CreateGuestBookingRequestTransportSchema,
  parseCallableGuestCommandTransport,
} from './guestCallableTransport';

describe('guestCallableTransport schema', () => {
  const payload = buildFrontendGuestLessonBookingCallablePayload({
    bookingId: BookingIdSchema.parse('booking_schema_01'),
    instructorId: InstructorIdSchema.parse('instructor_schema_01'),
    participantId: '708ccb686eb97bd353927802f8b85c0e0dfa4b80d0bf579313f9667a147a9e9c',
    idempotencyKey: 'create-guest-request:booking_schema_01',
    correlationId: CorrelationIdSchema.parse('correlation_schema_01'),
    localDate: '2026-12-15',
    localTime: '10:00',
    durationMinutes: 120,
    timezone: 'Asia/Almaty',
    guestDisplayName: 'Schema Guest',
    guestSkillLevel: 'beginner',
    guestDiscipline: 'ski',
    guestAgeYears: 25,
  });

  it('accepts the canonical guest lesson booking transport payload', () => {
    expect(CreateGuestBookingRequestTransportSchema.safeParse(payload).success).toBe(true);
    expect(parseCallableGuestCommandTransport(payload).success).toBe(true);
  });

  it('rejects unknown top-level transport fields', () => {
    expect(
      parseCallableGuestCommandTransport({
        ...payload,
        legacyGuestName: 'legacy',
      }).success
    ).toBe(false);
  });
});
