import {
  AccountIdSchema,
  changeAccountRoleAuthorizedAction,
  type AccountId,
  type AdminAccountListItem,
} from '@ski-academy/shared-domain';
import { Loader2, Shield, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toCanonicalCommandClientError } from '../../../lib/canonical/mapCanonicalCommandError';
import { ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS } from '../identity/accountDirectorySearch';
import { executeAdminIdentityAttempt } from '../identity/useAdminIdentityCommands';
import { useAdminIdentityReadModels } from '../identity/useAdminIdentityReadModels';
import { adminClientAccountSearchParams } from '../adminNavigation';
import {
  ADMIN_ROLE_DEMOTE_REASON,
  ADMIN_ROLE_DIRECTORY_PAGE_SIZE,
  ADMIN_ROLE_PROMOTE_REASON,
  adminRoleAttemptKey,
  type AdminRoleDirectoryRow,
} from './adminRoleContracts';
import { AdminRoleAccountPicker } from './AdminRoleAccountPicker';
import { AdminRoleList } from './AdminRoleList';
import { useAdminRoleTranslations } from './useAdminRoleTranslations';

interface AdminRoleDirectoryProps {
  readonly adminAccountId: string;
  readonly onRequestConfirm: (message: string, onConfirm: () => void | Promise<void>) => void;
}

function toRow(item: AdminAccountListItem): AdminRoleDirectoryRow {
  return {
    accountId: item.accountId,
    displayName: item.displayName,
    ...(item.email ? { email: item.email } : {}),
    lifecycle: item.lifecycle,
    role: item.role,
    instructorLink: item.instructorLink,
    authorizedActions: item.authorizedActions,
    diagnosticCount: item.diagnosticCount,
    ...(item.revision === undefined ? {} : { revision: item.revision }),
  };
}

