import {
  TestSessionIdSchema,
  TestSessionSchema,
  assertTestSessionAcceptsMaintenanceReads,
  canonicalReadScopeFromExecution,
  LIVE_CANONICAL_READ_SCOPE,
  testCanonicalReadScope,
  type AccountId,
  type CanonicalReadScope,
  type TestSessionId,
} from '@ski-academy/shared-domain';
import {
  CanonicalExecutionScopeError,
  resolveCanonicalExecutionScope,
  type CanonicalExecutionScopeStore,
} from './canonicalExecutionScopeResolver';

export type CanonicalReadScopePurposeKind = 'product' | 'maintenance';

export interface ResolveCanonicalReadScopeInput {
  readonly accountId?: AccountId;
  readonly accountLifecycleStatus?: 'active' | 'disabled';
  readonly isAdministrator: boolean;
  readonly requestedTestSessionId?: unknown;
  readonly purpose?: CanonicalReadScopePurposeKind;
}

function parseRequestedTestSessionId(value: unknown): TestSessionId | undefined {
  if (value === undefined) return undefined;
  const parsed = TestSessionIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new CanonicalExecutionScopeError('TEST_SESSION_ID_INVALID');
  }
  return parsed.data;
}

async function resolveMaintenanceTestSession(
  store: CanonicalExecutionScopeStore,
  input: ResolveCanonicalReadScopeInput,
  testSessionId: TestSessionId
): Promise<CanonicalReadScope> {
  if (!input.accountId) {
    throw new CanonicalExecutionScopeError('TEST_SESSION_FORBIDDEN');
  }
  if (!input.isAdministrator || input.accountLifecycleStatus !== 'active') {
    throw new CanonicalExecutionScopeError('TEST_SESSION_FORBIDDEN');
  }

  const rawActor = await store.readTestActor(input.accountId);
  if (rawActor) {
    throw new CanonicalExecutionScopeError('TEST_ACTOR_REQUEST_FORBIDDEN');
  }

  const rawSession = await store.readTestSession(testSessionId);
  if (!rawSession) {
    throw new CanonicalExecutionScopeError('TEST_SESSION_NOT_FOUND');
  }
  const parsedSession = TestSessionSchema.safeParse(rawSession);
  if (!parsedSession.success || parsedSession.data.testSessionId !== testSessionId) {
    throw new CanonicalExecutionScopeError('TEST_SESSION_RECORD_INVALID');
  }
  assertTestSessionAcceptsMaintenanceReads(parsedSession.data);
  return testCanonicalReadScope(testSessionId, 'maintenance_test');
}

/**
 * Server-authoritative read scope. Same actor/session authority as commands.
 * Clients cannot pass `dataScope` or an arbitrary `testSessionId` as authority.
 */
export async function resolveCanonicalReadScope(
  store: CanonicalExecutionScopeStore,
  input: ResolveCanonicalReadScopeInput
): Promise<CanonicalReadScope> {
  const purpose = input.purpose ?? 'product';
  const requestedTestSessionId = parseRequestedTestSessionId(input.requestedTestSessionId);

  if (!input.accountId) {
    if (requestedTestSessionId !== undefined) {
      throw new CanonicalExecutionScopeError('TEST_SESSION_FORBIDDEN');
    }
    return LIVE_CANONICAL_READ_SCOPE;
  }

  if (purpose === 'maintenance') {
    if (requestedTestSessionId === undefined) {
      throw new CanonicalExecutionScopeError('TEST_SESSION_FORBIDDEN');
    }
    return resolveMaintenanceTestSession(store, input, requestedTestSessionId);
  }

  const executionScope = await resolveCanonicalExecutionScope(store, {
    accountId: input.accountId,
    accountLifecycleStatus: input.accountLifecycleStatus,
    isAdministrator: input.isAdministrator,
    requestedTestSessionId: input.requestedTestSessionId,
  });
  return canonicalReadScopeFromExecution(executionScope);
}

export function peelRequestedTestSessionId(data: unknown): {
  readonly rest: unknown;
  readonly requestedTestSessionId?: unknown;
} {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { rest: data };
  }
  if (!('requestedTestSessionId' in data)) {
    return { rest: data };
  }
  const { requestedTestSessionId, ...rest } = data as Record<string, unknown>;
  return {
    rest,
    ...(requestedTestSessionId === undefined ? {} : { requestedTestSessionId }),
  };
}
