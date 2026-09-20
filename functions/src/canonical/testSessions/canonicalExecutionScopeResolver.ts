import type { Firestore } from 'firebase-admin/firestore';
import {
  TestActorAssignmentSchema,
  TestActorSchema,
  TestSessionIdSchema,
  TestSessionSchema,
  assertTestSessionAcceptsCommands,
  canonicalPaths,
  normalizeFirestoreDocument,
  testCanonicalExecutionScope,
  LIVE_CANONICAL_EXECUTION_SCOPE,
  type AccountId,
  type CanonicalDocumentPath,
  type CanonicalExecutionScope,
  type TestSessionId,
} from '@ski-academy/shared-domain';

export const CANONICAL_EXECUTION_SCOPE_ERROR_CODES = [
  'TEST_SESSION_ID_INVALID',
  'TEST_SESSION_FORBIDDEN',
  'TEST_SESSION_NOT_FOUND',
  'TEST_SESSION_RECORD_INVALID',
  'TEST_ACTOR_RECORD_INVALID',
  'TEST_ACTOR_DISABLED',
  'TEST_ACTOR_REQUEST_FORBIDDEN',
  'TEST_ACTOR_NO_SESSION',
  'TEST_ACTOR_ASSIGNMENT_INVALID',
  'TEST_ACTOR_ACCOUNT_INACTIVE',
] as const;

export type CanonicalExecutionScopeErrorCode =
  (typeof CANONICAL_EXECUTION_SCOPE_ERROR_CODES)[number];

export class CanonicalExecutionScopeError extends Error {
  constructor(readonly code: CanonicalExecutionScopeErrorCode) {
    super(code);
    this.name = 'CanonicalExecutionScopeError';
  }
}

export interface CanonicalExecutionScopeStore {
  readTestActor(accountId: AccountId): Promise<Record<string, unknown> | undefined>;
  readTestActorAssignment(accountId: AccountId): Promise<Record<string, unknown> | undefined>;
  readTestSession(testSessionId: TestSessionId): Promise<Record<string, unknown> | undefined>;
}

function toFirestorePath(path: CanonicalDocumentPath): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

async function readCanonicalDocument(
  firestore: Firestore,
  path: CanonicalDocumentPath
): Promise<Record<string, unknown> | undefined> {
  const snapshot = await firestore.doc(toFirestorePath(path)).get();
  if (!snapshot.exists) return undefined;
  return normalizeFirestoreDocument(snapshot.data() as Record<string, unknown> | undefined);
}

export function createFirestoreCanonicalExecutionScopeStore(
  firestore: Firestore
): CanonicalExecutionScopeStore {
  return {
    readTestActor(accountId) {
      return readCanonicalDocument(firestore, canonicalPaths.testActor(accountId));
    },
    readTestActorAssignment(accountId) {
      return readCanonicalDocument(firestore, canonicalPaths.testActorAssignment(accountId));
    },
    readTestSession(testSessionId) {
      return readCanonicalDocument(firestore, canonicalPaths.testSession(testSessionId));
    },
  };
}

export interface ResolveCanonicalExecutionScopeInput {
  readonly accountId: AccountId;
  readonly accountLifecycleStatus?: 'active' | 'disabled';
  readonly isAdministrator: boolean;
  readonly requestedTestSessionId?: unknown;
}

function parseRequestedTestSessionId(value: unknown): TestSessionId | undefined {
  if (value === undefined) return undefined;
  const parsed = TestSessionIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new CanonicalExecutionScopeError('TEST_SESSION_ID_INVALID');
  }
  return parsed.data;
}

async function resolveActiveTestSession(
  store: CanonicalExecutionScopeStore,
  testSessionId: TestSessionId
): Promise<CanonicalExecutionScope> {
  const rawSession = await store.readTestSession(testSessionId);
  if (!rawSession) {
    throw new CanonicalExecutionScopeError('TEST_SESSION_NOT_FOUND');
  }
  const parsedSession = TestSessionSchema.safeParse(rawSession);
  if (!parsedSession.success || parsedSession.data.testSessionId !== testSessionId) {
    throw new CanonicalExecutionScopeError('TEST_SESSION_RECORD_INVALID');
  }
  assertTestSessionAcceptsCommands(parsedSession.data);
  return testCanonicalExecutionScope(testSessionId);
}

export async function resolveCanonicalExecutionScope(
  store: CanonicalExecutionScopeStore,
  input: ResolveCanonicalExecutionScopeInput
): Promise<CanonicalExecutionScope> {
  const requestedTestSessionId = parseRequestedTestSessionId(input.requestedTestSessionId);
  const rawActor = await store.readTestActor(input.accountId);

  if (rawActor) {
    const parsedActor = TestActorSchema.safeParse(rawActor);
    if (!parsedActor.success || parsedActor.data.accountId !== input.accountId) {
      throw new CanonicalExecutionScopeError('TEST_ACTOR_RECORD_INVALID');
    }
    if (!parsedActor.data.allowed) {
      throw new CanonicalExecutionScopeError('TEST_ACTOR_DISABLED');
    }
    if (input.accountLifecycleStatus !== 'active') {
      throw new CanonicalExecutionScopeError('TEST_ACTOR_ACCOUNT_INACTIVE');
    }
    if (requestedTestSessionId !== undefined) {
      throw new CanonicalExecutionScopeError('TEST_ACTOR_REQUEST_FORBIDDEN');
    }

    const rawAssignment = await store.readTestActorAssignment(input.accountId);
    if (!rawAssignment) {
      throw new CanonicalExecutionScopeError('TEST_ACTOR_NO_SESSION');
    }
    const parsedAssignment = TestActorAssignmentSchema.safeParse(rawAssignment);
    if (!parsedAssignment.success || parsedAssignment.data.accountId !== input.accountId) {
      throw new CanonicalExecutionScopeError('TEST_ACTOR_ASSIGNMENT_INVALID');
    }
    if (parsedAssignment.data.activeTestSessionId === null) {
      throw new CanonicalExecutionScopeError('TEST_ACTOR_NO_SESSION');
    }
    return resolveActiveTestSession(store, parsedAssignment.data.activeTestSessionId);
  }

  if (requestedTestSessionId === undefined) {
    return LIVE_CANONICAL_EXECUTION_SCOPE;
  }
  if (!input.isAdministrator || input.accountLifecycleStatus !== 'active') {
    throw new CanonicalExecutionScopeError('TEST_SESSION_FORBIDDEN');
  }
  return resolveActiveTestSession(store, requestedTestSessionId);
}
