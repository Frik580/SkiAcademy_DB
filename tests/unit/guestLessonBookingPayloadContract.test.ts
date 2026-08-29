import { describe, expect, it } from 'vitest';
import {
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  buildFrontendGuestLessonBookingCallablePayload,
  CreateGuestBookingRequestTransportSchema,
  parseCallableGuestCommandTransport,
  parseCommandEnvelope,
  guestSubjectIdFromBookingId,
} from '@ski-academy/shared-domain';
import {
  buildGuestCommandEnvelopeFromCallable,
  deriveGuestSubjectIdForIntent,
} from '../../functions/src/canonical/commands/guestCallableTransportAdapter';

const bookingId = BookingIdSchema.parse('booking_transport_contract_01');
const instructorId = InstructorIdSchema.parse('instructor_transport_contract_01');
const participantId = '708ccb686eb97bd353927802f8b85c0e0dfa4b80d0bf579313f9667a147a9e9c';
const correlationId = CorrelationIdSchema.parse('correlation_transport_contract_01');

function frontendGuestLessonBookingPayload() {
  return buildFrontendGuestLessonBookingCallablePayload({
    bookingId,
    instructorId,
    participantId,
    idempotencyKey: `create-guest-request:${bookingId}`,
    correlationId,
    localDate: '2026-12-15',
    localTime: '10:00',
    durationMinutes: 120,
    timezone: 'Asia/Almaty',
    guestDisplayName: 'Guest Transport Contract',
    guestSkillLevel: 'beginner',
    guestDiscipline: 'ski',
    guestAgeYears: 25,
  });
}

describe('guest lesson booking callable transport contract', () => {
  it('accepts the frontend guest booking payload shape', () => {
    const payload = frontendGuestLessonBookingPayload();
    expect(CreateGuestBookingRequestTransportSchema.safeParse(payload).success).toBe(true);
    expect(parseCallableGuestCommandTransport(payload).success).toBe(true);
  });

  it('builds a valid command envelope for executeGuestCanonicalCommand', () => {
    const payload = frontendGuestLessonBookingPayload();
    const guestSubjectId = deriveGuestSubjectIdForIntent(payload.intent);
    expect(guestSubjectId).toBe(guestSubjectIdFromBookingId(bookingId));

    const envelope = buildGuestCommandEnvelopeFromCallable(guestSubjectId!, payload);
    expect(parseCommandEnvelope(envelope).success).toBe(true);
  });

  it('rejects legacy guest booking command kinds', () => {
    const payload = {
      ...frontendGuestLessonBookingPayload(),
      kind: 'create_guest_booking',
    };
    expect(parseCallableGuestCommandTransport(payload).success).toBe(false);
  });

  it('rejects guest booking payloads without participant profile metadata', () => {
    const payload = frontendGuestLessonBookingPayload();
    const { guestParticipantDisplayName: _displayName, ...withoutDisplayName } = payload;
    expect(parseCallableGuestCommandTransport(withoutDisplayName).success).toBe(false);
  });
});
