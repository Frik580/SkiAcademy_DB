import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { CanonicalCommandError, CorrelationIdSchema } from '@ski-academy/shared-domain';
import { error as logError } from 'firebase-functions/logger';
import { createExecuteCanonicalCommandHandler } from './executeCanonicalCommandCallable';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('firebase-functions/logger', () => ({ error: vi.fn() }));
vi.mock('./canonicalCommandRuntime', () => ({
  createCanonicalCommandRuntime: () => ({ createCommands: () => ({ execute }) }),
  readGuestActionTokenSecret: () => undefined,
}));
vi.mock('../testSessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../testSessions')>()),
  createFirestoreCanonicalExecutionScopeStore: vi.fn(),
  resolveCanonicalExecutionScope: async () => ({ dataScope: 'live' }),
}));

describe('canonical callable unexpected exception diagnostics', () => {
  beforeEach(() => vi.clearAllMocks());

  const correlationId = CorrelationIdSchema.parse('correlation_safe_exception_01');
  function invoke() {
    const firestore = {
      collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({}) }) }) }),
    } as unknown as Firestore;
    const handler = createExecuteCanonicalCommandHandler(firestore);
    return handler({
      auth: { uid: 'account_safe_exception' },
      data: { kind: 'block_participant', correlationId, idempotencyKey: 'block-safe', intent: {} },
    } as unknown as Parameters<typeof handler>[0]);
  }

  it('logs only correlation, command type and safe diagnostics; keeps the client error generic', async () => {
    const error = Object.assign(new TypeError('private participant name and secret'), { code: 9 });
    error.stack =
      'TypeError: private participant name and secret\n at read (/workspace/lib/canonical/participantAccess/participantAccessCommands.js:1148:47)';
    execute.mockRejectedValue(error);
    await expect(invoke()).rejects.toMatchObject({
      code: 'internal',
      message: 'The operation could not be completed.',
      details: { correlationId, code: 'internal', retryable: true },
    });
    expect(logError).toHaveBeenCalledExactlyOnceWith('Unexpected canonical command exception', {
      correlationId,
      commandKind: 'block_participant',
      errorType: 'TypeError',
      grpcCode: 9,
      sourceLocations: ['lib/canonical/participantAccess/participantAccessCommands.js:1148:47'],
    });
  });

  it('does not log expected authorization failures as unexpected exceptions', async () => {
    execute.mockRejectedValue(new CanonicalCommandError('forbidden', { correlationId }));
    await expect(invoke()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(logError).not.toHaveBeenCalled();
  });
});
