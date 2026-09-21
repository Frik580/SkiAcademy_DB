import {
  TestSessionIdSchema,
  assertExactTestSessionStoragePrefix,
  testSessionStoragePrefix,
  type TestSessionId,
} from '@ski-academy/shared-domain';

export interface TestSessionStorageObjectStore {
  list(prefix: string): Promise<readonly string[]>;
  delete(objectPath: string): Promise<'deleted' | 'absent'>;
}

export interface DeleteTestSessionStorageError {
  readonly objectPath: string;
  readonly code: string;
}

export interface DeleteTestSessionStorageResult {
  readonly testSessionId: TestSessionId;
  readonly prefix: string;
  readonly listed: number;
  readonly deleted: number;
  readonly absent: number;
  readonly failed: number;
  readonly errors: readonly DeleteTestSessionStorageError[];
  readonly complete: boolean;
}

const LIST_PAGE_SIZE = 100;

export function parseTestSessionStorageCleanupId(testSessionId: string): TestSessionId {
  const parsed = TestSessionIdSchema.safeParse(testSessionId);
  if (!parsed.success) {
    throw parsed.error;
  }
  return parsed.data;
}

export async function deleteTestSessionStorageWithStore(
  testSessionId: string,
  store: TestSessionStorageObjectStore
): Promise<DeleteTestSessionStorageResult> {
  const parsedId = parseTestSessionStorageCleanupId(testSessionId);
  const prefix = testSessionStoragePrefix(parsedId);
  const listed = await store.list(prefix);
  const errors: DeleteTestSessionStorageError[] = [];
  let deleted = 0;
  let absent = 0;

  for (const objectPath of listed) {
    try {
      assertExactTestSessionStoragePrefix(parsedId, objectPath);
    } catch {
      errors.push({ objectPath, code: 'OUT_OF_PREFIX' });
      continue;
    }
    try {
      const outcome = await store.delete(objectPath);
      if (outcome === 'deleted') {
        deleted += 1;
      } else {
        absent += 1;
      }
    } catch (error) {
      errors.push({
        objectPath,
        code: error instanceof Error ? error.name || 'DELETE_FAILED' : 'DELETE_FAILED',
      });
    }
  }

  return {
    testSessionId: parsedId,
    prefix,
    listed: listed.length,
    deleted,
    absent,
    failed: errors.length,
    errors,
    complete: errors.length === 0,
  };
}

export function createFirebaseTestSessionStorageStore(testSessionId: string): TestSessionStorageObjectStore {
  const parsedId = parseTestSessionStorageCleanupId(testSessionId);
  const prefix = testSessionStoragePrefix(parsedId);
  return {
    async list(listPrefix) {
      const { getStorage } = await import('firebase-admin/storage');
      const [files] = await getStorage().bucket().getFiles({
        prefix: listPrefix,
        autoPaginate: true,
        maxResults: LIST_PAGE_SIZE * 20,
      });
      return files.map((file) => file.name).filter((name) => name.startsWith(prefix) && name !== prefix);
    },
    async delete(objectPath) {
      const { getStorage } = await import('firebase-admin/storage');
      try {
        await getStorage().bucket().file(objectPath).delete({ ignoreNotFound: true });
        return 'deleted';
      } catch (error) {
        const code =
          error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
        if (code === '404' || code === 'ENOENT') return 'absent';
        throw error;
      }
    },
  };
}

export async function deleteTestSessionStorage(
  testSessionId: string
): Promise<DeleteTestSessionStorageResult> {
  const parsedId = parseTestSessionStorageCleanupId(testSessionId);
  return deleteTestSessionStorageWithStore(parsedId, createFirebaseTestSessionStorageStore(parsedId));
}
