import {
  TestActorSchema,
  TestSessionSchema,
  canonicalPaths,
  normalizeFirestoreDocument,
  type AccountId,
  type TestActor,
  type TestSession,
  type TestSessionId,
} from '@ski-academy/shared-domain';

export function toTransactionPath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function testSessionPath(testSessionId: TestSessionId): string {
  return toTransactionPath(canonicalPaths.testSession(testSessionId));
}

export function testActorPath(accountId: AccountId): string {
  return toTransactionPath(canonicalPaths.testActor(accountId));
}

export function parseTestSession(data: Record<string, unknown> | undefined): TestSession | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = TestSessionSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}

export function parseTestActor(data: Record<string, unknown> | undefined): TestActor | undefined {
  const normalized = normalizeFirestoreDocument(data);
  if (!normalized) return undefined;
  const parsed = TestActorSchema.safeParse(normalized);
  return parsed.success ? parsed.data : undefined;
}
