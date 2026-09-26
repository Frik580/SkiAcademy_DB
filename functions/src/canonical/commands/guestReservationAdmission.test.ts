import { describe, expect, it } from 'vitest';
import { deriveGuestReservationActorKey } from './guestReservationAdmission';

describe('guest reservation network key', () => {
  it('accepts the verified single-address IPv4 ingress and HMACs it', () => {
    const actorKey = deriveGuestReservationActorKey('203.0.113.9', 'secret');
    expect(actorKey).toMatch(/^[a-f0-9]{64}$/);
    expect(actorKey).not.toContain('203.0.113.9');
    expect(deriveGuestReservationActorKey('203.0.113.9', 'secret')).toBe(actorKey);
    expect(deriveGuestReservationActorKey('203.0.113.10', 'secret')).not.toBe(actorKey);
  });

  it('accepts and normalizes a single IPv6 address', () => {
    expect(deriveGuestReservationActorKey('2001:0db8:0:0:0:0:0:1', 'secret')).toBe(
      deriveGuestReservationActorKey('2001:db8::1', 'secret')
    );
  });

  it('fails closed for missing or malformed evidence', () => {
    expect(deriveGuestReservationActorKey(undefined, 'secret')).toBeUndefined();
    expect(deriveGuestReservationActorKey('', 'secret')).toBeUndefined();
    expect(deriveGuestReservationActorKey(['203.0.113.9'], 'secret')).toBeUndefined();
    expect(deriveGuestReservationActorKey('not-an-ip', 'secret')).toBeUndefined();
  });

  it('fails closed for two or more entries, including forged prefixes', () => {
    expect(deriveGuestReservationActorKey('203.0.113.9, 192.0.2.1', 'secret')).toBeUndefined();
    expect(
      deriveGuestReservationActorKey('198.51.100.44, 203.0.113.9, 192.0.2.1', 'secret')
    ).toBeUndefined();
    expect(
      deriveGuestReservationActorKey('spoofed1, spoofed2, 203.0.113.9, 192.0.2.1', 'secret')
    ).toBeUndefined();
  });

  it('uses the existing keyed HMAC material rather than the raw address', () => {
    const first = deriveGuestReservationActorKey('203.0.113.9', 'first-secret');
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(deriveGuestReservationActorKey('203.0.113.9', 'second-secret')).not.toBe(
      first
    );
  });
});
