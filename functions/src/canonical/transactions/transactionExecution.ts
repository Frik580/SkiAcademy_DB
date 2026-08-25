export const CANONICAL_TRANSACTION_PHASES = ['reads', 'writes'] as const;

export type CanonicalTransactionPhase = (typeof CANONICAL_TRANSACTION_PHASES)[number];

export interface CanonicalTransactionDocumentRef {
  readonly path: string;
}

export interface CanonicalTransactionReadResult {
  readonly exists: boolean;
  readonly data?: Record<string, unknown>;
}

export interface CanonicalTransactionQueryFilter {
  readonly field: string;
  readonly op: '==' | '<' | '<=' | '>' | '>=';
  readonly value: unknown;
}

export interface CanonicalTransactionCollectionQuery {
  readonly collection: string;
  readonly where: CanonicalTransactionQueryFilter;
}

export interface CanonicalTransactionQueryDocumentResult extends CanonicalTransactionReadResult {
  readonly path: string;
}

export interface CanonicalTransactionOperations {
  readonly phase: CanonicalTransactionPhase;
  get(ref: CanonicalTransactionDocumentRef): Promise<CanonicalTransactionReadResult>;
  query(
    input: CanonicalTransactionCollectionQuery
  ): Promise<readonly CanonicalTransactionQueryDocumentResult[]>;
  create(ref: CanonicalTransactionDocumentRef, data: Record<string, unknown>): void;
  update(ref: CanonicalTransactionDocumentRef, data: Record<string, unknown>): void;
  delete(ref: CanonicalTransactionDocumentRef): void;
}

export interface CanonicalTransactionPhaseControl {
  awaitPendingReads(): Promise<void>;
  enterWritePhase(): void;
}

export type CanonicalTransactionOperationsInternal = CanonicalTransactionOperations &
  CanonicalTransactionPhaseControl;

export class CanonicalTransactionPhaseError extends Error {
  readonly attemptedOperation: 'read' | 'create' | 'update' | 'delete' | 'transition';
  readonly currentPhase: CanonicalTransactionPhase;

  constructor(
    attemptedOperation: CanonicalTransactionPhaseError['attemptedOperation'],
    currentPhase: CanonicalTransactionPhase
  ) {
    super(
      `Canonical transaction ${attemptedOperation} is not allowed during the ${currentPhase} phase.`
    );
    this.name = 'CanonicalTransactionPhaseError';
    this.attemptedOperation = attemptedOperation;
    this.currentPhase = currentPhase;
  }
}

export function assertReadPhase(
  operations: CanonicalTransactionOperations,
  attemptedOperation: CanonicalTransactionPhaseError['attemptedOperation']
): void {
  if (operations.phase !== 'reads') {
    throw new CanonicalTransactionPhaseError(attemptedOperation, operations.phase);
  }
}

export function assertWritePhase(
  operations: CanonicalTransactionOperations,
  attemptedOperation: CanonicalTransactionPhaseError['attemptedOperation']
): void {
  if (operations.phase !== 'writes') {
    throw new CanonicalTransactionPhaseError(attemptedOperation, operations.phase);
  }
}

export const CANONICAL_FIELD_DELETE = Symbol('CANONICAL_FIELD_DELETE');

export function isCanonicalFieldDelete(value: unknown): value is typeof CANONICAL_FIELD_DELETE {
  return value === CANONICAL_FIELD_DELETE;
}

export function applyCanonicalDocumentUpdate(
  existing: Record<string, unknown>,
  update: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(update)) {
    if (isCanonicalFieldDelete(value)) {
      delete merged[key];
      continue;
    }
    merged[key] = value;
  }
  return merged;
}
