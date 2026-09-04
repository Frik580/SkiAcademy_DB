import {
  assertTransactionWithinBudget,
  CanonicalCommandError,
  TransactionPlanBuilder,
  type CorrelationId,
} from '@ski-academy/shared-domain';
import {
  assertReadPhase,
  assertWritePhase,
  applyCanonicalDocumentUpdate,
  type CanonicalTransactionCollectionQuery,
  type CanonicalTransactionDocumentRef,
  type CanonicalTransactionOperations,
  type CanonicalTransactionOperationsInternal,
  type CanonicalTransactionPhase,
  type CanonicalTransactionQueryDocumentResult,
  type CanonicalTransactionReadResult,
} from './transactionExecution';
import {
  enterCanonicalTransactionCallback,
  exitCanonicalTransactionCallback,
} from './transactionSideEffects';
import type {
  CanonicalAtomicTransactionInput,
  CanonicalAtomicTransactionSession,
  CanonicalTransactionExecutor,
} from './firestoreTransactionExecutor';

interface InMemoryDocument {
  readonly data: Record<string, unknown>;
}

function readQueryField(data: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, data);
}

function matchesQueryFilter(
  op: CanonicalTransactionCollectionQuery['where']['op'],
  fieldValue: unknown,
  compareValue: unknown
): boolean {
  if (op === 'array-contains') {
    return Array.isArray(fieldValue) && fieldValue.some((item) => Object.is(item, compareValue));
  }
  if (op === '==') {
    return Object.is(fieldValue, compareValue);
  }
  if (typeof fieldValue !== 'number' || typeof compareValue !== 'number') {
    return false;
  }
  if (op === '<') return fieldValue < compareValue;
  if (op === '<=') return fieldValue <= compareValue;
  if (op === '>') return fieldValue > compareValue;
  return fieldValue >= compareValue;
}

function pathMatchesCollectionGroup(path: string, collection: string): boolean {
  const segments = path.split('/');
  for (let index = 0; index < segments.length - 1; index += 2) {
    if (segments[index] === collection) {
      return true;
    }
  }
  return false;
}

export interface InMemoryFirestoreSnapshot {
  readonly docs: ReadonlyMap<string, InMemoryDocument>;
  readonly writesAttempted: number;
}

class InMemoryCanonicalTransactionOperations implements CanonicalTransactionOperationsInternal {
  phase: CanonicalTransactionPhase = 'reads';
  private readonly pendingReads = new Set<Promise<unknown>>();
  private readonly pendingWrites: Array<() => void> = [];

  constructor(
    private readonly docs: Map<string, InMemoryDocument>,
    readonly writesAttempted: { count: number }
  ) {}

  async get(ref: CanonicalTransactionDocumentRef): Promise<CanonicalTransactionReadResult> {
    assertReadPhase(this, 'read');
    const readPromise = Promise.resolve().then(() => {
      const existing = this.docs.get(ref.path);
      if (!existing) {
        return { exists: false as const };
      }
      return { exists: true as const, data: { ...existing.data } };
    });
    this.pendingReads.add(readPromise);
    try {
      return await readPromise;
    } finally {
      this.pendingReads.delete(readPromise);
    }
  }

  async query(
    input: CanonicalTransactionCollectionQuery
  ): Promise<readonly CanonicalTransactionQueryDocumentResult[]> {
    assertReadPhase(this, 'read');
    const readPromise = Promise.resolve().then(() => {
      const results: CanonicalTransactionQueryDocumentResult[] = [];
      for (const [path, document] of this.docs.entries()) {
        const matchesCollection = input.collectionGroup
          ? pathMatchesCollectionGroup(path, input.collection)
          : path.startsWith(`${input.collection}/`);
        if (!matchesCollection) continue;
        const fieldValue: unknown = readQueryField(document.data, input.where.field);
        const compareValue: unknown = input.where.value;
        const matchesFilter = matchesQueryFilter(input.where.op, fieldValue, compareValue);
        if (!matchesFilter) continue;
        results.push({
          path,
          exists: true,
          data: { ...document.data },
        });
        if (input.limit !== undefined && results.length >= input.limit) {
          break;
        }
      }
      return results;
    });
    this.pendingReads.add(readPromise);
    try {
      return await readPromise;
    } finally {
      this.pendingReads.delete(readPromise);
    }
  }

