import { describe, expect, it } from 'vitest';
import {
  addMillisecondsToCanonicalTimestamp,
  isBookingProposalAcceptanceAllowedBeforeStart,
  isBookingProposalExpired,
  resolveBookingProposalExpiresAt,
  timestampFromDate,
  BOOKING_PROPOSAL_TTL_MS,
} from '@ski-academy/shared-domain';

const ts = (value: string) => timestampFromDate(new Date(value));

describe('bookingProposalPolicy', () => {
  it('expires at min(createdAt + 24h, startAt)', () => {
    const createdAt = ts('2026-01-01T00:00:00.000Z');
    const startAt = ts('2026-01-02T12:00:00.000Z');
    const expiresAt = resolveBookingProposalExpiresAt({ createdAt, serviceStartsAt: startAt });
    const ttlBoundary = addMillisecondsToCanonicalTimestamp(createdAt, BOOKING_PROPOSAL_TTL_MS);
    expect(expiresAt).toEqual(ttlBoundary);
  });

  it('expires at service start when start is sooner than 24h', () => {
    const createdAt = ts('2026-01-01T00:00:00.000Z');
    const startAt = ts('2026-01-01T06:00:00.000Z');
    expect(resolveBookingProposalExpiresAt({ createdAt, serviceStartsAt: startAt })).toEqual(
      startAt
    );
  });

  it('treats expiry boundary as expired', () => {
    const expiresAt = ts('2026-01-01T12:00:00.000Z');
    expect(isBookingProposalExpired({ now: expiresAt, expiresAt })).toBe(true);
  });

  it('requires acceptance before service start', () => {
    const startAt = ts('2026-01-01T12:00:00.000Z');
    expect(
      isBookingProposalAcceptanceAllowedBeforeStart({
        now: ts('2026-01-01T11:59:59.000Z'),
        serviceStartsAt: startAt,
      })
    ).toBe(true);
    expect(
      isBookingProposalAcceptanceAllowedBeforeStart({
        now: startAt,
        serviceStartsAt: startAt,
      })
    ).toBe(false);
  });
});
