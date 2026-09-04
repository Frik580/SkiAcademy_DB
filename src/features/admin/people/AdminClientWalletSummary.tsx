import type { AdminClientWalletSummaryView } from './adminClientContracts';
import { formatAdminClientKzt } from './adminClientLabels';
import type { useAdminClientTranslations } from './useAdminClientTranslations';

interface AdminClientWalletSummaryProps {
  readonly wallet?: AdminClientWalletSummaryView;
  readonly loading: boolean;
  readonly locale: string;
  readonly text: ReturnType<typeof useAdminClientTranslations>['text'];
  readonly onOpenFinance: () => void;
}

export function AdminClientWalletSummary({
  wallet,
  loading,
  locale,
  text,
  onOpenFinance,
}: AdminClientWalletSummaryProps) {
  return (
    <section className="space-y-2 border border-[var(--border)] p-4">
      <h4 className="text-sm font-medium">{text.finance}</h4>
      {loading ? <p className="text-xs text-[var(--ink-dim)]">{text.loading}</p> : null}
      {!loading && wallet && wallet.exists ? (
        <p className="font-mono text-sm" data-testid="admin-client-wallet-balance">
          {formatAdminClientKzt(wallet.balance, locale)}
        </p>
      ) : null}
      {!loading && wallet && !wallet.exists ? (
        <p className="text-xs text-[var(--ink-dim)]" data-testid="admin-client-wallet-missing">
          {text.walletMissing}
        </p>
      ) : null}
      {!loading && !wallet ? (
        <p className="text-xs text-[var(--ink-dim)]">{text.walletUnavailable}</p>
      ) : null}
      <button
        type="button"
        onClick={onOpenFinance}
        className="border border-[var(--border)] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider"
      >
        {text.openFinance}
      </button>
    </section>
  );
}
