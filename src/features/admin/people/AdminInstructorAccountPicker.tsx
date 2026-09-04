import type { AccountId, AdminAccountListItem } from '@ski-academy/shared-domain';
import { Loader2, Search } from 'lucide-react';
import type { useAdminInstructorTranslations } from './useAdminInstructorTranslations';

export interface AdminInstructorAccountPickerOption {
  readonly accountId: AccountId;
  readonly displayName: string;
  readonly email?: string;
  readonly lifecycle: AdminAccountListItem['lifecycle'];
  readonly revision: number;
  readonly linked: boolean;
}

interface AdminInstructorAccountPickerProps {
  readonly search: string;
  readonly options: readonly AdminInstructorAccountPickerOption[];
  readonly selectedAccountId?: AccountId;
  readonly loading: boolean;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly text: ReturnType<typeof useAdminInstructorTranslations>['text'];
  readonly onSearchChange: (value: string) => void;
  readonly onSelect: (option: AdminInstructorAccountPickerOption) => void;
  readonly onLoadMore: () => void;
}

function lifecycleLabel(
  lifecycle: AdminAccountListItem['lifecycle'],
  text: AdminInstructorAccountPickerProps['text']
): string {
  if (lifecycle === 'disabled') return text.accountDisabled;
  if (lifecycle === 'uninitialized') return text.accountUninitialized;
  return text.accountActive;
}

export function AdminInstructorAccountPicker({
  search,
  options,
  selectedAccountId,
  loading,
  hasMore,
  loadingMore,
  text,
  onSearchChange,
  onSelect,
  onLoadMore,
}: AdminInstructorAccountPickerProps) {
  const selectable = options.filter((option) => !option.linked && option.lifecycle === 'active');
  const unavailable = options.filter((option) => !option.linked && option.lifecycle !== 'active');

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium">{text.pickAccount}</p>
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
          {text.emptyAccounts}
        </p>
      ) : null}
      {selectable.length > 0 ? (
        <ul className="max-h-56 space-y-1 overflow-y-auto border border-[var(--border)] p-2">
          {selectable.map((option) => {
            const selected = selectedAccountId === option.accountId;
            return (
              <li key={option.accountId}>
                <button
                  type="button"
                  onClick={() => onSelect(option)}
                  className={`w-full border p-2 text-left text-xs ${
                    selected ? 'border-[var(--ink)]' : 'border-[var(--border)]'
                  }`}
                >
                  <span className="block font-medium">{option.displayName}</span>
                  {option.email ? (
                    <span className="block font-mono text-[10px] text-[var(--ink-dim)]">
                      {option.email}
                    </span>
                  ) : null}
                  <span className="mt-1 inline-block font-mono text-[9px] uppercase text-[var(--ink-dim)]">
                    {lifecycleLabel(option.lifecycle, text)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {unavailable.length > 0 ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto border border-[var(--border)] p-2 opacity-70">
          {unavailable.map((option) => (
            <li key={option.accountId} className="border border-[var(--border)] p-2 text-xs">
              <span className="block font-medium">{option.displayName}</span>
              {option.email ? (
                <span className="block font-mono text-[10px] text-[var(--ink-dim)]">
                  {option.email}
                </span>
              ) : null}
              <span className="mt-1 inline-block font-mono text-[9px] uppercase text-[var(--ink-dim)]">
                {lifecycleLabel(option.lifecycle, text)} · {text.accountUnavailableForLink}
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
          className="border border-[var(--border)] px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider disabled:opacity-50"
        >
          {loadingMore ? text.loading : text.loadMore}
        </button>
      ) : null}
    </div>
  );
}
