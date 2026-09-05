import {
  isCanonicalAccountEligibleForAdminRolePromotion,
  type AccountId,
} from '@ski-academy/shared-domain';
import { Loader2, Search } from 'lucide-react';
import type { AdminRoleCandidateRow } from './adminRoleContracts';
import type { useAdminRoleTranslations } from './useAdminRoleTranslations';

interface AdminRoleAccountPickerProps {
  readonly search: string;
  readonly options: readonly AdminRoleCandidateRow[];
  readonly selectedAccountId?: AccountId;
  readonly loading: boolean;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly pending: boolean;
  readonly text: ReturnType<typeof useAdminRoleTranslations>['text'];
  readonly onSearchChange: (value: string) => void;
  readonly onSelect: (row: AdminRoleCandidateRow) => void;
  readonly onLoadMore: () => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

function lifecycleLabel(
  lifecycle: AdminRoleCandidateRow['lifecycle'],
  text: AdminRoleAccountPickerProps['text']
): string {
  if (lifecycle === 'disabled') return text.lifecycleDisabled;
  if (lifecycle === 'uninitialized') return text.lifecycleUninitialized;
  return text.lifecycleActive;
}

export function AdminRoleAccountPicker({
  search,
  options,
  selectedAccountId,
  loading,
  hasMore,
  loadingMore,
  pending,
  text,
  onSearchChange,
  onSelect,
  onLoadMore,
  onConfirm,
  onCancel,
}: AdminRoleAccountPickerProps) {
  const selectable = options.filter((option) =>
    isCanonicalAccountEligibleForAdminRolePromotion(option)
  );
  const unavailable = options.filter(
    (option) => !isCanonicalAccountEligibleForAdminRolePromotion(option)
  );
  const selected = selectable.find((option) => option.accountId === selectedAccountId);

  return (
    <div className="space-y-3 border border-[var(--border)] p-4">
      <p className="text-xs font-medium text-[var(--ink)]">{text.pickAccount}</p>
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-dim)]" />
        <input
          type="search"
          aria-label={text.accountSearch}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={text.accountSearchHint}
          className="w-full border border-[var(--border)] bg-transparent py-2 pl-10 pr-4 font-mono text-xs text-[var(--ink)] placeholder-[var(--ink-dim)] focus:border-[var(--ink)] focus:outline-none"
        />
      </div>
      {loading ? (
        <p className="flex items-center gap-2 text-xs text-[var(--ink-dim)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          {text.loading}
        </p>
      ) : null}
      {!loading && selectable.length === 0 ? (
        <p className="border border-[var(--border)] py-4 text-center font-mono text-xs text-[var(--ink-dim)]">
          {text.emptyCandidates}
        </p>
      ) : null}
      {selectable.length > 0 ? (
        <ul className="max-h-56 space-y-1 overflow-y-auto border border-[var(--border)] p-2">
          {selectable.map((option) => {
            const isSelected = selectedAccountId === option.accountId;
            return (
              <li key={option.accountId}>
                <button
                  type="button"
                  onClick={() => onSelect(option)}
                  className={`w-full border p-2 text-left text-xs ${
                    isSelected ? 'border-[var(--ink)]' : 'border-[var(--border)]'
                  }`}
                >
                  <span className="block font-medium text-[var(--ink)]">{option.displayName}</span>
                  {option.email ? (
                    <span className="block font-mono text-[10px] text-[var(--ink-dim)]">
                      {option.email}
                    </span>
                  ) : null}
                  <span className="mt-1 inline-block font-mono text-[9px] uppercase text-[var(--ink-dim)]">
                    {lifecycleLabel(option.lifecycle, text)} · {text.roleUser}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {unavailable.length > 0 ? (
        <ul className="max-h-32 space-y-1 overflow-y-auto border border-[var(--border)] p-2 opacity-70">
          {unavailable.map((option) => (
            <li key={option.accountId} className="border border-[var(--border)] p-2 text-xs">
              <span className="block font-medium">{option.displayName}</span>
              {option.email ? (
                <span className="block font-mono text-[10px] text-[var(--ink-dim)]">
                  {option.email}
                </span>
              ) : null}
              <span className="mt-1 inline-block font-mono text-[9px] uppercase text-[var(--ink-dim)]">
                {lifecycleLabel(option.lifecycle, text)} · {text.unavailableForPromote}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {hasMore ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={onLoadMore}
          className="border border-[var(--border)] px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider disabled:opacity-50"
        >
          {loadingMore ? text.loading : text.loadMore}
        </button>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!selected || pending}
          onClick={onConfirm}
          className="border border-[var(--border)] px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider disabled:opacity-50"
        >
          {pending ? text.pending : text.confirmPromote}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="border border-[var(--border)] px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider disabled:opacity-50"
        >
          {text.cancelAdd}
        </button>
      </div>
    </div>
  );
}
