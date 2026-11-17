import {
  CanonicalCommandError,
  isLessonBookingIntervalInSeason,
  resolveLessonBookingSeason,
  resolveBookingScheduleFromCalendarInput,
  resolveSchoolTimeZone,
  SCHOOL_TIME_ZONE_CONFIG_PATH,
  type CommandEnvelope,
  type TimeInterval,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';

/** Read on every transaction attempt, after the idempotency replay gate. */
export async function assertNewLessonBookingSettings(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope,
  requestedTimeZone = envelope.context.timezone
): Promise<string> {
  const { timeZone, season } = await readBookingSettings(session, envelope);
  if (requestedTimeZone !== timeZone) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'schoolTimeZone', reason: 'conflict' },
    });
  }
  const schedule = resolveBookingScheduleFromCalendarInput(
    envelope.context.calendarInput!,
    timeZone
  );
  assertSeason(envelope, season, schedule.interval, timeZone);
  return timeZone;
}

async function readBookingSettings(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope
) {
  const config = await session.tx.get({ path: SCHOOL_TIME_ZONE_CONFIG_PATH });
  session.plan.planRead({ path: SCHOOL_TIME_ZONE_CONFIG_PATH, category: 'aggregate' });
  let timeZone: string;
  try {
    timeZone = resolveSchoolTimeZone(config.exists ? config.data : undefined);
  } catch {
    throw new CanonicalCommandError('unavailable', {
      correlationId: envelope.context.correlationId,
      details: { field: 'schoolTimeZone', reason: 'malformed' },
    });
  }
  return { timeZone, season: resolveLessonBookingSeason(config.data?.season) };
}

function assertSeason(
  envelope: CommandEnvelope,
  season: ReturnType<typeof resolveLessonBookingSeason>,
  interval: TimeInterval,
  timeZone: string
) {
  if (!isLessonBookingIntervalInSeason(season, interval, timeZone)) {
    throw new CanonicalCommandError(season.kind === 'invalid' ? 'unavailable' : 'validation', {
      correlationId: envelope.context.correlationId,
      details: {
        field: 'bookingSeason',
        reason: season.kind === 'invalid' ? 'malformed' : 'conflict',
      },
    });
  }
}

/** Existing occurrence zones may differ; season boundaries always use current school settings. */
export async function assertBookingSeason(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope,
  interval: TimeInterval
): Promise<void> {
  const { timeZone, season } = await readBookingSettings(session, envelope);
  assertSeason(envelope, season, interval, timeZone);
}
