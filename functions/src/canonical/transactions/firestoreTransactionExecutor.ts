import { FieldValue, type Firestore, type Query, type Transaction } from 'firebase-admin/firestore';
import {
  assertTransactionWithinBudget,
  CanonicalCommandError,
  TransactionPlanBuilder,
  type CorrelationId,
  type CanonicalExecutionScope,
  type TransactionPlan,
} from '@ski-academy/shared-domain';
import {
  assertReadPhase,
  assertWritePhase,
  canonicalTransactionQueryFilters,
  isCanonicalFieldDelete,
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

export interface CanonicalAtomicTransactionInput<TResult> {
  readonly correlationId: CorrelationId;
  readonly staticPlan?: TransactionPlan;
  readonly run: (session: CanonicalAtomicTransactionSession) => Promise<TResult>;
}

export interface CanonicalAtomicTransactionSession {
  readonly correlationId: CorrelationId;
  readonly scope?: CanonicalExecutionScope;
  readonly plan: TransactionPlanBuilder;
  readonly tx: CanonicalTransactionOperations;
  assertWithinBudget(): void;
  transitionToWrites(): Promise<void>;
}

export interface CanonicalTransactionExecutor {
  runAtomic<TResult>(input: CanonicalAtomicTransactionInput<TResult>): Promise<TResult>;
}

class FirestoreCanonicalTransactionOperations implements CanonicalTransactionOperationsInternal {
  phase: CanonicalTransactionPhase = 'reads';
  private readonly pendingReads = new Set<Promise<unknown>>();

  constructor(
    private readonly firestore: Firestore,
    private readonly transaction: Transaction
  ) {}

  async get(ref: CanonicalTransactionDocumentRef): Promise<CanonicalTransactionReadResult> {
    assertReadPhase(this, 'read');
    const readPromise = this.transaction.get(this.firestore.doc(ref.path)).then((snapshot) => ({
      exists: snapshot.exists,
      ...(snapshot.exists ? { data: snapshot.data() as Record<string, unknown> } : {}),
    }));
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
    let collectionQuery: Query = input.collectionGroup
      ? this.firestore.collectionGroup(input.collection)
      : this.firestore.collection(input.collection);
    for (const filter of canonicalTransactionQueryFilters(input)) {
      collectionQuery = collectionQuery.where(filter.field, filter.op, filter.value);
    }
    if (input.limit !== undefined) {
      collectionQuery = collectionQuery.limit(input.limit);
    }
    const readPromise = this.transaction.get(collectionQuery).then((snapshot) =>
      snapshot.docs.map((doc) => ({
        path: doc.ref.path,
        exists: true as const,
        data: doc.data() as Record<string, unknown>,
      }))
    );
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

  async drainPendingReads(): Promise<void> {
    while (this.pendingReads.size > 0) {
      await Promise.allSettled([...this.pendingReads]);
    }
  }

  enterWritePhase(): void {
    assertReadPhase(this, 'transition');
    this.phase = 'writes';
  }

  create(ref: CanonicalTransactionDocumentRef, data: Record<string, unknown>): void {
    assertWritePhase(this, 'create');
    this.transaction.create(this.firestore.doc(ref.path), data);
  }

  update(ref: CanonicalTransactionDocumentRef, data: Record<string, unknown>): void {
    assertWritePhase(this, 'update');
    const payload = Object.fromEntries(
      Object.entries(data).map(([key, value]) =>
        isCanonicalFieldDelete(value) ? [key, FieldValue.delete()] : [key, value]
      )
    );
    this.transaction.update(this.firestore.doc(ref.path), payload);
  }

  delete(ref: CanonicalTransactionDocumentRef): void {
    assertWritePhase(this, 'delete');
    this.transaction.delete(this.firestore.doc(ref.path));
  }
}

class FirestoreCanonicalTransactionSession implements CanonicalAtomicTransactionSession {
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

function preflightStaticPlan(
  correlationId: CorrelationId,
  plan: TransactionPlan | undefined
): void {
  if (plan === undefined) {
    return;
  }
  assertTransactionWithinBudget(correlationId, plan);
}

/**
 * The Admin SDK retries INVALID_ARGUMENT only when the message matches
 * `/transaction has expired/`. The Firestore emulator instead returns
 * `Transaction is invalid or closed` for the same expired/aborted ID, and
 * that error is not retried — concurrent commands then reject instead of
 * serializing. Retry the whole `runTransaction` with a fresh Transaction.
 */
export const CLOSED_FIRESTORE_TRANSACTION_RETRY_ATTEMPTS = 5;

export function isRetryableClosedFirestoreTransactionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const code = 'code' in error ? (error as { code?: unknown }).code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const isInvalidArgument =
    code === 3 || code === 'invalid-argument' || code === 'INVALID_ARGUMENT';
  return isInvalidArgument && /transaction is invalid or closed/i.test(message);
}

export function createFirestoreCanonicalTransactionExecutor(
  firestore: Firestore
): CanonicalTransactionExecutor {
  return {
    async runAtomic<TResult>(input: CanonicalAtomicTransactionInput<TResult>): Promise<TResult> {
      preflightStaticPlan(input.correlationId, input.staticPlan);

      let lastError: unknown;
      for (let attempt = 0; attempt < CLOSED_FIRESTORE_TRANSACTION_RETRY_ATTEMPTS; attempt += 1) {
        try {
          return await firestore.runTransaction(async (transaction) => {
            enterCanonicalTransactionCallback();
            const operations = new FirestoreCanonicalTransactionOperations(firestore, transaction);
            const session = new FirestoreCanonicalTransactionSession(
              input.correlationId,
              operations,
              operations
            );
            try {
              return await input.run(session);
            } finally {
              try {
                await operations.drainPendingReads();
              } catch {
                // Keep the original callback outcome. In-flight reads must
                // finish before this callback settles so Firestore does not
                // commit/rollback while RPCs still use the transaction.
              }
              exitCanonicalTransactionCallback();
            }
          });
        } catch (error) {
          lastError = error;
          if (
            error instanceof CanonicalCommandError ||
            !isRetryableClosedFirestoreTransactionError(error) ||
            attempt === CLOSED_FIRESTORE_TRANSACTION_RETRY_ATTEMPTS - 1
          ) {
            throw error;
          }
        }
      }
      throw lastError;
    },
  };
}
