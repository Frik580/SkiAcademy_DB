import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { queryAdminFinanceReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import type { AdminMonetaryEventPresentation } from '@ski-academy/shared-domain';
import { useAdminFinanceTranslations } from '../components/finance/useAdminFinanceTranslations';
import { ApplePagination } from '../../../ui/ApplePagination';
import {
  ADMIN_FINANCE_MOVEMENT_PERIOD_QUERY_KEY,
  parseAdminFinanceMovementPeriod,
} from '../adminNavigation';
import { formatDateLocalYMD } from '../components/schedule/scheduleUtils';
import { resolveAdminTimeZone } from '../operations/adminTimeZone';

function formatKzt(amount: number, locale: string): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${Math.abs(amount).toLocaleString(locale)} ₸`;
}

export function matchesSchoolMovementFilters(
  event: AdminMonetaryEventPresentation,
  search: string,
  direction: 'all' | 'in' | 'out' | 'neutral',
  sourceKind: string
): boolean {
  if (direction !== 'all' && event.direction !== direction) return false;
  if (sourceKind !== 'all' && event.sourceKind !== sourceKind) return false;
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [
    event.eventId,
    event.eventKind,
    event.sourceKind,
    event.paymentId,
    event.walletAccountId,
    event.subjectId,
    event.reasonCode,
    event.manualReference,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
}

export function CanonicalSchoolMovementPanel() {
  const { t, language } = useAdminFinanceTranslations();
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const [searchParams] = useSearchParams();
  const period = parseAdminFinanceMovementPeriod(
    searchParams.get(ADMIN_FINANCE_MOVEMENT_PERIOD_QUERY_KEY)
  );
  const localDate = formatDateLocalYMD(new Date());
  const timeZone = resolveAdminTimeZone();
  const [events, setEvents] = useState<AdminMonetaryEventPresentation[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<'all' | 'in' | 'out' | 'neutral'>('all');
  const [sourceKind, setSourceKind] = useState('all');
  const [page, setPage] = useState(1);

  const load = useCallback(
    async (nextCursor?: string, append = false) => {
      setLoading(true);
      try {
        const result = await queryAdminFinanceReadModels({
          scope: 'admin_school_movement',
          ...(nextCursor ? { cursor: nextCursor } : {}),
          ...(period ? { period, localDate, timeZone } : {}),
        });
        if (result.scope !== 'admin_school_movement') return;
        setEvents((current) =>
          append ? [...current, ...result.item.events] : [...result.item.events]
        );
        setHasMore(result.item.hasMore);
        setCursor(result.item.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [localDate, period, timeZone]
  );

  useEffect(() => {
    setPage(1);
    void load();
  }, [load]);

  const filtered = useMemo(
    () =>
      events.filter((event) => matchesSchoolMovementFilters(event, search, direction, sourceKind)),
    [direction, events, search, sourceKind]
  );
  const pageItems = filtered.slice((page - 1) * 20, page * 20);
  const sourceKinds = useMemo(
    () => ['all', ...new Set(events.map((event) => event.sourceKind))],
    [events]
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-[var(--ink-dim)]" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t('searchPlaceholder') || 'Search'}
            className="w-full pl-9 pr-3 py-2 border border-[var(--border)] bg-transparent text-xs font-mono"
          />
        </div>
        <select
          value={direction}
          onChange={(event) => {
            setDirection(event.target.value as typeof direction);
            setPage(1);
          }}
          className="px-3 py-2 border border-[var(--border)] bg-transparent text-xs font-mono"
        >
          <option value="all">all</option>
          <option value="in">in</option>
          <option value="out">out</option>
          <option value="neutral">neutral</option>
        </select>
        <select
          value={sourceKind}
          onChange={(event) => {
            setSourceKind(event.target.value);
            setPage(1);
          }}
          className="px-3 py-2 border border-[var(--border)] bg-transparent text-xs font-mono"
        >
          {sourceKinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </div>
      {loading ? <p className="text-xs font-mono text-[var(--ink-dim)]">Loading…</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] font-mono uppercase text-[var(--ink-dim)]">
              <th className="py-2 pr-2">time</th>
              <th className="py-2 pr-2">kind</th>
              <th className="py-2 pr-2">source</th>
              <th className="py-2 pr-2">subject</th>
              <th className="py-2 pr-2">payment</th>
              <th className="py-2 pr-2">wallet</th>
              <th className="py-2 pr-2 text-right">amount</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((event) => (
              <tr
                key={event.eventId}
                className="border-b border-[var(--border)]/40 text-xs font-mono"
              >
                <td className="py-2 pr-2 whitespace-nowrap">
                  {new Date(event.occurredAt.seconds * 1_000).toLocaleString(locale)}
                </td>
                <td className="py-2 pr-2">{event.eventKind}</td>
                <td className="py-2 pr-2">{event.sourceKind}</td>
                <td className="py-2 pr-2">{event.subjectType ?? '—'}</td>
                <td className="py-2 pr-2">{event.paymentId ?? '—'}</td>
                <td className="py-2 pr-2">{event.walletAccountId ?? '—'}</td>
                <td
                  className={`py-2 pr-2 text-right ${event.direction === 'out' ? 'text-rose-600' : ''}`}
                >
                  {event.direction === 'out' ? '-' : event.direction === 'in' ? '+' : ''}
                  {formatKzt(event.amount, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ApplePagination
        currentPage={page}
        totalPages={Math.max(1, Math.ceil(filtered.length / 20))}
        totalItems={filtered.length}
        itemsPerPage={20}
        onPageChange={setPage}
        itemLabel="events"
      />
      {hasMore ? (
        <button
          type="button"
          onClick={() => void load(cursor, true)}
          className="border border-[var(--border)] px-4 py-2 text-xs font-mono uppercase"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
