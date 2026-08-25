import {
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  type CommandEnvelope,
  type CommandKind,
} from '@ski-academy/shared-domain';

export function assertAdministratorFinanceAccess(
  envelope: CommandEnvelope<
    | 'record_manual_wallet_funding'
    | 'record_provider_payment_event'
    | 'adjust_service_price'
    | 'record_financial_correction'
    | 'record_audit_correction'
  >
): void {
  if (!administratorCapabilityExercisedByAccount(envelope.context)) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

export function assertProviderCallbackFinanceAccess(
  envelope: CommandEnvelope<'record_provider_payment_event'>
): void {
  if (
    envelope.context.actor.kind !== 'provider' ||
    envelope.context.exercisedCapability !== 'provider_callback' ||
    envelope.context.source !== 'provider_callback'
  ) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

export function assertFinanceAuthorization(
  envelope: CommandEnvelope<
    | 'record_manual_wallet_funding'
    | 'record_provider_payment_event'
    | 'adjust_service_price'
    | 'record_financial_correction'
    | 'record_audit_correction'
  >
): void {
  if (
    envelope.kind === 'record_provider_payment_event' &&
    envelope.context.source === 'provider_callback' &&
    envelope.context.actor.kind === 'provider'
  ) {
    assertProviderCallbackFinanceAccess(
      envelope as CommandEnvelope<'record_provider_payment_event'>
    );
    return;
  }
  assertAdministratorFinanceAccess(envelope);
}

export function assertFinancialCorrectionAuthorization(
  envelope: CommandEnvelope<'record_financial_correction' | 'record_audit_correction'>
): void {
  if (envelope.kind === 'record_financial_correction') {
    assertAdministratorFinanceAccess(envelope);
    return;
  }

  const auditEnvelope = envelope as CommandEnvelope<'record_audit_correction'>;
  if (
    auditEnvelope.intent.operation === 'reconcile_payment' ||
    auditEnvelope.intent.operation === 'reconcile_wallet'
  ) {
    assertReconciliationAuthorization(auditEnvelope);
    return;
  }

  assertAdministratorFinanceAccess(auditEnvelope);
}

export function assertReconciliationAuthorization(
  envelope: CommandEnvelope<'record_audit_correction'>
): void {
  const { actor, exercisedCapability, source } = envelope.context;
  if (
    actor.kind !== 'system' ||
    exercisedCapability !== 'system' ||
    source !== 'system_reconciliation'
  ) {
    throw new CanonicalCommandError('forbidden', {
      correlationId: envelope.context.correlationId,
    });
  }
}

export function mapFinanceDomainError(
  envelope: CommandEnvelope<CommandKind>,
  error: unknown
): never {
  if (error instanceof CanonicalCommandError) {
    throw error;
  }
  const message = error instanceof Error ? error.message : 'Finance operation failed';
  if (message.includes('insufficient') || error instanceof Error && error.name === 'InsufficientWalletFundsError') {
    throw new CanonicalCommandError('insufficient_funds', {
      correlationId: envelope.context.correlationId,
    });
  }
  if (error instanceof Error && error.name === 'PaymentAccountingInvariantError') {
    throw new CanonicalCommandError('validation', {
      correlationId: envelope.context.correlationId,
      details: { reason: 'unsupported', field: 'payment' },
    });
  }
  throw new CanonicalCommandError('validation', {
    correlationId: envelope.context.correlationId,
    details: { reason: 'unsupported' },
  });
}
