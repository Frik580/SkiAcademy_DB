import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, Wallet } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { executeAuthenticatedCanonicalCommand } from '../../../../lib/canonical/canonicalCommandClient';
import {
  CanonicalCommandClientError,
  toCanonicalCommandClientError,
} from '../../../../lib/canonical/mapCanonicalCommandError';
import {
  ADMIN_FINANCE_ACCOUNT_QUERY_KEY,
  ADMIN_FINANCE_PAYMENT_QUERY_KEY,
} from '../../adminNavigation';
import type {
  AdminFinanceAccountOption,
  AdminMonetaryEventView,
  AdminPaymentAllowedAction,
  AdminWalletView,
  FinancialCorrectionIntent,
} from './financeContracts';
import {
  createAdminFinanceAttemptId,
  parseAdminFinanceAccountId,
  parseAdminFinancePaymentId,
  parseKztAmountToCanonicalUnits,
} from './financeContracts';
import { useAdminPaymentReadModel, useAdminWalletReadModel } from './useAdminFinanceReadModels';
import { useAdminFinanceTranslations } from './useAdminFinanceTranslations';

interface CanonicalFinancePanelProps {
  readonly adminAccountId: string;
  readonly accounts: readonly AdminFinanceAccountOption[];
  readonly onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

interface FundingAttempt {
  readonly idempotencyKey: ReturnType<typeof createAdminFinanceAttemptId>;
  readonly accountId: NonNullable<ReturnType<typeof parseAdminFinanceAccountId>>;
  readonly amount: NonNullable<ReturnType<typeof parseKztAmountToCanonicalUnits>>;
  readonly reasonExplanation: string;
  readonly expectedRevision?: AdminWalletView['allowedActions'][number]['expectedWalletRevision'];
}

interface CorrectionAttempt {
  readonly idempotencyKey: ReturnType<typeof createAdminFinanceAttemptId>;
  readonly paymentId: NonNullable<ReturnType<typeof parseAdminFinancePaymentId>>;
  readonly action: AdminPaymentAllowedAction;
  readonly amount?: NonNullable<ReturnType<typeof parseKztAmountToCanonicalUnits>>;
  readonly reasonExplanation: string;
  readonly manualExternalReference?: string;
}

interface MutationStatus<T> {
  readonly pending: boolean;
  readonly error?: CanonicalCommandClientError;
  readonly success: boolean;
  readonly attempt?: T;
}

const EMPTY_MUTATION = { pending: false, success: false } as const;

function formatKzt(canonicalKzt: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'KZT',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(canonicalKzt);
}

function mutationError(error: unknown): CanonicalCommandClientError {
  return error instanceof CanonicalCommandClientError
    ? error
    : toCanonicalCommandClientError(error, 'correlation_admin_finance_unknown');
}

function EventHistory(
  props: Readonly<{
    events: readonly AdminMonetaryEventView[];
    hasMore: boolean;
    loadingMore: boolean;
    locale: string;
    onLoadMore: () => void;
    emptyLabel: string;
    loadMoreLabel: string;
  }>
) {
  return (
    <div className="space-y-2">
      {props.events.length === 0 ? (
        <p className="border border-dashed border-[var(--border)] p-4 text-xs text-[var(--ink-dim)]">
          {props.emptyLabel}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)]">
          {props.events.map((event) => (
            <li key={event.eventId} className="grid gap-2 p-3 text-xs sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="font-medium text-[var(--ink)]">
                  {event.eventKind} · {event.sourceKind}
                </p>
                <p className="mt-1 break-all font-mono text-[10px] text-[var(--ink-dim)]">
                  {event.eventId} · {event.correlationId}
                </p>
                {event.reasonCode && (
                  <p className="mt-1 text-[var(--ink-dim)]">{event.reasonCode}</p>
                )}
              </div>
              <div className="text-right">
                <p
                  className={
                    event.direction === 'in'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : event.direction === 'out'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-[var(--ink-dim)]'
                  }
                >
                  {event.direction === 'in' ? '+' : event.direction === 'out' ? '−' : ''}
                  {formatKzt(event.amount, props.locale)}
                </p>
                <p className="mt-1 text-[10px] text-[var(--ink-dim)]">
                  {new Date(event.occurredAt.seconds * 1_000).toLocaleString(props.locale)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {props.hasMore && (
        <button
          type="button"
          disabled={props.loadingMore}
          onClick={props.onLoadMore}
          className="w-full border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider disabled:opacity-50"
        >
          {props.loadingMore ? '…' : props.loadMoreLabel}
        </button>
      )}
    </div>
  );
}

function ReadError(
  props: Readonly<{
    permissionDenied: boolean;
    permissionLabel: string;
    failedLabel: string;
    retryLabel: string;
    onRetry: () => void;
  }>
) {
  return (
    <div role="alert" className="border border-red-500/30 bg-red-500/5 p-4 text-sm">
      <p className="text-red-700 dark:text-red-300">
        {props.permissionDenied ? props.permissionLabel : props.failedLabel}
      </p>
      <button
        type="button"
        onClick={props.onRetry}
        className="mt-3 inline-flex items-center gap-2 border border-[var(--border)] px-3 py-2 text-xs"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {props.retryLabel}
      </button>
    </div>
  );
}

export function CanonicalFinancePanel({
  adminAccountId,
  accounts,
  onRequestConfirm,
}: CanonicalFinancePanelProps) {
  const { t, language } = useAdminFinanceTranslations();
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const [searchParams, setSearchParams] = useSearchParams();
  const accountParam = searchParams.get(ADMIN_FINANCE_ACCOUNT_QUERY_KEY) ?? '';
  const paymentParam = searchParams.get(ADMIN_FINANCE_PAYMENT_QUERY_KEY) ?? '';
  const selectedAccountId = parseAdminFinanceAccountId(accountParam);
  const selectedPaymentId = parseAdminFinancePaymentId(paymentParam);
  const [accountInput, setAccountInput] = useState(accountParam);
  const [paymentInput, setPaymentInput] = useState(paymentParam);
  const [fundingAmount, setFundingAmount] = useState('');
  const [fundingReason, setFundingReason] = useState('');
  const [funding, setFunding] = useState<MutationStatus<FundingAttempt>>(EMPTY_MUTATION);
  const [selectedActionIndex, setSelectedActionIndex] = useState(0);
  const [correctionAmount, setCorrectionAmount] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [manualReference, setManualReference] = useState('');
  const [correction, setCorrection] = useState<MutationStatus<CorrectionAttempt>>(EMPTY_MUTATION);
  const walletRead = useAdminWalletReadModel(selectedAccountId);
  const paymentRead = useAdminPaymentReadModel(selectedPaymentId);

  useEffect(() => setAccountInput(accountParam), [accountParam]);
  useEffect(() => setPaymentInput(paymentParam), [paymentParam]);
  useEffect(() => setSelectedActionIndex(0), [paymentRead.item?.revision]);

  const accountOptions = useMemo(
    () =>
      accounts
        .filter((account) => parseAdminFinanceAccountId(account.uid) !== undefined)
        .sort((left, right) => left.displayName.localeCompare(right.displayName, locale)),
    [accounts, locale]
  );

  const updateTarget = (key: string, value: string | undefined) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  };

  const submitAccount = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseAdminFinanceAccountId(accountInput);
    if (parsed) updateTarget(ADMIN_FINANCE_ACCOUNT_QUERY_KEY, parsed);
  };

  const submitPayment = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseAdminFinancePaymentId(paymentInput);
    if (parsed) updateTarget(ADMIN_FINANCE_PAYMENT_QUERY_KEY, parsed);
  };

  const runFunding = async (attempt: FundingAttempt) => {
    setFunding({ pending: true, success: false, attempt });
    try {
      await executeAuthenticatedCanonicalCommand(adminAccountId, {
        kind: 'record_manual_wallet_funding',
        intent: {
          accountId: attempt.accountId,
          amount: attempt.amount,
          reasonExplanation: attempt.reasonExplanation,
        },
        idempotencyKey: attempt.idempotencyKey,
        ...(attempt.expectedRevision === undefined
          ? {}
          : { expectedRevision: attempt.expectedRevision }),
      });
      await walletRead.refetch();
      setFunding({ pending: false, success: true });
      setFundingAmount('');
      setFundingReason('');
    } catch (error) {
      const normalized = mutationError(error);
      if (normalized.code === 'stale_version') await walletRead.refetch();
      setFunding({
        pending: false,
        success: false,
        error: normalized,
        ...(normalized.code === 'stale_version' ? {} : { attempt }),
      });
    }
  };

  const requestFunding = () => {
    if (!selectedAccountId || !walletRead.item) return;
    const amount = parseKztAmountToCanonicalUnits(fundingAmount);
    const reasonExplanation = fundingReason.trim();
    const allowedAction = walletRead.item.allowedActions[0];
    if (!amount || !reasonExplanation || !allowedAction) return;
    const attempt: FundingAttempt = {
      idempotencyKey: createAdminFinanceAttemptId('manual_wallet_funding'),
      accountId: selectedAccountId,
      amount,
      reasonExplanation,
      ...(allowedAction.expectedWalletRevision === undefined
        ? {}
        : { expectedRevision: allowedAction.expectedWalletRevision }),
    };
    onRequestConfirm(
      `${t('adminFinanceConfirmFunding')} ${formatKzt(amount, locale)} — ${walletRead.item.accountIdentity.displayName}`,
      () => runFunding(attempt)
    );
  };

  const selectedAction = paymentRead.item?.allowedActions[selectedActionIndex];

  const runCorrection = async (attempt: CorrectionAttempt) => {
    setCorrection({ pending: true, success: false, attempt });
    try {
      if (attempt.action.kind === 'rebuild_payment_projection') {
        await executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: 'record_audit_correction',
          intent: {
            operation: 'rebuild_payment_projection',
            paymentId: attempt.paymentId,
            expectedPaymentRevision: attempt.action.expectedPaymentRevision,
            reasonExplanation: attempt.reasonExplanation,
          },
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision: attempt.action.expectedPaymentRevision,
        });
      } else {
        const amount = attempt.amount!;
        let intent: FinancialCorrectionIntent;
        if (attempt.action.kind === 'admin_refund') {
          intent = {
            correctionKind: 'admin_refund',
            paymentId: attempt.paymentId,
            amount,
            expectedPaymentRevision: attempt.action.expectedPaymentRevision,
            ...(attempt.action.walletAccountId === undefined
              ? {}
              : { walletAccountId: attempt.action.walletAccountId }),
            ...(attempt.action.expectedWalletRevision === undefined
              ? {}
              : { expectedWalletRevision: attempt.action.expectedWalletRevision }),
            ...(attempt.manualExternalReference === undefined
              ? {}
              : { manualExternalReference: attempt.manualExternalReference }),
            adminIssueId: attempt.action.adminIssueId,
            expectedAdminIssueRevision: attempt.action.expectedAdminIssueRevision,
            reasonExplanation: attempt.reasonExplanation,
          };
        } else {
          intent = {
            correctionKind: attempt.action.kind,
            paymentId: attempt.paymentId,
            amount,
            expectedPaymentRevision: attempt.action.expectedPaymentRevision,
            adminIssueId: attempt.action.adminIssueId,
            expectedAdminIssueRevision: attempt.action.expectedAdminIssueRevision,
            reasonExplanation: attempt.reasonExplanation,
          };
        }
        await executeAuthenticatedCanonicalCommand(adminAccountId, {
          kind: 'record_financial_correction',
          intent,
          idempotencyKey: attempt.idempotencyKey,
          expectedRevision: attempt.action.expectedPaymentRevision,
        });
      }
      await Promise.all([paymentRead.refetch(), walletRead.refetch()]);
      setCorrection({ pending: false, success: true });
      setCorrectionAmount('');
      setCorrectionReason('');
      setManualReference('');
    } catch (error) {
      const normalized = mutationError(error);
      if (normalized.code === 'stale_version') {
        await Promise.all([paymentRead.refetch(), walletRead.refetch()]);
      }
      setCorrection({
        pending: false,
        success: false,
        error: normalized,
        ...(normalized.code === 'stale_version' ? {} : { attempt }),
      });
    }
  };

