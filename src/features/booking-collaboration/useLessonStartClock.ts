import { useEffect, useState } from 'react';

/** Re-evaluate lesson controls and reads when the next visible lesson begins. */
export function useLessonStartClock(bookings: readonly { startsAtEpochMs: number }[]): number {
  const [nowMs, setNowMs] = useState(Date.now);

  useEffect(() => {
    const currentMs = Date.now();
    if (
      bookings.some(
        (booking) => booking.startsAtEpochMs > nowMs && booking.startsAtEpochMs <= currentMs
      )
    ) {
      setNowMs(currentMs);
      return;
    }
    const nextStartMs = bookings.reduce(
      (next, booking) =>
        booking.startsAtEpochMs > currentMs && booking.startsAtEpochMs < next
          ? booking.startsAtEpochMs
          : next,
      Infinity
    );
    if (!Number.isFinite(nextStartMs)) return;
    const timer = window.setTimeout(
      () => setNowMs(Date.now()),
      Math.min(nextStartMs - currentMs, 2_147_483_647)
    );
    return () => window.clearTimeout(timer);
  }, [bookings, nowMs]);

  return nowMs;
}
