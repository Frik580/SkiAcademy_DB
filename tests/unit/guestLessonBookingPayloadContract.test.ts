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
  parseGuestParticipantProfileFromTransportMetadata,
} from '@ski-academy/shared-domain';
import {
  buildGuestCommandEnvelopeFromCallable,
  deriveGuestSubjectIdForIntent,
} from '../../functions/src/canonical/commands/guestCallableTransportAdapter';
import {
  parseGuestParticipantForm,
  guestParticipantCommandFields,
} from '../../src/features/guest-reservations/guestParticipantForm';

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
    guestPhone: '+7 701 123 45 67',
    guestEmail: 'guest@example.com',
    guestSkillLevel: 'beginner',
    guestDiscipline: 'ski',
    guestAgeYears: 25,
    difficulty: 'freestyle',
    notes: 'Park session',
  });
}

describe('guest lesson booking callable transport contract', () => {
  it.each(['ski', 'snowboard'] as const)(
    'preserves the actual %s form profile through the server adapter',
    (discipline) => {
      const form = parseGuestParticipantForm({
        displayName: 'Guest Child',
        discipline,
        skillLevel: 'intermediate',
        ageYears: '12',
      });
      if (!form.success) throw form.error;
      const payload = buildFrontendGuestLessonBookingCallablePayload({
        bookingId,
        instructorId,
        participantId,
        correlationId,
        idempotencyKey: `create-guest-request:${bookingId}`,
        localDate: '2026-12-15',
        localTime: '10:00',
        durationMinutes: 120,
        timezone: 'Asia/Almaty',
        guestPhone: '+77001234567',
        difficulty: 'intermediate',
        ...guestParticipantCommandFields(form.data),
      });
      expect(parseCallableGuestCommandTransport(payload).success).toBe(true);
      const envelope = buildGuestCommandEnvelopeFromCallable(
        deriveGuestSubjectIdForIntent(payload.intent)!,
        payload
      );
      expect(
        parseGuestParticipantProfileFromTransportMetadata(envelope.context.transportMetadata)
      ).toMatchObject({
        success: true,
        data: { displayName: 'Guest Child', discipline, skillLevel: 'intermediate', ageYears: 12 },
      });
    }
  );

  it('accepts missing age on the guest lesson transport', () => {
    const { guestParticipantAgeYears: _age, ...payload } = frontendGuestLessonBookingPayload();
    expect(parseCallableGuestCommandTransport(payload).success).toBe(true);
  });
  it('accepts missing skill while still requiring explicit valid discipline', () => {
    const { guestParticipantSkillLevel: _skill, ...payload } = frontendGuestLessonBookingPayload();
    expect(parseCallableGuestCommandTransport(payload).success).toBe(true);
    expect(
      parseCallableGuestCommandTransport({ ...payload, guestParticipantDiscipline: undefined })
        .success
    ).toBe(false);
    expect(
      parseCallableGuestCommandTransport({ ...payload, guestParticipantDiscipline: 'skate' })
        .success
    ).toBe(false);
  });
  it('accepts the frontend guest booking payload shape', () => {
    const payload = frontendGuestLessonBookingPayload();
    expect(CreateGuestBookingRequestTransportSchema.safeParse(payload).success).toBe(true);
    expect(parseCallableGuestCommandTransport(payload).success).toBe(true);
    expect(payload.intent.difficulty).toBe('freestyle');
    expect(payload.intent.notes).toBe('Park session');
    expect(payload.guestPhone).toBe('+7 701 123 45 67');
    expect(payload.guestEmail).toBe('guest@example.com');
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