  const requestCorrection = () => {
    if (!selectedAction || !paymentRead.item) return;
    const reasonExplanation = correctionReason.trim();
    if (!reasonExplanation) return;
    const requiresAmount = selectedAction.kind !== 'rebuild_payment_projection';
    const amount = requiresAmount ? parseKztAmountToCanonicalUnits(correctionAmount) : undefined;
    if (requiresAmount && !amount) return;
    if (
      amount &&
      selectedAction.maximumAmount !== undefined &&
      amount > selectedAction.maximumAmount
    ) {
      return;
    }
    const externalReference = manualReference.trim();
    if (
      selectedAction.kind === 'admin_refund' &&
      selectedAction.walletAccountId === undefined &&
      !externalReference
    ) {
      return;
    }
    const attempt: CorrectionAttempt = {
      idempotencyKey: createAdminFinanceAttemptId(selectedAction.kind),
      paymentId: paymentRead.item.paymentId,
      action: selectedAction,
      ...(amount === undefined ? {} : { amount }),
      reasonExplanation,
      ...(externalReference ? { manualExternalReference: externalReference } : {}),
    };
    onRequestConfirm(
      `${t('adminFinanceConfirmCorrection')} ${selectedAction.kind} — ${paymentRead.item.paymentId}`,
      () => runCorrection(attempt)
    );
  };

