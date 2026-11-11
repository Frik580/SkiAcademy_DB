import {
  CanonicalCommandError,
  resolveSchoolTimeZone,
  SCHOOL_TIME_ZONE_CONFIG_PATH,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import type { CanonicalAtomicTransactionSession } from '../transactions';

/** Read on every transaction attempt, after the idempotency replay gate. */
export async function assertSchoolTimeZone(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope,
  requestedTimeZone = envelope.context.timezone
): Promise<string> {
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
  if (requestedTimeZone !== timeZone) {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { field: 'schoolTimeZone', reason: 'conflict' },
    });
  }
  return timeZone;
}
