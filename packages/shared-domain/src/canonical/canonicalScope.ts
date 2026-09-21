import { z } from 'zod';
import { TestSessionIdSchema, type TestSessionId } from './identifiers';

export const DATA_SCOPES = ['live', 'test'] as const;
export const DataScopeSchema = z.enum(DATA_SCOPES);
export type DataScope = z.output<typeof DataScopeSchema>;

export const CanonicalExecutionScopeSchema = z.discriminatedUnion('dataScope', [
  z.object({ dataScope: z.literal('live') }).strict(),
  z
    .object({
      dataScope: z.literal('test'),
      testSessionId: TestSessionIdSchema,
    })
    .strict(),
]);

export type CanonicalExecutionScope = Readonly<z.output<typeof CanonicalExecutionScopeSchema>>;

export const PersistedCanonicalScopeFieldsSchema = z
  .object({
    dataScope: DataScopeSchema.optional(),
    testSessionId: TestSessionIdSchema.optional(),
  })
  .passthrough();

export type PersistedCanonicalScopeFields = Readonly<
  z.output<typeof PersistedCanonicalScopeFieldsSchema>
>;

export type PersistedCanonicalScopeErrorCode =
  'MALFORMED_PERSISTED_SCOPE' | 'CROSS_SCOPE_FORBIDDEN';

export class PersistedCanonicalScopeError extends Error {
  constructor(readonly code: PersistedCanonicalScopeErrorCode) {
    super(code);
    this.name = 'PersistedCanonicalScopeError';
  }
}

export const LIVE_CANONICAL_EXECUTION_SCOPE: CanonicalExecutionScope = Object.freeze({
  dataScope: 'live',
});

export function testCanonicalExecutionScope(testSessionId: TestSessionId): CanonicalExecutionScope {
  return Object.freeze({ dataScope: 'test', testSessionId });
}

export function canonicalScopeFields(
  scope: CanonicalExecutionScope
): Readonly<{ dataScope: 'live' } | { dataScope: 'test'; testSessionId: TestSessionId }> {
  return scope.dataScope === 'live'
    ? { dataScope: 'live' }
    : { dataScope: 'test', testSessionId: scope.testSessionId };
}

export function canonicalScopeKeyParts(scope: CanonicalExecutionScope): readonly string[] {
  return scope.dataScope === 'live' ? ['live'] : ['test', scope.testSessionId];
}

/**
 * T42B compatibility window: a missing persisted scope is legacy LIVE only.
 * Remove the fallback after the T42B-8 backfill and strict-contract gate.
 */
export function parsePersistedCanonicalScope(
  input: unknown,
  options: Readonly<{ allowLegacyLive?: boolean }> = {}
): CanonicalExecutionScope {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PersistedCanonicalScopeError('MALFORMED_PERSISTED_SCOPE');
  }

  const record = input as Record<string, unknown>;
  const dataScope = record.dataScope;
  const testSessionId = record.testSessionId;

  if (dataScope === undefined) {
    if (testSessionId !== undefined || options.allowLegacyLive === false) {
      throw new PersistedCanonicalScopeError('MALFORMED_PERSISTED_SCOPE');
    }
    return LIVE_CANONICAL_EXECUTION_SCOPE;
  }

  if (dataScope === 'live') {
    if (testSessionId !== undefined) {
      throw new PersistedCanonicalScopeError('MALFORMED_PERSISTED_SCOPE');
    }
    return LIVE_CANONICAL_EXECUTION_SCOPE;
  }

  if (dataScope === 'test') {
    const parsedSessionId = TestSessionIdSchema.safeParse(testSessionId);
    if (!parsedSessionId.success) {
      throw new PersistedCanonicalScopeError('MALFORMED_PERSISTED_SCOPE');
    }
    return testCanonicalExecutionScope(parsedSessionId.data);
  }

  throw new PersistedCanonicalScopeError('MALFORMED_PERSISTED_SCOPE');
}

export function assertSameCanonicalScope(
  expected: CanonicalExecutionScope,
  persisted: unknown
): CanonicalExecutionScope {
  const actual = parsePersistedCanonicalScope(persisted, { allowLegacyLive: true });
  if (
    actual.dataScope !== expected.dataScope ||
    (actual.dataScope === 'test' &&
      expected.dataScope === 'test' &&
      actual.testSessionId !== expected.testSessionId)
  ) {
    throw new PersistedCanonicalScopeError('CROSS_SCOPE_FORBIDDEN');
  }
  return actual;
}
