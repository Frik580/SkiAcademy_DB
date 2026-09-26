import { describe, expect, it, vi } from 'vitest';
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
import { createExecuteGuestCanonicalCommandHandler } from './executeGuestCanonicalCommandCallable';
import { readGuestActionTokenSecret } from './canonicalCommandRuntime';

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
    guestPhone: '+7 701 123 45 67',
    guestEmail: 'guest@example.com',
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
    expect(envelope.context.transportMetadata).toMatchObject({
      guest_contact_phone: '+7 701 123 45 67',
      guest_contact_email: 'guest@example.com',
    });
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

  it('fails closed when a public creation has no trusted network evidence', async () => {
    vi.stubEnv('GUEST_ACTION_TOKEN_SECRET', 'test-guest-action-secret');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(readGuestActionTokenSecret()).toBe('test-guest-action-secret');
      const handler = createExecuteGuestCanonicalCommandHandler(undefined as never, {
        maxActiveLesson: 3,
        maxActiveCourse: 2,
      });
      for (const rawRequest of [
        { headers: {} },
        {
          headers: {
            'x-forwarded-for': 'not-an-ip',
            forwarded: 'for=198.51.100.44',
          },
          ip: '198.51.100.45',
          socket: { remoteAddress: '198.51.100.46' },
        },
        { headers: { 'x-forwarded-for': '203.0.113.9, 192.0.2.1' } },
        { headers: { 'x-forwarded-for': 'spoofed, 203.0.113.9, 192.0.2.1' } },
      ]) {
        await expect(
          handler({ data: validTransportPayload(), rawRequest } as never)
        ).rejects.toMatchObject({ code: 'failed-precondition' });
      }
      expect(warning.mock.calls.map(([message]) => JSON.parse(message))).toEqual([
        {
          event: 'guest_reservation_network_source_unavailable',
          failureReason: 'missing_source',
          xffEntryCount: 0,
        },
        {
          event: 'guest_reservation_network_source_unavailable',
          failureReason: 'malformed_source',
          xffEntryCount: 1,
        },
        {
          event: 'guest_reservation_network_source_unavailable',
          failureReason: 'unsupported_chain',
          xffEntryCount: 2,
        },
        {
          event: 'guest_reservation_network_source_unavailable',
          failureReason: 'unsupported_chain',
          xffEntryCount: 3,
        },
      ]);
      expect(warning.mock.calls.map(([message]) => message).join(' ')).not.toMatch(
        /203\.0\.113\.9|192\.0\.2\.1|198\.51\.100\.4[456]|spoofed|not-an-ip/
      );
    } finally {
      warning.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it('distinguishes missing HMAC material from missing network evidence', async () => {
    vi.stubEnv('GUEST_ACTION_TOKEN_SECRET', '  ');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(readGuestActionTokenSecret()).toBeUndefined();
      const handler = createExecuteGuestCanonicalCommandHandler(undefined as never, {
        maxActiveLesson: 3,
        maxActiveCourse: 2,
      });
      await expect(
        handler({
          data: validTransportPayload(),
          rawRequest: { headers: { 'x-forwarded-for': '203.0.113.9' } },
        } as never)
      ).rejects.toMatchObject({ code: 'failed-precondition' });
      expect(JSON.parse(warning.mock.calls[0]![0])).toMatchObject({
        failureReason: 'key_unavailable',
      });
    } finally {
      warning.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
