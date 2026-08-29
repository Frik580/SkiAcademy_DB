import {
  AUDIT_REASON_REGISTRY_VERSION,
  AggregateRevisionSchema,
  canonicalReference,
  type AccountId,
  type ActivityLogEffectInput,
  type ActivityLogResultingRevisionInput,
  type AdminIssueId,
  type AuditOutboxStagingPlan,
  type CanonicalReference,
  type CommandEnvelope,
  type MonetaryEventId,
  type PaymentId,
} from '@ski-academy/shared-domain';

type FinanceCommandKind =
  | 'record_manual_wallet_funding'
  | 'record_provider_payment_event'
  | 'adjust_service_price'
  | 'record_financial_correction'
  | 'record_audit_correction';

function summaryForKind(kind: FinanceCommandKind): string {
  switch (kind) {
    case 'record_manual_wallet_funding':
      return 'Wallet balance credited';
    case 'record_provider_payment_event':
      return 'External payment recorded';
    case 'adjust_service_price':
      return 'Service price adjusted';
    case 'record_financial_correction':
      return 'Financial correction recorded';
    case 'record_audit_correction':
      return 'Audit correction recorded';
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
    case 'record_financial_correction':
      return [
        {
          kind: 'financial_correction_recorded',
          subjectRef,
          summary: summaryForKind(kind),
        },
      ];
    case 'record_audit_correction':
      return [
        {
          kind: 'audit_correction_recorded',
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
  resolvedAdminIssueId?: AdminIssueId;
  resolvedAdminIssueRevision?: number;
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

  const adminIssueIds = input.resolvedAdminIssueId ? [input.resolvedAdminIssueId] : [];
  const resultingRevisions: ActivityLogResultingRevisionInput[] = [
    {
      subject: subjectRef,
      revision: AggregateRevisionSchema.parse(input.paymentRevision),
    },
  ];
  const effects: ActivityLogEffectInput[] = [
    ...effectsForKind('record_provider_payment_event', subjectRef),
  ];

  if (input.resolvedAdminIssueId !== undefined && input.resolvedAdminIssueRevision !== undefined) {
    const issueSubject = canonicalReference('admin_issue', input.resolvedAdminIssueId);
    resultingRevisions.push({
      subject: issueSubject,
      revision: AggregateRevisionSchema.parse(input.resolvedAdminIssueRevision),
    });
    effects.push({
      kind: 'admin_issue_resolved',
      subjectRef: issueSubject,
      summary: 'Payment-start restriction cleared after external funding',
    });
  }

  return {
    activityLog: {
      reason,
      primarySubject: paymentPrimarySubject(input.paymentId),
      affectedSubjects: [subjectRef],
      effects,
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds,
      resultingRevisions,
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

export function buildFinancialCorrectionAuditPlan(input: {
  envelope: CommandEnvelope<'record_financial_correction'>;
  monetaryEventIds: readonly MonetaryEventId[];
  paymentId: PaymentId;
  paymentRevision: number;
  walletAccountId?: AccountId;
  walletRevision?: number;
  includeWalletEffect?: boolean;
  resolvedAdminIssueId?: AdminIssueId;
  resolvedAdminIssueRevision?: number;
}): AuditOutboxStagingPlan {
  const paymentSubject = paymentAffectedSubject(input.paymentId);
  const affectedSubjects: CanonicalReference[] = [paymentSubject];
  const resultingRevisions: ActivityLogResultingRevisionInput[] = [
    {
      subject: paymentSubject,
      revision: AggregateRevisionSchema.parse(input.paymentRevision),
    },
  ];
  const effects: ActivityLogEffectInput[] = [
    ...effectsForKind('record_financial_correction', paymentSubject),
    {
      kind: 'payment_state_changed',
      subjectRef: paymentSubject,
      summary: 'Payment state corrected',
    },
  ];

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
        summary: 'Wallet balance corrected',
      });
    }
  }

  const adminIssueIds = input.resolvedAdminIssueId ? [input.resolvedAdminIssueId] : [];
  if (input.resolvedAdminIssueId && input.resolvedAdminIssueRevision !== undefined) {
    resultingRevisions.push({
      subject: canonicalReference('admin_issue', input.resolvedAdminIssueId),
      revision: AggregateRevisionSchema.parse(input.resolvedAdminIssueRevision),
    });
    effects.push({
      kind: 'admin_issue_resolved',
      subjectRef: canonicalReference('admin_issue', input.resolvedAdminIssueId),
      summary: 'Financial admin issue resolved',
    });
  }

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode: 'manual_financial_correction',
        explanation: input.envelope.intent.reasonExplanation,
      },
      primarySubject: paymentPrimarySubject(input.paymentId),
      affectedSubjects,
      effects,
      monetaryEventIds: [...input.monetaryEventIds],
      adminIssueIds,
      resultingRevisions,
    },
    outboxObligations: [],
  };
}

