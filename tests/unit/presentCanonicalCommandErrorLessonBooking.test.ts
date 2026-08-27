import { describe, expect, it } from 'vitest';
import { CanonicalCommandClientError } from '../../src/lib/canonical/mapCanonicalCommandError';
import {
  presentCanonicalCommandError,
  presentCanonicalCommandErrorWithContext,
} from '../../src/features/lesson-bookings/presentCanonicalCommandError';

describe('presentCanonicalCommandError (lesson-bookings)', () => {
  it('marks stale_version as shouldRefresh without stack traces', () => {
    const presented = presentCanonicalCommandError(
      new CanonicalCommandClientError('stale_version', {
        correlationId: 'correlation_stale',
        currentRevision: 4,
      })
    );
    expect(presented.code).toBe('stale_version');
    expect(presented.shouldRefresh).toBe(true);
    expect(presented.correlationId).toBe('correlation_stale');
    expect(presented.message).not.toContain('stack');
  });

  it('maps insufficient_funds through translation context', () => {
    const presented = presentCanonicalCommandErrorWithContext(
      new CanonicalCommandClientError('insufficient_funds', {
        correlationId: 'correlation_funds',
      }),
      { t: (key: string) => `translated:${key}` }
    );
    expect(presented.message).toBe('translated:insufficientFunds');
  });

  it('handles canonical error codes without leaking internals', () => {
    const codes = [
      'concurrent_modification',
      'idempotency_conflict',
      'payment_required',
      'participant_conflict',
      'instructor_conflict',
      'resource_conflict',
      'forbidden',
      'unauthorized',
      'expired',
      'blocked_relationship',
      'internal',
    ] as const;
    for (const code of codes) {
      const presented = presentCanonicalCommandError(
        new CanonicalCommandClientError(code, { correlationId: `correlation_${code}` })
      );
      expect(presented.code).toBe(code);
      expect(presented.message.length).toBeGreaterThan(0);
      expect(presented.message).not.toContain('Firebase');
    }
  });
});
