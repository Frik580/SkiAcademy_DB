import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callFunction } = vi.hoisted(() => ({
  callFunction: vi.fn(),
}));

vi.mock('../../src/lib/functions/functionsClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/functions/functionsClient')>();
  return { ...actual, callFunction };
});

import {
  TEST_SESSION_LIFECYCLE_CALLABLE,
  executeTestSessionLifecycle,
  lifecycleErrorCode,
} from '../../src/lib/canonical/testSessionLifecycleClient';
import { FunctionsClientError } from '../../src/lib/functions/functionsClient';

describe('testSessionLifecycleClient', () => {
  beforeEach(() => {
    callFunction.mockReset();
  });

  it('calls preview_test_session_reset with idempotency key', async () => {
    callFunction.mockResolvedValue({
      command: 'preview_test_session_reset',
      outcome: 'preview',
      testSessionId: 'test_session_alpha_01',
      manifest: {
        manifestId: 'manifest_01',
        manifestHash: 'hashhashhashhashhash',
        inventoryRevision: 1,
        createdAt: '2026-09-22T10:00:00.000Z',
        expiresAt: '2026-09-22T10:10:00.000Z',
        counts: { bookings: 1 },
        preserve: ['test_session'],
        warnings: [],
      },
    });

    await executeTestSessionLifecycle(
      { command: 'preview_test_session_reset', testSessionId: 'test_session_alpha_01' },
      'idem_preview_01'
    );

    expect(callFunction).toHaveBeenCalledWith(
      TEST_SESSION_LIFECYCLE_CALLABLE,
      { command: 'preview_test_session_reset', testSessionId: 'test_session_alpha_01' },
      { idempotencyKey: 'idem_preview_01', maxAttempts: 1 }
    );
  });

  it('calls execute_test_session_reset with manifest identity', async () => {
    callFunction.mockResolvedValue({
      command: 'execute_test_session_reset',
      outcome: 'executed',
      status: 'active',
      verifier: { ok: true, failedChecks: [] },
    });

    await executeTestSessionLifecycle(
      {
        command: 'execute_test_session_reset',
        testSessionId: 'test_session_alpha_01',
        manifestId: 'manifest_01',
        confirmation: 'RESET TEST DATA',
      },
      'idem_execute_01'
    );

    expect(callFunction).toHaveBeenCalledWith(
      TEST_SESSION_LIFECYCLE_CALLABLE,
      {
        command: 'execute_test_session_reset',
        testSessionId: 'test_session_alpha_01',
        manifestId: 'manifest_01',
        confirmation: 'RESET TEST DATA',
      },
      { idempotencyKey: 'idem_execute_01', maxAttempts: 1 }
    );
  });

  it('maps callable maintenance codes from error message', () => {
    expect(
      lifecycleErrorCode(
        new FunctionsClientError('TEST_MAINTENANCE_MANIFEST_STALE', 'functions/failed-precondition', {})
      )
    ).toBe('TEST_MAINTENANCE_MANIFEST_STALE');
    expect(lifecycleErrorCode(new Error('network'))).toBe('TEST_MAINTENANCE_FAILED');
  });
});
