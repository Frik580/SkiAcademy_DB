import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { UserProfile } from '../../../types';
import {
  ADMIN_FINANCE_ACCOUNT_QUERY_KEY,
  ADMIN_FINANCE_PAYMENT_QUERY_KEY,
} from '../adminNavigation';
import { CanonicalFinancePanel } from '../components/finance/CanonicalFinancePanel';
import { useAdminFinanceTranslations } from '../components/finance/useAdminFinanceTranslations';
import type { AdminGuestFinanceRow } from './adminGuestFinanceRows';

interface CanonicalGuestFinancePanelProps {
  readonly adminAccountId: string;
  readonly rows: readonly AdminGuestFinanceRow[];
  readonly accounts: UserProfile[];
  readonly onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

export function CanonicalGuestFinancePanel({
  adminAccountId,
  rows,
  accounts,
  onRequestConfirm,
}: CanonicalGuestFinancePanelProps) {
  const { t } = useAdminFinanceTranslations();
  const [, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? '');
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedId('');
      return;
    }
    if (!rows.some((row) => row.id === selectedId)) {
      setSelectedId(rows[0]?.id ?? '');
    }
  }, [rows, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (selected.payerAccountId) {
          next.set(ADMIN_FINANCE_ACCOUNT_QUERY_KEY, selected.payerAccountId);
        } else {
          next.delete(ADMIN_FINANCE_ACCOUNT_QUERY_KEY);
        }
        if (selected.paymentId) {
          next.set(ADMIN_FINANCE_PAYMENT_QUERY_KEY, selected.paymentId);
        } else {
          next.delete(ADMIN_FINANCE_PAYMENT_QUERY_KEY);
        }
        return next;
      },
      { replace: true }
    );
  }, [selected, setSearchParams]);

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-mono text-[var(--ink-dim)] leading-relaxed">
        {t('canonicalGuestFinanceHint')}
      </p>
      <select
        value={selected?.id ?? ''}
        onChange={(event) => setSelectedId(event.target.value)}
        className="w-full px-3 py-2 border border-[var(--border)] bg-transparent text-xs font-mono"
      >
        {rows.length === 0 ? <option value="">—</option> : null}
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.label} · {row.identityState === 'linked_guest'
              ? t('canonicalGuestFinanceLinked')
              : t('canonicalGuestFinanceUnlinked')}{' '}
            · {row.status} · {row.amountKzt} ₸
          </option>
        ))}
      </select>
      {selected ? (
        <div className="border border-[var(--border)] p-3 text-xs font-mono space-y-1">
          <div>{selected.label}</div>
          <div>
            {selected.date} {selected.time} · {selected.status} · {selected.serviceKind}
          </div>
          <div>Payment obligation / settled display: {selected.amountKzt} ₸</div>
          {selected.payerAccountId ? <div>Account: {selected.payerAccountId}</div> : null}
          {selected.paymentId ? <div>Payment: {selected.paymentId}</div> : null}
        </div>
      ) : null}
      <CanonicalFinancePanel
        adminAccountId={adminAccountId}
        accounts={accounts}
        onRequestConfirm={onRequestConfirm}
      />
    </div>
  );
}
