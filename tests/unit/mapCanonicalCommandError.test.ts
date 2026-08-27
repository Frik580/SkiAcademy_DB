import { describe, expect, it, vi } from 'vitest';
import {
  CanonicalCommandClientError,
  mapCanonicalCommandTransportError,
  toCanonicalCommandClientError,
} from '../../src/lib/canonical/mapCanonicalCommandError';

describe('mapCanonicalCommandError', () => {
  it('maps canonical transport errors without leaking internals', () => {
    const error = mapCanonicalCommandTransportError({
      code: 'stale_version',
      message: 'The record changed; refresh it before retrying.',
      retryable: false,
      correlationId: 'correlation_test_01',
      currentRevision: 4,
    });

    expect(error).toBeInstanceOf(CanonicalCommandClientError);
    expect(error.code).toBe('stale_version');
    expect(error.currentRevision).toBe(4);
    expect(error.message).not.toContain('Firebase');
  });

  it('normalizes firebase permission-denied into forbidden', () => {
    const error = toCanonicalCommandClientError(
      { code: 'functions/permission-denied', message: 'denied', details: {} },
      'correlation_fallback'
    );
    expect(error.code).toBe('forbidden');
    expect(error.correlationId).toBe('correlation_fallback');
  });

  it('preserves idempotency conflict from callable details', () => {
    const error = toCanonicalCommandClientError(
      {
        code: 'functions/already-exists',
        message: 'exists',
        details: {
          code: 'idempotency_conflict',
          message: 'The request key was already used.',
          retryable: false,
          correlationId: 'correlation_idempotency',
        },
      },
      'correlation_fallback'
    );
    expect(error.code).toBe('idempotency_conflict');
    expect(error.correlationId).toBe('correlation_idempotency');
  });
});
