import {
  CanonicalCommandError,
  PersistedCanonicalScopeError,
  assertSameCanonicalScope,
  type CanonicalExecutionScope,
  type CorrelationId,
} from '@ski-academy/shared-domain';

export function crossScopeCommandError(
  correlationId: CorrelationId,
  reason: 'malformed' | 'conflict' | 'unsupported' = 'conflict'
): CanonicalCommandError {
  return new CanonicalCommandError('cross_scope_forbidden', {
    correlationId,
    details: { reason },
  });
}

export function assertSameScopeOrThrow(
  correlationId: CorrelationId,
  expected: CanonicalExecutionScope,
  persisted: unknown
): CanonicalExecutionScope {
  try {
    return assertSameCanonicalScope(expected, persisted);
  } catch (error) {
    if (error instanceof PersistedCanonicalScopeError) {
      throw crossScopeCommandError(
        correlationId,
        error.code === 'MALFORMED_PERSISTED_SCOPE' ? 'malformed' : 'conflict'
      );
    }
    throw error;
  }
}

/**
 * Command actor identity may remain LIVE while operating a Test context.
 * Mutable payer/subject identities must still match execution scope
 * (TEST same-session, or LIVE / legacy missing-scope LIVE compatibility).
 */
export function assertTestMutableSubjectScope(input: {
  readonly correlationId: CorrelationId;
  readonly scope?: CanonicalExecutionScope;
  readonly persisted: unknown;
}): void {
  if (!input.scope) {
    return;
  }
  assertSameScopeOrThrow(input.correlationId, input.scope, input.persisted);
}
