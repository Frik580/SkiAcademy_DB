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

  it('maps callable insufficient_funds without mislabeling stale_version', () => {
    const error = toCanonicalCommandClientError(
      {
        code: 'functions/failed-precondition',
        message: 'There are insufficient funds.',
        details: {
          code: 'insufficient_funds',
          retryable: false,
          correlationId: 'correlation_insufficient_funds',
        },
      },
      'correlation_fallback'
    );
    expect(error.code).toBe('insufficient_funds');
    expect(error.message).toBe('There are insufficient funds.');
    expect(error.correlationId).toBe('correlation_insufficient_funds');
  });

  it('maps stale_version when transport includes revision mismatch details', () => {
    const error = toCanonicalCommandClientError(
      {
        code: 'functions/failed-precondition',
        message: 'The record changed; refresh it before retrying.',
        details: {
          code: 'stale_version',
          retryable: false,
          correlationId: 'correlation_stale_version',
          currentRevision: 3,
        },
      },
      'correlation_fallback'
    );
    expect(error.code).toBe('stale_version');
    expect(error.currentRevision).toBe(3);
  });

  it('recognizes the guest quota code in callable details without using its message', () => {
    const error = toCanonicalCommandClientError(
      {
        code: 'functions/resource-exhausted',
        message: 'arbitrary backend text',
        details: {
          code: 'guest_reservation_limit',
          retryable: false,
          correlationId: 'correlation_guest_limit',
        },
      },
      'correlation_fallback'
    );
    expect(error.code).toBe('guest_reservation_limit');
    expect(error.correlationId).toBe('correlation_guest_limit');
  });

  it('recovers quota details from the functions client error cause', () => {
    const error = toCanonicalCommandClientError(
      {
        code: 'functions/resource-exhausted',
        message: 'wrapped transport error',
        cause: {
          details: {
            code: 'guest_reservation_limit',
            retryable: false,
            correlationId: 'correlation_guest_wrapped',
          },
        },
      },
      'correlation_fallback'
    );
    expect(error.code).toBe('guest_reservation_limit');
    expect(error.correlationId).toBe('correlation_guest_wrapped');
  });

  it('does not classify a different failed precondition as guest quota', () => {
    const error = toCanonicalCommandClientError(
      { code: 'functions/failed-precondition', message: 'other precondition' },
      'correlation_fallback'
    );
    expect(error.code).not.toBe('guest_reservation_limit');
  });
});
