import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  KaspiConfigurationInput,
  KaspiGuestInput,
  KaspiPage,
  KaspiPublicRequest,
} from './kaspiContracts';
import {
  claimKaspiRequest,
  createKaspiRequest,
  kaspiConfiguration,
  loadKaspiRequests,
} from './kaspiService';
import { useKaspiTranslations } from './useKaspiTranslations';

const statusKey = (status: KaspiPublicRequest['status']) => `kaspiStatus_${status}` as const;
export function KaspiPaymentPanel({
  accountId = '',
  guest,
  canCreate = true,
}: {
  accountId?: string;
  guest?: KaspiGuestInput;
  canCreate?: boolean;
}) {
  const { t, formatKzt } = useKaspiTranslations();
  const [configuration, setConfiguration] = useState<KaspiConfigurationInput>();
  const [page, setPage] = useState<KaspiPage<KaspiPublicRequest>>({ items: [], hasMore: false });
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(Date.now);
  const lock = useRef(false);
  const attempt = useRef<string>();
  const guestType = guest?.type;
  const subjectId = guest?.subjectId;
  useEffect(() => {
    const deadlines = page.items
      .map(
        (item) => item.expiresAt?.seconds * 1000 + (item.expiresAt?.nanoseconds ?? 0) / 1_000_000
      )
      .filter((deadline) => deadline > Date.now());
    if (!deadlines.length) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(2_147_483_647, Math.min(...deadlines) - Date.now() + 1)
    );
    return () => clearTimeout(timer);
  }, [page.items, now]);
  const refresh = useCallback(
    async (cursor?: string) => {
      const [config, result] = await Promise.all([
        kaspiConfiguration(),
        loadKaspiRequests(
          guestType && subjectId ? { type: guestType, subjectId } : undefined,
          cursor
        ),
      ]);
      setConfiguration(config);
      setPage((previous) =>
        cursor ? { ...result, items: [...previous.items, ...result.items] } : result
      );
    },
    [guestType, subjectId]
  );
  useEffect(() => {
    let active = true;
    void Promise.all([
      kaspiConfiguration(),
      loadKaspiRequests(guestType && subjectId ? { type: guestType, subjectId } : undefined),
    ])
      .then(([config, result]) => {
        if (active) {
          setConfiguration(config);
          setPage(result);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [guestType, subjectId, canCreate]);
  async function run(action: () => Promise<void>, reload = true) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(false);
    try {
      await action();
      if (reload) await refresh();
    } catch {
      setError(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const current = page.items.find(
    (item) =>
      ['awaiting_payment', 'requires_clarification'].includes(item.status) &&
      item.expiresAt?.seconds * 1000 > now
  );
  const activeRequest = page.items.some((item) =>
    ['awaiting_payment', 'payment_claimed', 'requires_clarification', 'refund_required'].includes(
      item.status
    )
  );
  const validAmount = Number.isSafeInteger(Number(amount)) && Number(amount) > 0;
  return (
    <section
      className="space-y-3 border border-[var(--border)] bg-[var(--card-bg)] p-4 text-[var(--ink)]"
      aria-label={t('kaspiTitle')}
    >
      <h3 className="type-card-title">{t('kaspiTitle')}</h3>
      {error && <p role="alert">{t('kaspiError')}</p>}
      {!configuration ? (
        <p role="status">{t('processing')}</p>
      ) : !configuration.enabled ? (
        <p>{t('kaspiUnavailable')}</p>
      ) : (
        <>
          <p className="type-compact">{t('kaspiManualNotice')}</p>
          {!activeRequest && canCreate && (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const id = attempt.current ?? crypto.randomUUID();
                  attempt.current = id;
                  await createKaspiRequest(id, accountId, Number(amount), guest);
                  attempt.current = undefined;
                });
              }}
            >
              {!guest && (
                <label className="type-caption">
                  {t('kaspiAmount')}
                  <input
                    className="ui-field-plain block"
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={amount}
                    disabled={busy}
                    onChange={(event) => {
                      setAmount(event.target.value);
                      attempt.current = undefined;
                    }}
                  />
                </label>
              )}
              <button
                type="submit"
                className="btn-primary px-4 py-2"
                disabled={busy || (!guest && !validAmount)}
              >
                {t(guest ? 'kaspiOpenPayment' : 'kaspiTopup')}
              </button>
            </form>
          )}
          {current && current.merchantKey === configuration.merchantKey && (
            <div className="space-y-2">
              <p>
                {configuration.merchantName} · {formatKzt(current.amount)}
              </p>
              <p className="break-all type-caption">
                {t('kaspiRequest')}: {current.requestId}
              </p>
              <img
                src={configuration.qrImageUrl}
                alt={t('kaspiQrAlt')}
                className="h-56 w-56 max-w-full bg-white object-contain"
                referrerPolicy="no-referrer"
              />
              <p className="type-compact">{t('kaspiHoldNotice')}</p>
              <button
                type="button"
                className="btn-primary px-4 py-2"
                disabled={busy}
                onClick={() => void run(() => claimKaspiRequest(current, accountId, guest))}
              >
                {t('kaspiIHavePaid')}
              </button>
            </div>
          )}
          {current && current.merchantKey !== configuration.merchantKey && (
            <p>{t('kaspiMerchantChanged')}</p>
          )}
        </>
      )}
      <ul className="space-y-2">
        {page.items.map((item) => (
          <li key={item.requestId} className="border-t border-[var(--border)] pt-2 type-compact">
            <span className="break-all">{item.requestId}</span> · {formatKzt(item.amount)} ·{' '}
            <span>
              {t(
                statusKey(
                  item.status === 'awaiting_payment' && item.expiresAt?.seconds * 1000 <= now
                    ? 'expired'
                    : item.status
                )
              )}
            </span>
            {item.status === 'payment_claimed' && <p>{t('kaspiAwaitingReview')}</p>}
            {(item.status === 'expired' ||
              (item.status === 'awaiting_payment' && item.expiresAt?.seconds * 1000 <= now)) &&
              !item.claimedAt && (
                <button
                  type="button"
                  className="btn-secondary ml-2 px-3 py-2"
                  disabled={busy}
                  onClick={() => void run(() => claimKaspiRequest(item, accountId, guest))}
                >
                  {t('kaspiReportPastPayment')}
                </button>
              )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          className="btn-secondary px-3 py-2"
          onClick={() => void run(async () => {})}
        >
          {t(guest ? 'kaspiRefreshPayment' : 'guestCheckStatus')}
        </button>
        {page.hasMore && (
          <button
            type="button"
            disabled={busy}
            className="btn-secondary px-3 py-2"
            onClick={() => void run(() => refresh(page.nextCursor), false)}
          >
            {t('kaspiMore')}
          </button>
        )}
      </div>
    </section>
  );
}
