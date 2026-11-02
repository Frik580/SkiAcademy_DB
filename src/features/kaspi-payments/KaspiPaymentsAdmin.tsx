import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ADMIN_TEST_SESSION_QUERY_KEY } from '../admin/adminNavigation';
import {
  AggregateRevisionSchema,
  IdempotencyKeySchema,
  KaspiRequestStatusSchema,
  timestampFromDate,
  type CommandEnvelope,
  type KaspiPaymentRequest,
} from '@ski-academy/shared-domain';
import { executeAuthenticatedCanonicalCommand } from '../../lib/canonical/canonicalCommandClient';
import { AdminModal } from '../admin/components/AdminModal';
import type { KaspiPage } from './kaspiContracts';
import { queryKaspi } from './kaspiService';
import { useKaspiTranslations } from './useKaspiTranslations';

type Intent = CommandEnvelope<'review_kaspi_payment'>['intent'];
type HistoryItem = {
  id: string;
  status: KaspiPaymentRequest['status'];
  at: { seconds: number };
  reason?: string;
};
export function KaspiPaymentsAdmin({ accountId }: { accountId: string }) {
  const [searchParams] = useSearchParams();
  const testRequested = Boolean(searchParams.get(ADMIN_TEST_SESSION_QUERY_KEY));
  const { t, formatKzt, language } = useKaspiTranslations();
  const [status, setStatus] = useState('payment_claimed');
  const [page, setPage] = useState<KaspiPage<KaspiPaymentRequest>>({ items: [], hasMore: false });
  const [selectedId, setSelectedId] = useState<string>();
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [receivedAt, setReceivedAt] = useState('');
  const [reference, setReference] = useState('');
  const [matchingBasis, setMatchingBasis] = useState('');
  const [history, setHistory] = useState<KaspiPage<HistoryItem>>({ items: [], hasMore: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState<Intent>();
  const lock = useRef(false);
  const selected = page.items.find((item) => item.requestId === selectedId);
  const refresh = useCallback(
    async (cursor?: string) => {
      if (testRequested) {
        setPage({ items: [], hasMore: false });
        return;
      }
      const result = await queryKaspi<KaspiPage<KaspiPaymentRequest>>({
        scope: 'admin',
        ...(status ? { status } : {}),
        ...(cursor ? { cursor } : {}),
      });
      setPage((previous) =>
        cursor ? { ...result, items: [...previous.items, ...result.items] } : result
      );
    },
    [status, testRequested]
  );
  useEffect(() => {
    setError(false);
    void refresh().catch(() => setError(true));
  }, [refresh]);
  async function loadHistory(requestId: string, cursor?: string) {
    const result = await queryKaspi<KaspiPage<HistoryItem>>({
      scope: 'history',
      requestId,
      ...(cursor ? { cursor } : {}),
    });
    setHistory((previous) =>
      cursor ? { ...result, items: [...previous.items, ...result.items] } : result
    );
  }
  async function confirm() {
    if (testRequested || !pending || !selected || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(false);
    try {
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'review_kaspi_payment',
        intent: pending,
        expectedRevision: AggregateRevisionSchema.parse(selected.revision),
        idempotencyKey: IdempotencyKeySchema.parse(
          `kaspi_review_${selected.requestId}_${selected.revision}_${pending.action}`
        ),
      });
      if (result.status !== 'success') throw new Error('Review failed');
      setPending(undefined);
      setSelectedId(undefined);
      await refresh();
    } catch {
      setError(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const date = (seconds: number) =>
    new Date(seconds * 1000).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-US');
  function prepare(action: Intent['action']) {
    if (!selected || !reason.trim()) {
      setError(true);
      return;
    }
    const base: Intent = { requestId: selected.requestId, action, reason };
    try {
      if (action === 'require_refund') {
        const value = Number(refundAmount);
        if (
          !Number.isSafeInteger(value) ||
          value <= 0 ||
          value > (selected.receipt?.amount ?? 0) - selected.refundedAmount
        )
          throw new Error('Invalid refund amount');
        base.refundAmount = value as never;
      }
      if (action === 'confirm') {
        base.receipt = {
          amount: Number(amount) as never,
          receivedAt: timestampFromDate(new Date(receivedAt)),
          bankReference: reference,
          matchingBasis,
        };
        if (
          !Number.isSafeInteger(Number(amount)) ||
          Number(amount) <= 0 ||
          !reference.trim() ||
          !matchingBasis.trim()
        )
          throw new Error('Evidence required');
      }
      if (action === 'record_refund') {
        base.refundBankReference = reference;
        base.refundedAt = timestampFromDate(new Date(receivedAt));
        if (!reference.trim()) throw new Error('Bank reference required');
      }
      setPending(base);
      setError(false);
    } catch {
      setError(true);
    }
  }
  if (testRequested) return <p>{t('kaspiTestUnavailable')}</p>;
  return (
    <section
      className="space-y-4 border border-[var(--border)] p-4 text-[var(--ink)]"
      aria-label={t('kaspiAdminTitle')}
    >
      <h3 className="type-card-title">{t('kaspiAdminTitle')}</h3>
      {error && <p role="alert">{t('kaspiError')}</p>}
      <label>
        {t('kaspiFilter')}
        <select
          className="ui-field-plain ml-2"
          value={status}
          disabled={busy}
          onChange={(event) => {
            setStatus(event.target.value);
            setSelectedId(undefined);
          }}
        >
          <option value="">{t('kaspiAll')}</option>
          {KaspiRequestStatusSchema.options.map((value) => (
            <option key={value} value={value}>
              {t(`kaspiStatus_${value}`)}
            </option>
          ))}
        </select>
      </label>
      <button
        className="btn-secondary px-3 py-2"
        disabled={busy}
        onClick={() => void refresh().catch(() => setError(true))}
      >
        {t('guestCheckStatus')}
      </button>
      <ul className="space-y-2">
        {page.items.map((item) => (
          <li key={item.requestId}>
            <button
              type="button"
              className="w-full break-all border border-[var(--border)] p-3 text-left"
              onClick={() => {
                setSelectedId(item.requestId);
                setAmount(String(item.amount));
                setRefundAmount(String((item.receipt?.amount ?? 0) - item.refundedAmount));
                setReason('');
                setReference('');
                setReceivedAt('');
                setMatchingBasis('');
                setHistory({ items: [], hasMore: false });
                void loadHistory(item.requestId).catch(() => setError(true));
              }}
            >
              {item.requestId} · {t(`kaspiType_${item.type}`)} · {formatKzt(item.amount)}
              <br />
              {item.payerDisplayName ?? item.accountId ?? item.guestSubjectId} · {item.subjectId} ·{' '}
              {date(item.createdAt.seconds)} · {t(`kaspiStatus_${item.status}`)}
            </button>
          </li>
        ))}
      </ul>
      {page.hasMore && (
        <button
          className="btn-secondary px-3 py-2"
          disabled={busy}
          onClick={() => void refresh(page.nextCursor).catch(() => setError(true))}
        >
          {t('kaspiMore')}
        </button>
      )}
      {selected && (
        <AdminModal
          title={t('kaspiAdminTitle')}
          closeLabel={t('closeBtn')}
          onClose={() => setSelectedId(undefined)}
          closeDisabled={busy}
          width="lg"
        >
          <div className="space-y-3 p-4">
            <p className="break-all">
              {selected.requestId} · {formatKzt(selected.amount)} ·{' '}
              {t(`kaspiStatus_${selected.status}`)}
            </p>
            <p>
              {selected.payerDisplayName ?? selected.accountId ?? selected.guestSubjectId} ·{' '}
              {selected.subjectId}
            </p>
            {selected.receipt && (
              <p>
                {t('kaspiBankReference')}: {selected.receipt.bankReference} ·{' '}
                {formatKzt(selected.receipt.amount)} · {date(selected.receipt.receivedAt.seconds)} ·{' '}
                {selected.receipt.matchingBasis}
              </p>
            )}
            {selected.refundAmount && (
              <p>
                {t('kaspiRefundAmount')}: {formatKzt(selected.refundAmount)} ·{' '}
                {selected.refundReason}
              </p>
            )}
            <label className="block">
              {t('kaspiReason')}
              <textarea
                className="ui-field-plain block w-full"
                maxLength={1000}
                value={reason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {(!selected.receipt || selected.status === 'refund_required') && (
              <>
                {!selected.receipt && (
                  <label className="block">
                    {t('kaspiActualAmount')}
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className="ui-field-plain block"
                      value={amount}
                      disabled={busy}
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </label>
                )}
                <label className="block">
                  {t(selected.status === 'refund_required' ? 'kaspiRefundAt' : 'kaspiReceivedAt')}
                  <input
                    type="datetime-local"
                    className="ui-field-plain block max-w-full"
                    value={receivedAt}
                    disabled={busy}
                    onChange={(event) => setReceivedAt(event.target.value)}
                  />
                </label>
                <label className="block">
                  {t('kaspiBankReference')}
                  <input
                    className="ui-field-plain block w-full"
                    maxLength={128}
                    value={reference}
                    disabled={busy}
                    onChange={(event) => setReference(event.target.value)}
                  />
                </label>
                {!selected.receipt && (
                  <label className="block">
                    {t('kaspiMatchingBasis')}
                    <textarea
                      className="ui-field-plain block w-full"
                      maxLength={1000}
                      value={matchingBasis}
                      disabled={busy}
                      onChange={(event) => setMatchingBasis(event.target.value)}
                    />
                  </label>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-2">
              {!selected.receipt && (
                <>
                  {(['confirm', 'clarify', 'reject'] as const).map((action) => (
                    <button
                      key={action}
                      className="btn-secondary px-3 py-2"
                      disabled={busy || !reason.trim()}
                      onClick={() => prepare(action)}
                    >
                      {t(`kaspiAction_${action}`)}
                    </button>
                  ))}
                </>
              )}
              {(selected.status === 'confirmed' ||
                (selected.status === 'refunded' &&
                  selected.refundedAmount < (selected.receipt?.amount ?? 0))) && (
                <>
                  <label className="block">
                    {t('kaspiRefundAmount')}
                    <input
                      type="number"
                      min="1"
                      step="1"
                      max={(selected.receipt?.amount ?? 0) - selected.refundedAmount}
                      className="ui-field-plain block"
                      value={refundAmount}
                      disabled={busy}
                      onChange={(event) => setRefundAmount(event.target.value)}
                    />
                  </label>
                  <button
                    className="btn-secondary px-3 py-2"
                    disabled={busy || !reason.trim()}
                    onClick={() => prepare('require_refund')}
                  >
                    {t('kaspiAction_require_refund')}
                  </button>
                </>
              )}
              {selected.status === 'refund_required' && (
                <button
                  className="btn-primary px-3 py-2"
                  disabled={busy || !reason.trim()}
                  onClick={() => prepare('record_refund')}
                >
                  {t('kaspiAction_record_refund')}
                </button>
              )}
            </div>
            <h4>{t('kaspiAudit')}</h4>
            <ul>
              {history.items.map((item) => (
                <li key={item.id}>
                  {date(item.at.seconds)} · {t(`kaspiStatus_${item.status}`)} · {item.reason}
                </li>
              ))}
            </ul>
            {history.hasMore && (
              <button
                className="btn-secondary px-3 py-2"
                onClick={() =>
                  void loadHistory(selected.requestId, history.nextCursor).catch(() =>
                    setError(true)
                  )
                }
              >
                {t('kaspiMore')}
              </button>
            )}
          </div>
          {pending && (
            <AdminModal
              title={t('confirmAction')}
              closeLabel={t('closeBtn')}
              onClose={() => setPending(undefined)}
              closeDisabled={busy}
            >
              <div className="space-y-3 p-4">
                <p>{t('kaspiFinancialConfirm')}</p>
                {pending.action === 'require_refund' && selected.type === 'wallet_topup' && (
                  <p>{t('kaspiWalletRefundPreparation')}</p>
                )}
                <p className="break-all">
                  {pending.requestId} · {t(`kaspiAction_${pending.action}`)} ·{' '}
                  {formatKzt(
                    pending.receipt?.amount ??
                      pending.refundAmount ??
                      selected.refundAmount ??
                      selected.amount
                  )}
                </p>
                <p>{pending.receipt?.bankReference ?? pending.refundBankReference}</p>
                <p>{pending.reason}</p>
                <button
                  className="btn-primary px-4 py-2"
                  disabled={busy}
                  onClick={() => void confirm()}
                >
                  {busy ? t('processing') : t('confirm')}
                </button>
              </div>
            </AdminModal>
          )}
        </AdminModal>
      )}
    </section>
  );
}
