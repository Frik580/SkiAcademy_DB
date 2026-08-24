import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AccountId,
  type AuditOutboxStagingPlan,
  type CommandEnvelope,
  type MonetaryEventId,
  type PaymentId,
} from '@ski-academy/shared-domain';

type FinanceCommandKind =
  | 'record_manual_wallet_funding'
  | 'record_provider_payment_event'
  | 'adjust_service_price';

function summaryForKind(kind: FinanceCommandKind): string {
  switch (kind) {
    case 'record_manual_wallet_funding':
      return 'Wallet balance credited';
    case 'record_provider_payment_event':
      return 'External payment recorded';
    case 'adjust_service_price':
      return 'Service price adjusted';
  }
}

function effectsForKind(
  kind: FinanceCommandKind,
  subjectRef: AuditOutboxStagingPlan['activityLog']['affectedSubjects'][number]
): AuditOutboxStagingPlan['activityLog']['effects'] {
  switch (kind) {
    case 'record_manual_wallet_funding':
      return [
        {
          kind: 'wallet_balance_changed',
          subjectRef,
          summary: summaryForKind(kind),
        },
      ];
    case 'record_provider_payment_event':
      return [
        {
          kind: 'payment_state_changed',
          subjectRef,
          summary: summaryForKind(kind),
        },
      ];
    case 'adjust_service_price':
      return [
        {
          kind: 'payment_state_changed',
          subjectRef,
          summary: summaryForKind(kind),
        },
      ];
  }
}

export function buildManualWalletFundingAuditPlan(input: {
  envelope: CommandEnvelope<'record_manual_wallet_funding'>;
  monetaryEventIds: readonly MonetaryEventId[];
  accountId: AccountId;
  walletRevision: number;
}): AuditOutboxStagingPlan {
  const subjectRef = walletAffectedSubject(input.accountId);
  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_financial_correction',
        explanation: input.envelope.intent.reasonExplanation,
      },
      primarySubject: walletPrimarySubject(input.accountId),
      affectedSubjects: [subjectRef],
      effects: effectsForKind('record_manual_wallet_funding', subjectRef),
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: subjectRef,
          revision: AggregateRevisionSchema.parse(input.walletRevision),
        },
      ],
    },
    outboxObligations: [],
  };
}

export function buildProviderPaymentEventAuditPlan(input: {
  envelope: CommandEnvelope<'record_provider_payment_event'>;
  monetaryEventIds: readonly MonetaryEventId[];
  paymentId: PaymentId;
  paymentRevision: number;
}): AuditOutboxStagingPlan {
  const subjectRef = paymentAffectedSubject(input.paymentId);
  const reason =
    input.envelope.context.source === 'provider_callback'
      ? {
          registryVersion: AUDIT_REASON_REGISTRY_VERSION,
          reasonCode: 'provider_callback_processed' as const,
        }
      : {
          registryVersion: AUDIT_REASON_REGISTRY_VERSION,
          reasonCode: 'manual_override' as const,
          explanation:
            input.envelope.intent.manualReference ??
            input.envelope.intent.providerTransactionRef ??
            'Manual external payment recorded',
        };

  return {
    activityLog: {
      reason,
      primarySubject: paymentPrimarySubject(input.paymentId),
      affectedSubjects: [subjectRef],
      effects: effectsForKind('record_provider_payment_event', subjectRef),
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: [],
      resultingRevisions: [
        {
          subject: subjectRef,
          revision: AggregateRevisionSchema.parse(input.paymentRevision),
        },
      ],
    },
    outboxObligations: [],
  };
}

export function buildAdjustServicePriceAuditPlan(input: {
  envelope: CommandEnvelope<'adjust_service_price'>;
  monetaryEventIds: readonly MonetaryEventId[];
  paymentId: PaymentId;
  paymentRevision: number;
  walletAccountId?: AccountId;
  walletRevision?: number;
  includeWalletEffect?: boolean;
}): AuditOutboxStagingPlan {
  const paymentSubject = paymentAffectedSubject(input.paymentId);
  const affectedSubjects: Array<
    AuditOutboxStagingPlan['activityLog']['affectedSubjects'][number]
  > = [paymentSubject];
  const resultingRevisions: Array<
    AuditOutboxStagingPlan['activityLog']['resultingRevisions'][number]
  > = [
    {
      subject: paymentSubject,
      revision: AggregateRevisionSchema.parse(input.paymentRevision),
    },
  ];
  const effects = [...effectsForKind('adjust_service_price', paymentSubject)];

  if (input.walletAccountId !== undefined) {
    const walletSubject = walletAffectedSubject(input.walletAccountId);
    affectedSubjects.push(walletSubject);
    if (input.walletRevision !== undefined) {
      resultingRevisions.push({
        subject: walletSubject,
        revision: AggregateRevisionSchema.parse(input.walletRevision),
      });
    }
    if (input.includeWalletEffect) {
      effects.push({
        kind: 'wallet_balance_changed',
        subjectRef: walletSubject,
        summary: 'Wallet balance adjusted for price change',
      });
    }
  }

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_override',
        ...(input.envelope.intent.reasonExplanation === undefined
          ? {}
          : { explanation: input.envelope.intent.reasonExplanation }),
      },
      primarySubject: paymentPrimarySubject(input.paymentId),
      affectedSubjects,
      effects,
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds: [],
      resultingRevisions,
    },
    outboxObligations: [],
  };
}

export function paymentPrimarySubject(paymentId: PaymentId) {
  return {
    kind: 'payment' as const,
    id: paymentId,
    subjectKey: `payment:${paymentId}`,
  };
}

export function walletPrimarySubject(accountId: AccountId) {
  return {
    kind: 'account' as const,
    id: accountId,
    subjectKey: `account:${accountId}`,
  };
}

export function paymentAffectedSubject(paymentId: PaymentId) {
  return canonicalReference('payment', paymentId);
}

export function walletAffectedSubject(accountId: AccountId) {
  return canonicalReference('account', accountId);
}
