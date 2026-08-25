import { describe, expect, it } from 'vitest';
import {
  BookingIdSchema,
  BookingSchema,
  CorrelationIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  InstructorIdSchema,
  attendanceIdFromBookingIdentity,
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  paymentIdFromBookingId,
  timestampFromDate,
  accountCommandActor,
  systemCommandActor,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';

const correlationId = CorrelationIdSchema.parse('correlation_attendance_unit_01');
const bookingId = BookingIdSchema.parse('booking_attendance_unit_01');
const occurrenceId = OccurrenceIdSchema.parse('occurrence_attendance_unit_01');
const participantId = ParticipantIdSchema.parse('participant_attendance_unit_01');
const instructorId = InstructorIdSchema.parse('instructor_attendance_unit_01');
const startsAt = timestampFromDate(new Date('2026-01-15T09:00:00.000Z'));
const endsAt = timestampFromDate(new Date('2026-01-15T10:00:00.000Z'));
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function environment(at: string) {
  return { clock: createAuthoritativeCommandClock(new Date(at)) };
}

function booking() {
  return BookingSchema.parse({
    bookingId,
    attribution: {
      bookingOrigin: 'admin',
      bookedBy: { kind: 'account', accountId: 'account_attendance_unit_01' },
    },
    party: { kind: 'individual', participantIds: [participantId] },
    occurrence: {
      occurrenceId,
      instructorId,
      interval: { startsAt, endsAt },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [participantId], frozenAt: startsAt },
    },
    lifecycle: { status: 'confirmed' },
    paymentId: paymentIdFromBookingId(bookingId),
    revision: 1,
    createdAt,
    updatedAt: createdAt,
    audit: {
      createdByCommandId: 'seed',
      lastChangedByCommandId: 'seed',
      correlationId,
    },
  });
}

function instructorEnvelope(
  idempotencyKey: string,
  at: string,
  attendanceStatus: 'present' | 'absent'
): CommandEnvelope<'record_booking_attendance'> {
  return {
    kind: 'record_booking_attendance',
    context: {
      actor: accountCommandActor('account_instructor_attendance_01'),
      exercisedCapability: 'instructor',
      idempotencyKey,
      correlationId,
      source: 'client_callable',
      transportMetadata: { instructor_id: instructorId },
    },
    intent: { bookingId, participantId, attendanceStatus },
  };
}

function systemResolveEnvelope(idempotencyKey: string): CommandEnvelope<'resolve_attendance_outcome'> {
  return {
    kind: 'resolve_attendance_outcome',
    context: {
      actor: systemCommandActor('system_actor_resolve_attendance_outcome_01'),
      exercisedCapability: 'system',
      idempotencyKey,
      correlationId,
      source: 'scheduler',
    },
    intent: { subjectKind: 'booking', subjectId: bookingId },
  };
}

describe('bookingAttendanceCommands', () => {
  it('forbids instructor attendance before start', async () => {
    const seededBooking = booking();
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`bookings/${bookingId}`]: seededBooking as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(
      environment('2026-01-15T08:59:59.999Z'),
      executor
    );
    const result = await commands.execute(
      instructorEnvelope('before-start', '2026-01-15T08:59:59.999Z', 'present')
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('invalid_transition');
    }
  });

  it('records present attendance and completes booking after endsAt', async () => {
    const seededBooking = booking();
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`bookings/${bookingId}`]: seededBooking as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(
      environment('2026-01-15T10:00:00.000Z'),
      executor
    );
    const result = await commands.execute(
      instructorEnvelope('present-complete', '2026-01-15T10:00:00.000Z', 'present')
    );
    expect(result.status).toBe('success');
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId,
      participantId,
    });
    const snapshot = executor.snapshot();
    expect(snapshot.docs.get(`attendance/${attendanceId}`)?.data.attendanceStatus).toBe('present');
    expect(snapshot.docs.get(`bookings/${bookingId}`)?.data.lifecycle).toEqual({
      status: 'completed',
      completedAt: endsAt,
    });
  });

  it('does not complete booking before endsAt even with present attendance', async () => {
    const seededBooking = booking();
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`bookings/${bookingId}`]: seededBooking as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(
      environment('2026-01-15T09:30:00.000Z'),
      executor
    );
    const result = await commands.execute(
      instructorEnvelope('present-early', '2026-01-15T09:30:00.000Z', 'present')
    );
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.lifecycle).toEqual({
      status: 'confirmed',
    });
  });

  it('records absent and resolves no_show after endsAt', async () => {
    const seededBooking = booking();
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`bookings/${bookingId}`]: seededBooking as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(
      environment('2026-01-15T10:00:00.000Z'),
      executor
    );
    const result = await commands.execute(
      instructorEnvelope('absent-noshow', '2026-01-15T10:00:00.000Z', 'absent')
    );
    expect(result.status).toBe('success');
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.lifecycle).toEqual({
      status: 'no_show',
      noShowAt: endsAt,
    });
  });

  it('creates missing_attendance issue when resolver runs without attendance', async () => {
    const seededBooking = booking();
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`bookings/${bookingId}`]: seededBooking as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(
      environment('2026-01-16T10:00:00.000Z'),
      executor
    );
    const result = await commands.execute(systemResolveEnvelope('missing-issue'));
    expect(result.status).toBe('success');
    const issues = [...executor.snapshot().docs.entries()].filter(([path]) =>
      path.startsWith('admin_issues/')
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.[1].data.kind).toBe('missing_attendance');
    expect(executor.snapshot().docs.get(`bookings/${bookingId}`)?.data.lifecycle).toEqual({
      status: 'confirmed',
    });
  });

  it('replays attendance command without duplicate attendance revision bump', async () => {
    const seededBooking = booking();
    const executor = createInMemoryCanonicalTransactionExecutor({
      [`bookings/${bookingId}`]: seededBooking as unknown as Record<string, unknown>,
    });
    const commands = createProductionCanonicalCommands(
      environment('2026-01-15T10:00:00.000Z'),
      executor
    );
    const envelope = instructorEnvelope('replay', '2026-01-15T10:00:00.000Z', 'present');
    expect((await commands.execute(envelope)).status).toBe('success');
    expect((await commands.execute(envelope)).status).toBe('success');
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId,
      participantId,
    });
    expect(executor.snapshot().docs.get(`attendance/${attendanceId}`)?.data.revision).toBe(1);
  });
});
