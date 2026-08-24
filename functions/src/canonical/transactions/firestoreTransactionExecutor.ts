import { FieldValue, type Firestore, type Transaction } from 'firebase-admin/firestore';
import {
  assertTransactionWithinBudget,
  CanonicalCommandError,
  TransactionPlanBuilder,
  type CorrelationId,
  type TransactionPlan,
} from '@ski-academy/shared-domain';
import {
  assertReadPhase,
  assertWritePhase,
  isCanonicalFieldDelete,
  type CanonicalTransactionDocumentRef,
  type CanonicalTransactionOperations,
  type CanonicalTransactionOperationsInternal,
  type CanonicalTransactionPhase,
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
    const readPromise = this.transaction
      .get(this.firestore.doc(ref.path))
      .then((snapshot) => ({
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

export function createFirestoreCanonicalTransactionExecutor(
  firestore: Firestore
): CanonicalTransactionExecutor {
  return {
    async runAtomic<TResult>(input: CanonicalAtomicTransactionInput<TResult>): Promise<TResult> {
      preflightStaticPlan(input.correlationId, input.staticPlan);

      return firestore.runTransaction(async (transaction) => {
        enterCanonicalTransactionCallback();
        try {
          const operations = new FirestoreCanonicalTransactionOperations(firestore, transaction);
          const session = new FirestoreCanonicalTransactionSession(
            input.correlationId,
            operations,
            operations
          );
          return await input.run(session);
        } catch (error) {
          if (error instanceof CanonicalCommandError) {
            throw error;
          }
          throw error;
        } finally {
          exitCanonicalTransactionCallback();
        }
      });
    },
  };
}
