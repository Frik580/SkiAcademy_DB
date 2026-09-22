import { describe, expect, it, vi } from 'vitest';
import {
  AUTHENTICATED_CANONICAL_COMMAND_CALLABLE,
  GUEST_CANONICAL_COMMAND_CALLABLE,
  executeAuthenticatedCanonicalCommand,
  executeGuestCanonicalCommand,
} from '../../src/lib/canonical/canonicalCommandClient';

const callFunctionMock = vi.fn();

vi.mock('../../src/lib/functions/functionsClient', () => ({
  callFunction: (...args: unknown[]) => callFunctionMock(...args),
}));

describe('canonicalCommandClient', () => {
  it('routes authenticated commands through executeCanonicalCommand callable', async () => {
    callFunctionMock.mockResolvedValueOnce({
      status: 'success',
      kind: 'complete_booking',
      correlationId: 'correlation_client_01',
    });

    const result = await executeAuthenticatedCanonicalCommand('account_client_01', {
      kind: 'complete_booking',
      intent: { bookingId: 'booking_client_01' },
      idempotencyKey: 'idem-client-01',
      correlationId: 'correlation_client_01',
      expectedRevision: 2,
      exercisedCapability: 'account_owner',
    });

    expect(result.status).toBe('success');
    expect(callFunctionMock).toHaveBeenCalledWith(
      AUTHENTICATED_CANONICAL_COMMAND_CALLABLE,
      expect.objectContaining({
        kind: 'complete_booking',
        idempotencyKey: 'idem-client-01',
        correlationId: 'correlation_client_01',
        expectedRevision: 2,
        exercisedCapability: 'account_owner',
      }),
      expect.objectContaining({ idempotencyKey: 'idem-client-01' })
    );
    expect(callFunctionMock.mock.calls[0]?.[1]).not.toHaveProperty('requestedTestSessionId');
  });

  it('forwards explicit Admin Test context beside the command intent', async () => {
    callFunctionMock.mockResolvedValueOnce({
      status: 'success',
      kind: 'record_manual_wallet_funding',
    });

    await executeAuthenticatedCanonicalCommand('account_admin_01', {
      kind: 'record_manual_wallet_funding',
      intent: {
        accountId: 'account_wallet_01',
        amount: 180_000,
        reasonExplanation: 'Course smoke top-up',
      },
      idempotencyKey: 'admin_finance:manual_wallet_funding:test',
      requestedTestSessionId: 'test_finance_ctx_a',
    });

    const payload = callFunctionMock.mock.calls.find(
      (call) =>
        (call[1] as { kind?: string } | undefined)?.kind === 'record_manual_wallet_funding'
    )?.[1] as {
      intent: Record<string, unknown>;
      requestedTestSessionId?: string;
    };
    expect(payload.requestedTestSessionId).toBe('test_finance_ctx_a');
    expect(payload.intent).not.toHaveProperty('requestedTestSessionId');
    expect(payload.intent).not.toHaveProperty('testSessionId');
    expect(payload.intent).not.toHaveProperty('dataScope');
  });

  it('routes guest commands through executeGuestCanonicalCommand callable', async () => {
    callFunctionMock.mockResolvedValueOnce({
      status: 'success',
      kind: 'create_guest_booking_request',
      correlationId: 'correlation_guest_client_01',
    });

    await executeGuestCanonicalCommand({
      kind: 'create_guest_booking_request',
      intent: {
        bookingId: 'booking_guest_client_01',
        instructorId: 'instructor_guest_client_01',
        participantIds: ['participant_guest_client_01'],
      },
      idempotencyKey: 'idem-guest-client-01',
      guestActionNonce: 'nonce-01',
      guestActionSignature: 'sig-01',
    });

    expect(callFunctionMock).toHaveBeenCalledWith(
      GUEST_CANONICAL_COMMAND_CALLABLE,
      expect.objectContaining({
        guestActionNonce: 'nonce-01',
        guestActionSignature: 'sig-01',
      }),
      expect.objectContaining({ idempotencyKey: 'idem-guest-client-01' })
    );
  });

  it('maps callable failures to canonical client errors', async () => {
    callFunctionMock.mockRejectedValueOnce({
      code: 'functions/failed-precondition',
      message: 'stale',
      details: {
        code: 'stale_version',
        message: 'The record changed; refresh it before retrying.',
        retryable: false,
        correlationId: 'correlation_stale',
        currentRevision: 9,
      },
    });

    await expect(
      executeAuthenticatedCanonicalCommand('account_client_01', {
        kind: 'complete_booking',
        intent: { bookingId: 'booking_client_01' },
        idempotencyKey: 'idem-stale',
        correlationId: 'correlation_stale',
      })
    ).rejects.toMatchObject({
      code: 'stale_version',
      currentRevision: 9,
    });
  });
});
