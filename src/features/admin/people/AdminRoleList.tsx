import {
  canDemoteCanonicalAccountAdminRole,
  type AccountId,
} from '@ski-academy/shared-domain';
import { Loader2, UserMinus } from 'lucide-react';
import type { AdminRoleDirectoryRow } from './adminRoleContracts';
import type { useAdminRoleTranslations } from './useAdminRoleTranslations';

interface AdminRoleListProps {
  readonly rows: readonly AdminRoleDirectoryRow[];
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly hasMore: boolean;
  readonly pending: boolean;
  readonly text: ReturnType<typeof useAdminRoleTranslations>['text'];
  readonly onLoadMore: () => void;
  readonly onOpenClient: (accountId: AccountId) => void;
  readonly onDemote: (row: AdminRoleDirectoryRow) => void;
}

function lifecycleLabel(
  lifecycle: AdminRoleDirectoryRow['lifecycle'],
  text: AdminRoleListProps['text']
): string {
  if (lifecycle === 'disabled') return text.lifecycleDisabled;
  if (lifecycle === 'uninitialized') return text.lifecycleUninitialized;
  return text.lifecycleActive;
}

export function AdminRoleList({
  rows,
  loading,
  loadingMore,
  hasMore,
  pending,
  text,
  onLoadMore,
  onOpenClient,
  onDemote,
}: AdminRoleListProps) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-[var(--ink-dim)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {text.loading}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-[var(--border)] py-6 text-center font-mono text-xs text-[var(--ink-dim)]">
        {text.noAdministrators}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {rows.map((row) => {
          const isOwner = row.role.systemRole === 'owner';
          const canDemote = canDemoteCanonicalAccountAdminRole(row);
          const instructor =
            row.instructorLink.isInstructor || Boolean(row.instructorLink.instructorId);
          return (
            <li
              key={row.accountId}
              className="flex flex-col gap-2 border border-[var(--border)] p-3.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-xs font-bold text-[var(--ink)]">
                    {row.displayName || text.unnamed}
                  </span>
                  {isOwner ? (
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink)]">
                      {text.ownerBadge}
                    </span>
                  ) : null}
                  {instructor ? (
                    <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-dim)]">
                      {text.instructorBadge}
                    </span>
                  ) : null}
                </div>
                {row.email ? (
                  <span className="block truncate font-mono text-[10px] text-[var(--ink-dim)]">
                    {row.email}
                  </span>
                ) : null}
                <div className="flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-dim)]">
                  <span>{text.roleAdmin}</span>
                  <span>{lifecycleLabel(row.lifecycle, text)}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenClient(row.accountId)}
                  className="border border-[var(--border)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]"
                >
                  {text.openClient}
                </button>
                {canDemote ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onDemote(row)}
                    title={text.revokeAdmin}
                    className="inline-flex items-center gap-1 border border-[var(--border)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-rose-600 disabled:opacity-50"
                  >
                    <UserMinus className="h-3.5 w-3.5" />
                    {text.revokeAdmin}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
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
    </div>
  );
}