  async awaitPendingReads(): Promise<void> {
    while (this.pendingReads.size > 0) {
      await Promise.all([...this.pendingReads]);
    }
  }

  enterWritePhase(): void {
    assertReadPhase(this, 'transition');
    this.phase = 'writes';
  }

  create(ref: CanonicalTransactionDocumentRef, data: Record<string, unknown>): void {
    assertWritePhase(this, 'create');
    this.pendingWrites.push(() => {
      if (this.docs.has(ref.path)) {
        throw new Error(`Document already exists: ${ref.path}`);
      }
      this.docs.set(ref.path, { data: { ...data } });
      this.writesAttempted.count += 1;
    });
  }

  update(ref: CanonicalTransactionDocumentRef, data: Record<string, unknown>): void {
    assertWritePhase(this, 'update');
    this.pendingWrites.push(() => {
      const existing = this.docs.get(ref.path);
      if (!existing) {
        throw new Error(`Document does not exist: ${ref.path}`);
      }
      this.docs.set(ref.path, { data: applyCanonicalDocumentUpdate(existing.data, data) });
      this.writesAttempted.count += 1;
    });
  }

  delete(ref: CanonicalTransactionDocumentRef): void {
    assertWritePhase(this, 'delete');
    this.pendingWrites.push(() => {
      this.docs.delete(ref.path);
      this.writesAttempted.count += 1;
    });
  }

  commitPendingWrites(): void {
    for (const write of this.pendingWrites) {
      write();
    }
    this.pendingWrites.length = 0;
  }

  rollbackPendingWrites(): void {
    this.pendingWrites.length = 0;
  }
}

class InMemoryCanonicalTransactionSession implements CanonicalAtomicTransactionSession {
  readonly plan = new TransactionPlanBuilder();

  constructor(
    readonly correlationId: CorrelationId,
    readonly tx: CanonicalTransactionOperations,
    private readonly phaseControl: CanonicalTransactionOperationsInternal
  ) {}

  assertWithinBudget(): void {
    assertTransactionWithinBudget(this.correlationId, this.plan.build());
  }

  async transitionToWrites(): Promise<void> {
    await this.phaseControl.awaitPendingReads();
    this.assertWithinBudget();
    this.phaseControl.enterWritePhase();
  }
}

export interface InMemoryCanonicalTransactionExecutorOptions {
  readonly simulateRetry?: boolean;
}

export function createInMemoryCanonicalTransactionExecutor(
  initialDocs: Record<string, Record<string, unknown>> = {},
  options: InMemoryCanonicalTransactionExecutorOptions = {}
): CanonicalTransactionExecutor & {
  snapshot(): InMemoryFirestoreSnapshot;
} {
  const docs = new Map<string, InMemoryDocument>(
    Object.entries(initialDocs).map(([path, data]) => [path, { data: { ...data } }])
  );
  const writesAttempted = { count: 0 };

  return {
    snapshot(): InMemoryFirestoreSnapshot {
      return {
        docs: new Map(docs),
        writesAttempted: writesAttempted.count,
      };
    },

    async runAtomic<TResult>(input: CanonicalAtomicTransactionInput<TResult>): Promise<TResult> {
      if (input.staticPlan !== undefined) {
        assertTransactionWithinBudget(input.correlationId, input.staticPlan);
      }

      const attempt = async (): Promise<TResult> => {
        enterCanonicalTransactionCallback();
        const operations = new InMemoryCanonicalTransactionOperations(docs, writesAttempted);
        const session = new InMemoryCanonicalTransactionSession(
          input.correlationId,
          operations,
          operations
        );
        try {
          const result = await input.run(session);
          operations.commitPendingWrites();
          return result;
        } catch (error) {
          operations.rollbackPendingWrites();
          if (error instanceof CanonicalCommandError) {
            throw error;
          }
          throw error;
        } finally {
          exitCanonicalTransactionCallback();
        }
      };

      if (options.simulateRetry) {
        try {
          return await attempt();
        } catch (error) {
          if (error instanceof CanonicalCommandError && error.code === 'operation_too_large') {
            throw error;
          }
          return attempt();
        }
      }

      return attempt();
    },
  };
}
