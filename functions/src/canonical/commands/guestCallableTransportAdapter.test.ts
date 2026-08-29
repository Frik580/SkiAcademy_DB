import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  BookingIdSchema,
  CorrelationIdSchema,
  InstructorIdSchema,
  buildFrontendGuestLessonBookingCallablePayload,
  parseCommandEnvelope,
} from '@ski-academy/shared-domain';
import {
  buildGuestCommandEnvelopeFromCallable,
  deriveGuestSubjectIdForIntent,
  parseCallableGuestCommandTransportInput,
} from './guestCallableTransportAdapter';

const bookingId = BookingIdSchema.parse('booking_handler_contract_01');
const instructorId = InstructorIdSchema.parse('instructor_handler_contract_01');
const participantId = '708ccb686eb97bd353927802f8b85c0e0dfa4b80d0bf579313f9667a147a9e9c';
const correlationId = CorrelationIdSchema.parse('correlation_handler_contract_01');

function validTransportPayload() {
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
    guestDisplayName: 'Guest Handler Contract',
    guestSkillLevel: 'beginner',
    guestDiscipline: 'ski',
    guestAgeYears: 25,
  });
}

describe('guestCallableTransportAdapter', () => {
  it('maps callable transport input into a valid guest booking envelope', () => {
    const transport = validTransportPayload();
    const guestSubjectId = deriveGuestSubjectIdForIntent(transport.intent);
    expect(guestSubjectId).toBeDefined();

    const envelope = buildGuestCommandEnvelopeFromCallable(guestSubjectId!, transport);
    expect(parseCommandEnvelope(envelope).success).toBe(true);
    expect(envelope.context.transportMetadata?.participant_display_name).toBe(
      'Guest Handler Contract'
    );
  });

  it('rejects malformed transport payloads before envelope construction', () => {
    expect(() =>
      parseCallableGuestCommandTransportInput({
        data: { kind: 'create_guest_booking' },
      } as never)
    ).toThrow(HttpsError);
  });
});
