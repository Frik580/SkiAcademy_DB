export const CANONICAL_TRANSACTION_SIDE_EFFECT_KINDS = [
  'email',
  'notification_delivery',
  'provider_call',
  'external_http',
  'non_transactional_irreversible_effect',
] as const;

export type CanonicalTransactionSideEffectKind =
  (typeof CANONICAL_TRANSACTION_SIDE_EFFECT_KINDS)[number];

/**
 * Firestore transaction callbacks may retry. External side effects must not run
 * inside retryable transaction callbacks — they belong to later outbox handling.
 */
export class CanonicalTransactionSideEffectError extends Error {
  readonly kind: CanonicalTransactionSideEffectKind;

  constructor(kind: CanonicalTransactionSideEffectKind) {
    super(
      `External side effect "${kind}" must not run inside a retryable canonical transaction callback.`
    );
    this.name = 'CanonicalTransactionSideEffectError';
    this.kind = kind;
  }
}

let transactionCallbackDepth = 0;

export function enterCanonicalTransactionCallback(): void {
  transactionCallbackDepth += 1;
}

export function exitCanonicalTransactionCallback(): void {
  transactionCallbackDepth = Math.max(0, transactionCallbackDepth - 1);
}

export function isInsideCanonicalTransactionCallback(): boolean {
  return transactionCallbackDepth > 0;
}

export function guardCanonicalTransactionSideEffect(
  kind: CanonicalTransactionSideEffectKind
): void {
  if (isInsideCanonicalTransactionCallback()) {
    throw new CanonicalTransactionSideEffectError(kind);
  }
}