  return (
    <div className="space-y-6">
      <section className="space-y-4 border border-[var(--border)] p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4" />
          <h3 className="text-sm font-medium">{t('adminFinanceWalletTitle')}</h3>
        </div>
        <form onSubmit={submitAccount} className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            id="admin-finance-account"
            aria-label={t('adminFinanceAccount')}
            list="admin-finance-accounts"
            value={accountInput}
            onChange={(event) => setAccountInput(event.target.value)}
            placeholder={t('adminFinanceAccountPlaceholder')}
            className="border border-[var(--border)] bg-transparent px-3 py-2 text-xs"
          />
          <datalist id="admin-finance-accounts">
            {accountOptions.map((account) => (
              <option key={account.uid} value={account.uid}>
                {account.displayName} · {account.email}
              </option>
            ))}
          </datalist>
          <button
            type="submit"
            disabled={!parseAdminFinanceAccountId(accountInput)}
            className="inline-flex items-center justify-center gap-2 border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
          >
            <Search className="h-3.5 w-3.5" /> {t('adminFinanceOpen')}
          </button>
        </form>

        {selectedAccountId && walletRead.loading ? (
          <div role="status" className="flex min-h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : walletRead.error ? (
          <ReadError
            permissionDenied={walletRead.error === 'permission-denied'}
            permissionLabel={t('adminFinancePermissionDenied')}
            failedLabel={t('adminFinanceReadFailed')}
            retryLabel={t('retry')}
            onRetry={() => void walletRead.refetch()}
          />
        ) : walletRead.item ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="border border-[var(--border)] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[var(--ink-dim)]">
                  {t('adminFinanceIdentity')}
                </p>
                <p className="mt-1 text-sm">{walletRead.item.accountIdentity.displayName}</p>
                <p className="break-all text-[10px] text-[var(--ink-dim)]">
                  {walletRead.item.accountIdentity.email ?? walletRead.item.accountId}
                </p>
              </div>
              <div className="border border-[var(--border)] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[var(--ink-dim)]">
                  {t('adminFinanceBalance')}
                </p>
                <p className="mt-1 text-xl">{formatKzt(walletRead.item.balance, locale)}</p>
              </div>
              <div className="border border-[var(--border)] p-3">
                <p className="text-[10px] uppercase tracking-wider text-[var(--ink-dim)]">
                  {t('adminFinanceRevision')}
                </p>
                <p className="mt-1 text-sm">
                  {walletRead.item.revision} · event {walletRead.item.eventRevision}
                </p>
              </div>
            </div>

            {walletRead.item.allowedActions.length > 0 ? (
              <div className="grid gap-2 border border-[var(--border)] p-3 sm:grid-cols-3">
                <input
                  aria-label={t('adminFinanceAmountKzt')}
                  value={fundingAmount}
                  onChange={(event) => setFundingAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder={t('adminFinanceAmountKzt')}
                  className="border border-[var(--border)] bg-transparent px-3 py-2 text-xs"
                />
                <input
                  aria-label={t('adminFinanceReason')}
                  value={fundingReason}
                  onChange={(event) => setFundingReason(event.target.value)}
                  placeholder={t('adminFinanceReason')}
                  className="border border-[var(--border)] bg-transparent px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  disabled={
                    funding.pending ||
                    !parseKztAmountToCanonicalUnits(fundingAmount) ||
                    !fundingReason.trim()
                  }
                  onClick={requestFunding}
                  className="border border-[var(--border)] bg-[var(--ink)] px-3 py-2 text-xs text-[var(--bg)] disabled:opacity-50"
                >
                  {funding.pending ? t('adminFinancePending') : t('adminFinanceFundWallet')}
                </button>
              </div>
            ) : (
              <p className="border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                {t('adminFinanceAccountUnavailable')}
              </p>
            )}
            {funding.error && (
              <div role="alert" className="border border-red-500/30 bg-red-500/5 p-3 text-xs">
                <p>
                  {funding.error.code} · {funding.error.correlationId}
                </p>
                {funding.attempt && funding.error.retryable && (
                  <button
                    type="button"
                    onClick={() => void runFunding(funding.attempt!)}
                    className="mt-2 border border-[var(--border)] px-2 py-1"
                  >
                    {t('adminFinanceRetrySameAction')}
                  </button>
                )}
              </div>
            )}
            {funding.success && (
              <p role="status" className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> {t('adminFinanceFundingSuccess')}
              </p>
            )}
            <div>
              <h4 className="mb-2 text-xs font-mono uppercase tracking-wider">
                {t('adminFinanceMonetaryEvents')}
              </h4>
              <EventHistory
                events={walletRead.item.events}
                hasMore={walletRead.item.hasMore}
                loadingMore={walletRead.loadingMore}
                locale={locale}
                onLoadMore={() => void walletRead.loadMore()}
                emptyLabel={t('adminFinanceEventsEmpty')}
                loadMoreLabel={t('adminFinanceLoadMore')}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--ink-dim)]">{t('adminFinanceSelectAccount')}</p>
        )}
      </section>

      <section className="space-y-4 border border-[var(--border)] p-4 sm:p-5">
        <h3 className="text-sm font-medium">{t('adminFinancePaymentTitle')}</h3>
        <form onSubmit={submitPayment} className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            aria-label={t('adminFinancePaymentId')}
            value={paymentInput}
            onChange={(event) => setPaymentInput(event.target.value)}
            placeholder={t('adminFinancePaymentPlaceholder')}
            className="border border-[var(--border)] bg-transparent px-3 py-2 text-xs"
          />
          <button
            type="submit"
            disabled={!parseAdminFinancePaymentId(paymentInput)}
            className="border border-[var(--border)] px-3 py-2 text-xs disabled:opacity-50"
          >
            {t('adminFinanceOpen')}
          </button>
        </form>

        {selectedPaymentId && paymentRead.loading ? (
          <div role="status" className="flex min-h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : paymentRead.error ? (
          <ReadError
            permissionDenied={paymentRead.error === 'permission-denied'}
            permissionLabel={t('adminFinancePermissionDenied')}
            failedLabel={t('adminFinanceReadFailed')}
            retryLabel={t('retry')}
            onRetry={() => void paymentRead.refetch()}
          />
        ) : selectedPaymentId && !paymentRead.item ? (
          <p className="border border-dashed border-[var(--border)] p-4 text-xs">
            {t('adminFinancePaymentNotFound')}
          </p>
        ) : paymentRead.item ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
              <dt className="text-[var(--ink-dim)]">{t('adminFinanceSubject')}</dt>
              <dd>
                {paymentRead.item.subjectType} · {paymentRead.item.subjectId}
              </dd>
              <dt className="text-[var(--ink-dim)]">{t('adminFinancePayer')}</dt>
              <dd>{paymentRead.item.payer?.displayName ?? '—'}</dd>
              <dt className="text-[var(--ink-dim)]">{t('adminFinanceStatus')}</dt>
              <dd>{paymentRead.item.paymentStatus}</dd>
              <dt className="text-[var(--ink-dim)]">{t('adminFinanceRevision')}</dt>
              <dd>
                {paymentRead.item.revision} · event {paymentRead.item.eventRevision}
              </dd>
            </dl>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                [t('adminFinanceOriginalPrice'), paymentRead.item.originalPrice],
                [t('adminFinanceCurrentPrice'), paymentRead.item.price],
                [t('adminFinancePaid'), paymentRead.item.paidAmount],
                [t('adminFinanceOutstanding'), paymentRead.item.outstandingAmount],
                [t('adminFinanceRetained'), paymentRead.item.retainedAmount],
                [t('adminFinanceSettled'), paymentRead.item.settledAmount],
                [t('adminFinanceRefunded'), paymentRead.item.refundedAmount],
                [t('adminFinanceWrittenOff'), paymentRead.item.writtenOffAmount],
              ].map(([label, amount]) => (
                <div key={String(label)} className="border border-[var(--border)] p-3">
                  <p className="text-[9px] uppercase tracking-wider text-[var(--ink-dim)]">
                    {label}
                  </p>
                  <p className="mt-1 text-sm">{formatKzt(Number(amount), locale)}</p>
                </div>
              ))}
            </div>
            {paymentRead.item.providerState && (
              <p className="border border-[var(--border)] p-3 text-xs text-[var(--ink-dim)]">
                {t('adminFinanceProvider')}: {paymentRead.item.providerState.providerKind ?? '—'} ·{' '}
                {paymentRead.item.providerState.providerTransactionRef ??
                  paymentRead.item.providerState.latestEventId}
              </p>
            )}
            <div>
              <h4 className="mb-2 text-xs font-mono uppercase tracking-wider">
                {t('adminFinanceRelatedIssues')}
              </h4>
              {paymentRead.item.relatedIssues.length === 0 ? (
                <p className="text-xs text-[var(--ink-dim)]">{t('adminFinanceNoRelatedIssues')}</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {paymentRead.item.relatedIssues.map((issue) => (
                    <li key={issue.issueId} className="border border-[var(--border)] p-2">
                      {issue.kind} · {issue.lifecycleStatus} · rev {issue.revision}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {paymentRead.item.allowedActions.length === 0 ? (
              <p className="flex gap-2 border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t('adminFinanceCorrectionsDeferred')}
              </p>
            ) : (
              <div className="space-y-3 border border-[var(--border)] p-3">
                <select
                  aria-label={t('adminFinanceCorrectionAction')}
                  value={selectedActionIndex}
                  onChange={(event) => setSelectedActionIndex(Number(event.target.value))}
                  className="w-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs"
                >
                  {paymentRead.item.allowedActions.map((action, index) => (
                    <option key={`${action.adminIssueId}:${action.kind}`} value={index}>
                      {action.kind} · {action.adminIssueId}
                    </option>
                  ))}
                </select>
                {selectedAction?.kind !== 'rebuild_payment_projection' && (
                  <input
                    aria-label={t('adminFinanceAmountKzt')}
                    value={correctionAmount}
                    onChange={(event) => setCorrectionAmount(event.target.value)}
                    placeholder={
                      selectedAction?.maximumAmount === undefined
                        ? t('adminFinanceAmountKzt')
                        : `${t('adminFinanceAmountKzt')} ≤ ${formatKzt(selectedAction.maximumAmount, locale)}`
                    }
                    className="w-full border border-[var(--border)] bg-transparent px-3 py-2 text-xs"
                  />
                )}
                {selectedAction?.kind === 'admin_refund' &&
                  selectedAction.walletAccountId === undefined && (
                    <input
                      aria-label={t('adminFinanceManualReference')}
                      value={manualReference}
                      onChange={(event) => setManualReference(event.target.value)}
                      placeholder={t('adminFinanceManualReference')}
                      className="w-full border border-[var(--border)] bg-transparent px-3 py-2 text-xs"
                    />
                  )}
                <textarea
                  aria-label={t('adminFinanceReason')}
                  value={correctionReason}
                  onChange={(event) => setCorrectionReason(event.target.value)}
                  placeholder={t('adminFinanceReason')}
                  className="min-h-20 w-full border border-[var(--border)] bg-transparent px-3 py-2 text-xs"
                />
                <button
                  type="button"
                  disabled={correction.pending || !correctionReason.trim()}
                  onClick={requestCorrection}
                  className="w-full border border-[var(--border)] bg-[var(--ink)] px-3 py-2 text-xs text-[var(--bg)] disabled:opacity-50"
                >
                  {correction.pending ? t('adminFinancePending') : t('adminFinanceApplyCorrection')}
                </button>
              </div>
            )}
            {correction.error && (
              <div role="alert" className="border border-red-500/30 bg-red-500/5 p-3 text-xs">
                <p>
                  {correction.error.code} · {correction.error.correlationId}
                </p>
                {correction.attempt && correction.error.retryable && (
                  <button
                    type="button"
                    onClick={() => void runCorrection(correction.attempt!)}
                    className="mt-2 border border-[var(--border)] px-2 py-1"
                  >
                    {t('adminFinanceRetrySameAction')}
                  </button>
                )}
              </div>
            )}
            {correction.success && (
              <p role="status" className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 className="h-4 w-4" /> {t('adminFinanceCorrectionSuccess')}
              </p>
            )}
            <div>
              <h4 className="mb-2 text-xs font-mono uppercase tracking-wider">
                {t('adminFinanceMonetaryEvents')}
              </h4>
              <EventHistory
                events={paymentRead.item.events}
                hasMore={paymentRead.item.hasMore}
                loadingMore={paymentRead.loadingMore}
                locale={locale}
                onLoadMore={() => void paymentRead.loadMore()}
                emptyLabel={t('adminFinanceEventsEmpty')}
                loadMoreLabel={t('adminFinanceLoadMore')}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--ink-dim)]">{t('adminFinanceSelectPayment')}</p>
        )}
      </section>
    </div>
  );
}

export default CanonicalFinancePanel;