export function AdminRoleDirectory({ adminAccountId, onRequestConfirm }: AdminRoleDirectoryProps) {
  const { text } = useAdminRoleTranslations();
  const [, setSearchParams] = useSearchParams();
  const [showAdd, setShowAdd] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [debouncedCandidateSearch, setDebouncedCandidateSearch] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<AccountId | undefined>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const parsedAdminAccountId = AccountIdSchema.safeParse(adminAccountId);

  useEffect(() => {
    if (candidateSearch.trim() === '') {
      setDebouncedCandidateSearch('');
      return;
    }
    const handle = window.setTimeout(() => {
      setDebouncedCandidateSearch(candidateSearch);
    }, ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [candidateSearch]);

  const appliedCandidateSearch = candidateSearch.trim() === '' ? '' : debouncedCandidateSearch;

  const adminReads = useAdminIdentityReadModels({
    enabled: true,
    directory: 'accounts',
    search: '',
    pageSize: ADMIN_ROLE_DIRECTORY_PAGE_SIZE,
    role: 'admin',
    ...(parsedAdminAccountId.success ? { selectedAccountId: parsedAdminAccountId.data } : {}),
  });

  const candidateReads = useAdminIdentityReadModels({
    enabled: showAdd,
    directory: 'accounts',
    search: appliedCandidateSearch,
    pageSize: ADMIN_ROLE_DIRECTORY_PAGE_SIZE,
  });

  const adminRows = adminReads.accounts.items.map(toRow);
  const candidateRows = candidateReads.accounts.items.map(toRow);
  const actorIsOwner = adminReads.accountDetail?.role.systemRole === 'owner';
  const hasAuthorizedRoleMutation = adminRows.some((row) =>
    Boolean(changeAccountRoleAuthorizedAction(row.authorizedActions))
  );
  // Owner may be the only admin row (no change_account_role on self). Still show Add.
  const actorCanMutateRoles = Boolean(actorIsOwner) || hasAuthorizedRoleMutation;

  const refreshDirectories = async () => {
    await adminReads.refresh();
    if (showAdd) await candidateReads.refresh();
  };

  const runRoleChange = async (
    row: AdminRoleDirectoryRow,
    role: 'admin' | 'user',
    reasonExplanation: string
  ) => {
    const action = changeAccountRoleAuthorizedAction(row.authorizedActions);
    if (!action) {
      setError(text.mutationFailed);
      return;
    }
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await executeAdminIdentityAttempt(adminAccountId, {
        kind: 'change_account_role',
        accountId: row.accountId,
        role,
        reasonExplanation,
        expectedRevision: action.expectedRevision,
        idempotencyKey: adminRoleAttemptKey(role === 'admin' ? 'promote' : 'demote'),
      });
      setNotice(text.saved);
      setShowAdd(false);
      setSelectedCandidateId(undefined);
      setCandidateSearch('');
      await refreshDirectories();
    } catch (caught) {
      const clientError = toCanonicalCommandClientError(caught, 'admin_identity');
      if (clientError.code === 'stale_version') {
        setError(text.stale);
        await refreshDirectories();
      } else {
        setError(clientError.message || text.mutationFailed);
      }
    } finally {
      setPending(false);
    }
  };

  const onDemote = (row: AdminRoleDirectoryRow) => {
    const label = row.email || row.displayName || row.accountId;
    onRequestConfirm(`${text.revokeConfirmPrefix} ${label}?`, async () => {
      await runRoleChange(row, 'user', ADMIN_ROLE_DEMOTE_REASON);
    });
  };

  const onConfirmPromote = () => {
    const selected = candidateRows.find((row) => row.accountId === selectedCandidateId);
    if (!selected) return;
    if (!changeAccountRoleAuthorizedAction(selected.authorizedActions)) {
      setError(text.mutationFailed);
      return;
    }
    const label = selected.email || selected.displayName || selected.accountId;
    onRequestConfirm(`${text.promoteConfirmPrefix} ${label}?`, async () => {
      await runRoleChange(selected, 'admin', ADMIN_ROLE_PROMOTE_REASON);
    });
  };

  const onOpenClient = (accountId: AccountId) => {
    setSearchParams((previous) => adminClientAccountSearchParams(previous, accountId), {
      replace: true,
    });
  };

  const listError =
    adminReads.accounts.error === 'permission-denied'
      ? text.permissionDenied
      : adminReads.accounts.error === 'read-failed'
        ? text.readFailed
        : undefined;

  return (
    <div className="space-y-4 font-mono">
      {!actorCanMutateRoles && !adminReads.accounts.loading ? (
        <div className="flex items-start gap-2.5 border border-[var(--border)] bg-black/5 p-4 text-xs text-[var(--ink)] dark:bg-white/5">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-dim)]" />
          <div>
            <p className="font-bold">{text.ownerOnlyMutations}</p>
          </div>
        </div>
      ) : null}

      {listError ? (
        <div className="space-y-2 border border-[var(--border)] p-3 text-xs text-[var(--ink)]">
          <p>{listError}</p>
          <button
            type="button"
            onClick={() => void adminReads.refresh()}
            className="border border-[var(--border)] px-3 py-1.5 font-bold uppercase tracking-wider"
          >
            {text.retry}
          </button>
        </div>
      ) : null}

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      {notice ? <p className="text-xs text-[var(--ink-dim)]">{notice}</p> : null}

      <div className="space-y-3">
        <h4 className="text-[10px] uppercase tracking-wider text-[var(--ink-dim)]">
          {text.currentAdministrators}
        </h4>
        <AdminRoleList
          rows={adminRows}
          loading={adminReads.accounts.loading}
          loadingMore={adminReads.accounts.loadingMore}
          hasMore={adminReads.accounts.hasMore}
          pending={pending}
          text={text}
          onLoadMore={() => adminReads.loadMore()}
          onOpenClient={onOpenClient}
          onDemote={onDemote}
        />
      </div>

      {actorCanMutateRoles ? (
        <div className="space-y-3">
          {!showAdd ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setShowAdd(true);
                setError(undefined);
                setNotice(undefined);
              }}
              className="inline-flex items-center gap-1.5 border border-[var(--border)] px-3 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {text.addAdministrator}
            </button>
          ) : (
            <AdminRoleAccountPicker
              search={candidateSearch}
              options={candidateRows}
              selectedAccountId={selectedCandidateId}
              loading={candidateReads.accounts.loading}
              hasMore={candidateReads.accounts.hasMore}
              loadingMore={candidateReads.accounts.loadingMore}
              pending={pending}
              text={text}
              onSearchChange={(value) => {
                setCandidateSearch(value);
                setSelectedCandidateId(undefined);
              }}
              onSelect={(row) => setSelectedCandidateId(row.accountId)}
              onLoadMore={() => candidateReads.loadMore()}
              onConfirm={onConfirmPromote}
              onCancel={() => {
                setShowAdd(false);
                setSelectedCandidateId(undefined);
                setCandidateSearch('');
              }}
            />
          )}
        </div>
      ) : null}

      {pending ? (
        <p className="flex items-center gap-2 text-xs text-[var(--ink-dim)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          {text.pending}
        </p>
      ) : null}
    </div>
  );
}
