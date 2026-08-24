import {
  CanonicalCommandError,
  administratorCapabilityExercisedByAccount,
  type CommandEnvelope,
  type CommandKind,
} from '@ski-academy/shared-domain';

export function assertAdministratorFinanceAccess(
  envelope: CommandEnvelope<
    'record_manual_wallet_funding' | 'record_provider_payment_event' | 'adjust_service_price'
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
    'record_manual_wallet_funding' | 'record_provider_payment_event' | 'adjust_service_price'
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
