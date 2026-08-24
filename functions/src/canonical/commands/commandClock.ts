import { timestampFromDate, type AuthoritativeCommandClock } from '@ski-academy/shared-domain';

export function createAuthoritativeCommandClock(now: Date = new Date()): AuthoritativeCommandClock {
  const frozenInstant = new Date(now.getTime());
  return {
    now: () => new Date(frozenInstant.getTime()),
    decidedAt: () => new Date(frozenInstant.getTime()),
  };
}

export function decidedAtTimestampFromClock(
  clock: AuthoritativeCommandClock
): ReturnType<typeof timestampFromDate> {
  return timestampFromDate(clock.decidedAt());
}