export function buildAuditCorrectionAuditPlan(input: {
  envelope: CommandEnvelope<'record_audit_correction'>;
  paymentId?: PaymentId;
  paymentRevision?: number;
  walletAccountId?: AccountId;
  walletRevision?: number;
  openedAdminIssueId?: AdminIssueId;
  openedAdminIssueRevision?: number;
  includePaymentEffect?: boolean;
  includeWalletEffect?: boolean;
  isReconciliation: boolean;
}): AuditOutboxStagingPlan {
  const primarySubject =
    input.paymentId !== undefined
      ? paymentPrimarySubject(input.paymentId)
      : input.walletAccountId !== undefined
        ? walletPrimarySubject(input.walletAccountId)
        : {
            kind: 'account' as const,
            id: 'system_reconciliation',
            subjectKey: 'account:system_reconciliation',
          };

  const affectedSubjects: CanonicalReference[] = [];
  const resultingRevisions: ActivityLogResultingRevisionInput[] = [];
  const effects: ActivityLogEffectInput[] = [];
  const adminIssueIds: AdminIssueId[] = [];

  if (input.paymentId !== undefined) {
    const paymentSubject = paymentAffectedSubject(input.paymentId);
    affectedSubjects.push(paymentSubject);
    if (input.paymentRevision !== undefined) {
      resultingRevisions.push({
        subject: paymentSubject,
        revision: AggregateRevisionSchema.parse(input.paymentRevision),
      });
    }
    if (input.includePaymentEffect) {
      effects.push({
        kind: 'payment_state_changed',
        subjectRef: paymentSubject,
        summary: 'Payment projection rebuilt',
      });
    }
  }

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
        summary: 'Wallet projection rebuilt',
      });
    }
  }

  if (input.openedAdminIssueId !== undefined) {
    adminIssueIds.push(input.openedAdminIssueId);
    const issueSubject = canonicalReference('admin_issue', input.openedAdminIssueId);
    affectedSubjects.push(issueSubject);
    if (input.openedAdminIssueRevision !== undefined) {
      resultingRevisions.push({
        subject: issueSubject,
        revision: AggregateRevisionSchema.parse(input.openedAdminIssueRevision),
      });
    }
    effects.push({
      kind: 'admin_issue_opened',
      subjectRef: issueSubject,
      summary: 'Financial reconciliation mismatch detected',
    });
  }

  if (effects.length === 0) {
    effects.push({
      kind: 'audit_correction_recorded',
      subjectRef: affectedSubjects[0] ?? primarySubject,
      summary: input.isReconciliation
        ? 'Financial reconciliation completed'
        : 'Audit correction recorded',
    });
  }

  const reasonCode = input.isReconciliation ? 'scheduled_system_action' : 'audit_correction';
  const explanation =
    input.envelope.intent.operation === 'rebuild_payment_projection' ||
    input.envelope.intent.operation === 'rebuild_wallet_projection'
      ? input.envelope.intent.reasonExplanation
      : undefined;

  return {
    activityLog: {
      reason: {
        registryVersion: AUDIT_REASON_REGISTRY_VERSION,
        reasonCode,
        ...(explanation === undefined ? {} : { explanation }),
      },
      primarySubject,
      affectedSubjects,
      effects,
      monetaryEventIds: [],
      adminIssueIds,
      resultingRevisions,
    },
    outboxObligations: [],
  };
}
