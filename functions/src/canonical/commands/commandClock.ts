import { timestampFromDate, type AuthoritativeCommandClock } from '@ski-academy/shared-domain';

export function createAuthoritativeCommandClock(
  now: Date = new Date(),
  options?: { committedAtOffsetMs?: number }
): AuthoritativeCommandClock {
  const frozenInstant = new Date(now.getTime());
  const committedAtOffsetMs = options?.committedAtOffsetMs ?? 0;
  const committedInstant = new Date(frozenInstant.getTime() + committedAtOffsetMs);
  return {
    now: () => new Date(frozenInstant.getTime()),
    decidedAt: () => new Date(frozenInstant.getTime()),
    committedAt: () => new Date(committedInstant.getTime()),
  };
}

export function decidedAtTimestampFromClock(
  clock: AuthoritativeCommandClock
): ReturnType<typeof timestampFromDate> {
  return timestampFromDate(clock.decidedAt());
}
