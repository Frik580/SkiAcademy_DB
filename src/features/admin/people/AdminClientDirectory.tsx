import {
  AccountIdSchema,
  ParticipantIdSchema,
  canonicalDeterministicHash,
  participantManagementIdFromGuestLink,
  type AccountId,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { Loader2, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toCanonicalCommandClientError } from '../../../lib/canonical/mapCanonicalCommandError';
import { ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS } from '../identity/accountDirectorySearch';
import { executeAdminIdentityAttempt } from '../identity/useAdminIdentityCommands';
import {
  useAdminIdentityReadModels,
  useAdminParticipantDetail,
} from '../identity/useAdminIdentityReadModels';
import {
  ADMIN_CLIENT_ACCOUNT_QUERY_KEY,
  adminFinanceAccountSearchParams,
} from '../adminNavigation';
import { useAdminWalletReadModel } from '../components/finance/useAdminFinanceReadModels';
import { parseAdminFinanceAccountId } from '../components/finance/financeContracts';
import {
  ADMIN_CLIENT_CONTACT_REASON,
  ADMIN_CLIENT_DEPENDENT_REASON,
  ADMIN_CLIENT_DIRECTORY_PAGE_SIZE,
  ADMIN_CLIENT_LIFECYCLE_REASON,
  ADMIN_CLIENT_PARTICIPANT_REASON,
  ADMIN_CLIENT_PROVISION_SELF_REASON,
  adminClientAttemptKey,
  type AdminClientContactDraft,
  type AdminClientDependentDraft,
  type AdminClientParticipantProfileDraft,
} from './adminClientContracts';
import { AdminClientAccountDetail } from './AdminClientAccountDetail';
import { AdminClientParticipantDetail } from './AdminClientParticipantDetail';
import { adminClientLifecycleLabel } from './adminClientLabels';
import { useAdminClientTranslations } from './useAdminClientTranslations';

interface AdminClientDirectoryProps {
  readonly adminAccountId: string;
}

const EMPTY_DEPENDENT: AdminClientDependentDraft = {
  displayName: '',
  birthDate: '',
  skillLevel: '',
  discipline: 'ski',
};

function entropy(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replaceAll('-', '');
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function profileDraftFromDetail(detail: {
  readonly profile: {
    readonly displayName: string;
    readonly age: { readonly kind: 'birth_date'; readonly birthDate: string } | { readonly kind: 'age_years'; readonly years: number };
    readonly skillLevel: string;
    readonly discipline: 'ski' | 'snowboard';
    readonly instructorComment?: string;
  };
}): AdminClientParticipantProfileDraft {
  return {
    displayName: detail.profile.displayName,
    birthDate: detail.profile.age.kind === 'birth_date' ? detail.profile.age.birthDate : '',
    skillLevel: detail.profile.skillLevel,
    discipline: detail.profile.discipline,
    instructorComment: detail.profile.instructorComment ?? '',
  };
}

export function AdminClientDirectory({ adminAccountId }: AdminClientDirectoryProps) {
  const { text, locale } = useAdminClientTranslations();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<AccountId | undefined>();
  const [selectedParticipantId, setSelectedParticipantId] = useState<ParticipantId | undefined>();
  const [contactEditing, setContactEditing] = useState(false);
  const [contactDraft, setContactDraft] = useState<AdminClientContactDraft>({
    displayName: '',
    phoneNumber: '',
  });
  const [dependentDraft, setDependentDraft] = useState<AdminClientDependentDraft>(EMPTY_DEPENDENT);
  const [participantDraft, setParticipantDraft] = useState<AdminClientParticipantProfileDraft>({
    displayName: '',
    birthDate: '',
    skillLevel: '',
    discipline: 'ski',
    instructorComment: '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const deepLinkAccountRaw = searchParams.get(ADMIN_CLIENT_ACCOUNT_QUERY_KEY);

  useEffect(() => {
    if (!deepLinkAccountRaw) return;
    const parsed = AccountIdSchema.safeParse(deepLinkAccountRaw);
    if (!parsed.success) return;
    setSelectedAccountId(parsed.data);
    setSelectedParticipantId(undefined);
    setContactEditing(false);
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(ADMIN_CLIENT_ACCOUNT_QUERY_KEY);
        return next;
      },
      { replace: true }
    );
  }, [deepLinkAccountRaw, setSearchParams]);

  useEffect(() => {
    if (search.trim() === '') {
      setDebouncedSearch('');
      return;
    }
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [search]);

  const appliedSearch = search.trim() === '' ? '' : debouncedSearch;
  const reads = useAdminIdentityReadModels({
    enabled: true,
    directory: 'accounts',
    search: appliedSearch,
    pageSize: ADMIN_CLIENT_DIRECTORY_PAGE_SIZE,
    selectedAccountId,
  });
  const participantRead = useAdminParticipantDetail(selectedParticipantId);
  const walletAccountId = selectedAccountId
    ? parseAdminFinanceAccountId(selectedAccountId)
    : undefined;
  const walletRead = useAdminWalletReadModel(
    selectedParticipantId ? undefined : walletAccountId
  );

  useEffect(() => {
    if (!reads.accountDetail || contactEditing) return;
    setContactDraft({
      displayName: reads.accountDetail.displayName,
      phoneNumber: reads.accountDetail.phoneNumber ?? '',
    });
  }, [contactEditing, reads.accountDetail]);

  useEffect(() => {
    if (!participantRead.item) return;
    setParticipantDraft(profileDraftFromDetail(participantRead.item));
  }, [participantRead.item]);

  const list = reads.accounts;
  const runAttempt = async (
    attempt: Parameters<typeof executeAdminIdentityAttempt>[1],
    confirmMessage?: string
  ) => {
    if (confirmMessage && typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
      return;
    }
    setPending(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await executeAdminIdentityAttempt(adminAccountId, attempt);
      setNotice(text.saved);
      setContactEditing(false);
      setDependentDraft(EMPTY_DEPENDENT);
      await Promise.all([reads.refresh(), participantRead.refresh()]);
    } catch (caught) {
      const clientError = toCanonicalCommandClientError(caught, 'admin_clients');
      setError(
        clientError.code === 'stale_version'
          ? text.stale
          : clientError.code === 'forbidden'
            ? text.permissionDenied
            : clientError.message || text.mutationFailed
      );
      if (clientError.code === 'stale_version') {
        await Promise.all([reads.refresh(), participantRead.refresh()]);
      }
    } finally {
      setPending(false);
    }
  };

  const actionRevision = (
    kind: 'disable_account' | 'enable_account' | 'update_account_contact_as_administrator' | 'create_managed_dependent_participant' | 'provision_self_participant_for_account',
    fallback = 1
  ) =>
    reads.accountDetail?.authorizedActions.find((item) => item.kind === kind)?.expectedRevision ??
    fallback;

  const participantActionRevision = (
    kind: 'update_participant_profile' | 'archive_participant' | 'reactivate_participant',
    fallback = 1
  ) =>
    participantRead.item?.authorizedActions.find((item) => item.kind === kind)?.expectedRevision ??
    fallback;

  const closeClientDetail = () => {
    setSelectedAccountId(undefined);
    setSelectedParticipantId(undefined);
    setContactEditing(false);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-dim)]" />
        <input
          type="search"
          aria-label={text.search}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          placeholder={text.searchHint}
          className="w-full border border-[var(--border)] bg-transparent py-2 pl-10 pr-4 font-mono text-xs text-[var(--ink)] placeholder-[var(--ink-dim)] focus:border-[var(--ink)] focus:outline-none"
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-xs text-[var(--ink-dim)]">{notice}</p> : null}
      <div className={`grid gap-6 ${selectedAccountId ? 'lg:grid-cols-12' : ''}`}>
        <section className={selectedAccountId ? 'min-w-0 lg:col-span-7' : 'min-w-0'}>
          {list.error ? (
            <div className="space-y-2 border border-[var(--border)] p-4">
              <p role="alert" className="text-xs text-red-600">
                {list.error === 'permission-denied' ? text.permissionDenied : text.readFailed}
              </p>
              <button
                type="button"
                onClick={() => void reads.refresh()}
                className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
              >
                {text.retry}
              </button>
            </div>
          ) : null}
          {list.loading ? (
            <p className="flex items-center gap-2 text-xs text-[var(--ink-dim)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {text.loading}
            </p>
          ) : null}
          {!list.loading && !list.error && list.items.length === 0 ? (
            <p className="border border-[var(--border)] py-8 text-center font-mono text-xs text-[var(--ink-dim)]">
              {appliedSearch ? text.emptySearch : text.emptyDirectory}
            </p>
          ) : null}
          {list.items.length > 0 ? (
            <div className="overflow-x-auto border border-[var(--border)]">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
                    <th className="px-4 py-3">{text.client}</th>
                    <th className="px-4 py-3">{text.contact}</th>
                    <th className="px-4 py-3">{text.lifecycle}</th>
                    <th className="px-4 py-3">{text.participants}</th>
                    <th className="px-4 py-3 text-right">{text.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/40">
                  {list.items.map((item) => (
                    <tr
                      key={item.accountId}
                      className={
                        selectedAccountId === item.accountId
                          ? 'bg-black/5 dark:bg-white/5'
                          : 'hover:bg-black/5 dark:hover:bg-white/5'
                      }
                    >
                      <td className="px-4 py-3">
                        <span className="block text-xs font-bold">
                          {item.displayName || text.unnamed}
                          {item.accountId === adminAccountId ? (
                            <span className="ml-1 bg-black/10 px-1.5 py-0.5 text-[8px] font-mono uppercase text-[var(--ink-dim)] dark:bg-white/10">
                              {text.youBadge}
                            </span>
                          ) : null}
                        </span>
                        {item.role.systemRole === 'owner' || item.role.role === 'admin' ? (
                          <span className="mt-1 inline-block border border-[var(--border)] px-1.5 py-0.5 text-[8px] font-mono uppercase">
                            {item.role.systemRole === 'owner' ? text.roleOwner : text.roleAdmin}
                          </span>
                        ) : null}
                        {item.instructorLink.isInstructor ? (
                          <span className="ml-1 mt-1 inline-block border border-accent-soft px-1.5 py-0.5 text-[8px] font-mono uppercase text-accent">
                            {text.coachBadge}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-xs">{item.email ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {adminClientLifecycleLabel(item.lifecycle, text)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{item.managedParticipantCount}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedAccountId(item.accountId);
                            setSelectedParticipantId(undefined);
                            setContactEditing(false);
                          }}
                          className="border border-[var(--border)] px-2 py-1 text-[10px] font-mono uppercase tracking-wider"
                        >
                          {text.openDetail}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {list.hasMore ? (
            <button
              type="button"
              disabled={list.loadingMore}
              onClick={() => reads.loadMore()}
              className="mt-3 border border-[var(--border)] px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {list.loadingMore ? text.loading : text.loadMore}
            </button>
          ) : null}
        </section>
        {selectedAccountId ? (
          <aside className="relative min-w-0 border border-[var(--border)] p-6 lg:col-span-5">
            {reads.detailLoading || participantRead.loading ? (
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2 text-xs text-[var(--ink-dim)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {text.loading}
                </p>
                <button
                  type="button"
                  aria-label={text.closeDetail}
                  onClick={closeClientDetail}
                  className="shrink-0 border border-[var(--border)] p-1.5 text-[var(--ink-dim)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ) : null}
            {reads.detailError || participantRead.error ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p role="alert" className="text-xs text-red-600">
                    {reads.detailError === 'permission-denied' ||
                    participantRead.error === 'permission-denied'
                      ? text.permissionDenied
                      : text.detailFailed}
                  </p>
                  <button
                    type="button"
                    aria-label={text.closeDetail}
                    onClick={closeClientDetail}
                    className="shrink-0 border border-[var(--border)] p-1.5 text-[var(--ink-dim)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void reads.refresh()}
                  className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
                >
                  {text.retry}
                </button>
              </div>
            ) : null}
            {!reads.detailLoading &&
            !participantRead.loading &&
            selectedParticipantId &&
            participantRead.item ? (
              <AdminClientParticipantDetail
                detail={participantRead.item}
                draft={participantDraft}
                pending={pending}
                text={text}
                onDraftChange={setParticipantDraft}
                onSaveProfile={() =>
                  void runAttempt({
                    kind: 'update_participant_profile',
                    participantId: participantRead.item!.participantId,
                    displayName: participantDraft.displayName.trim(),
                    ...(participantDraft.birthDate
                      ? { birthDate: participantDraft.birthDate }
                      : {}),
                    skillLevel: participantDraft.skillLevel.trim(),
                    discipline: participantDraft.discipline,
                    ...(participantDraft.instructorComment.trim()
                      ? { instructorComment: participantDraft.instructorComment.trim() }
                      : {}),
                    expectedRevision: participantActionRevision('update_participant_profile'),
                    idempotencyKey: adminClientAttemptKey(
                      'update_participant_profile',
                      participantRead.item!.participantId
                    ),
                    reasonExplanation: ADMIN_CLIENT_PARTICIPANT_REASON,
                  })
                }
                onArchive={() =>
                  void runAttempt({
                    kind: 'archive_participant',
                    participantId: participantRead.item!.participantId,
                    expectedRevision: participantActionRevision('archive_participant'),
                    idempotencyKey: adminClientAttemptKey(
                      'archive_participant',
                      participantRead.item!.participantId
                    ),
                    reasonExplanation: ADMIN_CLIENT_PARTICIPANT_REASON,
                  })
                }
                onRestore={() =>
                  void runAttempt({
                    kind: 'reactivate_participant',
                    participantId: participantRead.item!.participantId,
                    expectedRevision: participantActionRevision('reactivate_participant'),
                    idempotencyKey: adminClientAttemptKey(
                      'reactivate_participant',
                      participantRead.item!.participantId
                    ),
                    reasonExplanation: ADMIN_CLIENT_PARTICIPANT_REASON,
                  })
                }
                onBack={() => setSelectedParticipantId(undefined)}
                onClose={closeClientDetail}
              />
            ) : null}
            {!reads.detailLoading && !selectedParticipantId && reads.accountDetail ? (
              <AdminClientAccountDetail
                detail={reads.accountDetail}
                wallet={
                  walletRead.item
                    ? {
                        accountId: walletRead.item.accountId,
                        exists: walletRead.item.exists,
                        balance: walletRead.item.balance,
                        currency: walletRead.item.currency,
                        accountStatus: walletRead.item.accountStatus,
                      }
                    : undefined
                }
                walletLoading={walletRead.loading}
                contactEditing={contactEditing}
                contactDraft={contactDraft}
                dependentDraft={dependentDraft}
                pending={pending}
                locale={locale}
                text={text}
                onClose={closeClientDetail}
                onStartContactEdit={() => setContactEditing(true)}
                onContactChange={setContactDraft}
                onSaveContact={() =>
                  void runAttempt({
                    kind: 'update_account_contact_as_administrator',
                    accountId: reads.accountDetail!.accountId,
                    displayName: contactDraft.displayName.trim(),
                    phoneNumber: contactDraft.phoneNumber.trim(),
                    expectedRevision: actionRevision('update_account_contact_as_administrator'),
                    idempotencyKey: adminClientAttemptKey(
                      'update_account_contact',
                      reads.accountDetail!.accountId
                    ),
                    reasonExplanation: ADMIN_CLIENT_CONTACT_REASON,
                  })
                }
                onCancelContact={() => {
                  setContactEditing(false);
                  if (reads.accountDetail) {
                    setContactDraft({
                      displayName: reads.accountDetail.displayName,
                      phoneNumber: reads.accountDetail.phoneNumber ?? '',
                    });
                  }
                }}
                onEnable={() =>
                  void runAttempt({
                    kind: 'enable_account',
                    accountId: reads.accountDetail!.accountId,
                    expectedRevision: actionRevision('enable_account'),
                    idempotencyKey: adminClientAttemptKey(
                      'enable_account',
                      reads.accountDetail!.accountId
                    ),
                    reasonExplanation: ADMIN_CLIENT_LIFECYCLE_REASON,
                  })
                }
                onDisable={() =>
                  void runAttempt(
                    {
                      kind: 'disable_account',
                      accountId: reads.accountDetail!.accountId,
                      expectedRevision: actionRevision('disable_account'),
                      idempotencyKey: adminClientAttemptKey(
                        'disable_account',
                        reads.accountDetail!.accountId
                      ),
                      reasonExplanation: ADMIN_CLIENT_LIFECYCLE_REASON,
                    },
                    text.confirmDisable
                  )
                }
                onOpenFinance={() => {
                  const accountId = reads.accountDetail?.accountId;
                  if (!accountId) return;
                  setSearchParams((previous) => adminFinanceAccountSearchParams(previous, accountId), {
                    replace: true,
                  });
                }}
                onDependentChange={setDependentDraft}
                onCreateDependent={() => {
                  const account = reads.accountDetail;
                  if (!account || !dependentDraft.displayName.trim() || !dependentDraft.birthDate) {
                    return;
                  }
                  const participantId = ParticipantIdSchema.parse(
                    canonicalDeterministicHash([
                      'participant:v1',
                      'dependent',
                      account.accountId,
                      entropy(),
                    ])
                  );
                  const participantManagementId = participantManagementIdFromGuestLink({
                    participantId,
                    accountId: account.accountId,
                  });
                  void runAttempt({
                    kind: 'create_managed_dependent_participant',
                    accountId: account.accountId,
                    participantId,
                    participantManagementId,
                    displayName: dependentDraft.displayName.trim(),
                    birthDate: dependentDraft.birthDate,
                    skillLevel: dependentDraft.skillLevel.trim(),
                    discipline: dependentDraft.discipline,
                    expectedRevision: actionRevision('create_managed_dependent_participant'),
                    idempotencyKey: adminClientAttemptKey('create_dependent', participantId),
                    reasonExplanation: ADMIN_CLIENT_DEPENDENT_REASON,
                  });
                }}
                onProvisionSelf={() =>
                  void runAttempt({
                    kind: 'provision_self_participant_for_account',
                    accountId: reads.accountDetail!.accountId,
                    expectedRevision: actionRevision('provision_self_participant_for_account'),
                    idempotencyKey: adminClientAttemptKey(
                      'provision_self',
                      reads.accountDetail!.accountId
                    ),
                    reasonExplanation: ADMIN_CLIENT_PROVISION_SELF_REASON,
                  })
                }
                onOpenParticipant={(participantId) => setSelectedParticipantId(participantId)}
              />
            ) : null}
            {!reads.detailLoading &&
            !participantRead.loading &&
            !reads.detailError &&
            !participantRead.error &&
            !reads.accountDetail &&
            !participantRead.item ? (
              <p className="text-xs text-[var(--ink-dim)]">
                {selectedParticipantId ? text.missingParticipant : text.missingAccount}
              </p>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export type { AdminClientDirectoryProps };
