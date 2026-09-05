import { AccountIdSchema, type AccountId, type ParticipantId } from '@ski-academy/shared-domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS,
  loadAccountDirectoryPage,
  mergeAccountDirectoryOptions,
  type AccountDirectoryOption,
} from './accountDirectorySearch';
import type { AdminManagedParticipantSelection } from './identityContracts';
import { useAdminEligibleParticipants } from './useAdminIdentityReadModels';
import { useAdminIdentityTranslations } from './useAdminIdentityTranslations';

interface AdminManagedParticipantPickerProps {
  readonly selected?: AdminManagedParticipantSelection;
  readonly onChange: (selection: AdminManagedParticipantSelection | undefined) => void;
  /** When true, default to the Account self Participant and hide the field if it is the only option. */
  readonly autoSelectUniqueSelf?: boolean;
  readonly onAccountIdChange?: (accountId: AccountId | undefined) => void;
  /** True when Account (+ Participant when required) is ready for submit. */
  readonly onReadyChange?: (ready: boolean) => void;
  readonly additionalAccounts?: readonly AccountDirectoryOption[];
}

function buildSelection(input: {
  readonly accountId: AccountId;
  readonly participantId: ParticipantId;
  readonly displayName: string;
  readonly accountDisplayName?: string;
}): AdminManagedParticipantSelection {
  return {
    accountId: input.accountId,
    participantId: input.participantId,
    displayName: input.displayName,
    ...(input.accountDisplayName ? { accountDisplayName: input.accountDisplayName } : {}),
  };
}

export function AdminManagedParticipantPicker({
  selected,
  onChange,
  autoSelectUniqueSelf = false,
  onAccountIdChange,
  onReadyChange,
  additionalAccounts,
}: AdminManagedParticipantPickerProps) {
  const { text } = useAdminIdentityTranslations();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [accountId, setAccountId] = useState<AccountId | undefined>(selected?.accountId);
  const [accountOptions, setAccountOptions] = useState<readonly AccountDirectoryOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [directoryError, setDirectoryError] = useState(false);
  const [selectedAccountOption, setSelectedAccountOption] = useState<
    AccountDirectoryOption | undefined
  >();
  const listGeneration = useRef(0);
  const eligible = useAdminEligibleParticipants(accountId);

  useEffect(() => {
    if (search.trim() === '') {
      setDebouncedSearch('');
      return;
    }
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, ACCOUNT_DIRECTORY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [search]);

  const appliedSearch = search.trim() === '' ? '' : debouncedSearch;

  useEffect(() => {
    const generation = ++listGeneration.current;
    setDirectoryLoading(true);
    setDirectoryError(false);
    setLoadingMore(false);
    setAccountOptions([]);
    setHasMore(false);
    setCursor(undefined);
    void loadAccountDirectoryPage({
      ...(appliedSearch ? { search: appliedSearch } : {}),
    })
      .then((page) => {
        if (generation !== listGeneration.current) return;
        setAccountOptions(page.items);
        setHasMore(page.hasMore);
        setCursor(page.nextCursor);
        setDirectoryLoading(false);
      })
      .catch(() => {
        if (generation !== listGeneration.current) return;
        setAccountOptions([]);
        setHasMore(false);
        setCursor(undefined);
        setDirectoryError(true);
        setDirectoryLoading(false);
      });
    return () => {
      listGeneration.current += 1;
    };
  }, [appliedSearch]);

  const loadMore = () => {
    if (!hasMore || !cursor || loadingMore || directoryLoading) return;
    const generation = listGeneration.current;
    setLoadingMore(true);
    setDirectoryError(false);
    void loadAccountDirectoryPage({
      ...(appliedSearch ? { search: appliedSearch } : {}),
      cursor,
    })
      .then((page) => {
        if (generation !== listGeneration.current) return;
        setAccountOptions((previous) => {
          const seen = new Set(previous.map((item) => item.accountId));
          const appended = page.items.filter((item) => !seen.has(item.accountId));
          return [...previous, ...appended];
        });
        setHasMore(page.hasMore);
        setCursor(page.nextCursor);
        setLoadingMore(false);
      })
      .catch(() => {
        if (generation !== listGeneration.current) return;
        setDirectoryError(true);
        setLoadingMore(false);
      });
  };

  const mergedAccounts = useMemo(
    () =>
      mergeAccountDirectoryOptions(
        additionalAccounts,
        accountOptions,
        selectedAccountOption ? [selectedAccountOption] : undefined
      ),
    [additionalAccounts, accountOptions, selectedAccountOption]
  );

  const accountDisplayName = useMemo(
    () => mergedAccounts.find((option) => option.accountId === accountId)?.displayName,
    [accountId, mergedAccounts]
  );

  const onlyUniqueSelf =
    !eligible.loading && eligible.items.length === 1 && eligible.items[0]?.authority === 'self';

  const hideParticipantField = Boolean(autoSelectUniqueSelf && accountId && onlyUniqueSelf);

  useEffect(() => {
    if (!autoSelectUniqueSelf || !accountId || selected || eligible.loading) return;
    const self = eligible.items.find((item) => item.authority === 'self');
    if (!self) return;
    onChange(
      buildSelection({
        accountId,
        participantId: self.participantId as ParticipantId,
        displayName: self.displayName,
        ...(accountDisplayName ? { accountDisplayName } : {}),
      })
    );
  }, [
    accountDisplayName,
    accountId,
    autoSelectUniqueSelf,
    eligible.items,
    eligible.loading,
    onChange,
    selected,
  ]);

  useEffect(() => {
    if (!onReadyChange) return;
    if (selected) {
      onReadyChange(true);
      return;
    }
    if (!accountId || eligible.loading) {
      onReadyChange(false);
      return;
    }
    // Empty eligible list: planner submit can provision self for the Account.
    if (autoSelectUniqueSelf && eligible.items.length === 0) {
      onReadyChange(true);
      return;
    }
    onReadyChange(false);
  }, [
    accountId,
    autoSelectUniqueSelf,
    eligible.items.length,
    eligible.loading,
    onReadyChange,
    selected,
  ]);

  return (
    <div className={`grid gap-2 ${hideParticipantField ? '' : 'md:grid-cols-2'}`}>
      <label className="text-xs">
        {text.pickerAccount}
        <input
          aria-label={text.pickerAccount}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={text.pickerSearchHint}
          className="mt-1 w-full border border-[var(--border)] bg-[var(--bg)] p-2"
        />
        <select
          aria-label={text.selectAccount}
          className="mt-1 w-full border border-[var(--border)] bg-[var(--bg)] p-2"
          value={accountId ?? ''}
          disabled={directoryLoading && mergedAccounts.length === 0}
          onChange={(event) => {
            const parsed = AccountIdSchema.safeParse(event.target.value);
            const next = parsed.success ? parsed.data : undefined;
            setAccountId(next);
            onAccountIdChange?.(next);
            onChange(undefined);
            if (next) {
              const option = mergedAccounts.find((item) => item.accountId === next);
              setSelectedAccountOption(option);
            } else {
              setSelectedAccountOption(undefined);
            }
          }}
        >
          <option value="">
            {directoryLoading && mergedAccounts.length === 0 ? text.loading : text.selectAccount}
          </option>
          {mergedAccounts.map((option) => (
            <option key={option.accountId} value={option.accountId}>
              {option.displayName}
              {option.email ? ` · ${option.email}` : ''}
            </option>
          ))}
        </select>
        {hasMore ? (
          <button
            type="button"
            className="mt-1 border border-[var(--border)] px-2 py-1 text-[10px] font-mono uppercase tracking-wider disabled:opacity-50"
            disabled={loadingMore || directoryLoading}
            onClick={loadMore}
          >
            {loadingMore ? text.loading : text.loadMore}
          </button>
        ) : null}
        {directoryError ? (
          <p className="mt-1 text-[var(--ink-dim)]" role="alert">
            {text.mutationFailed}{' '}
            <button
              type="button"
              className="underline"
              onClick={() => {
                const generation = ++listGeneration.current;
                setDirectoryLoading(true);
                setDirectoryError(false);
                void loadAccountDirectoryPage({
                  ...(appliedSearch ? { search: appliedSearch } : {}),
                }).then((page) => {
                  if (generation !== listGeneration.current) return;
                  setAccountOptions(page.items);
                  setHasMore(page.hasMore);
                  setCursor(page.nextCursor);
                  setDirectoryLoading(false);
                });
              }}
            >
              {text.retry}
            </button>
          </p>
        ) : null}
      </label>
      {hideParticipantField ? null : (
        <label className="text-xs">
          {text.eligibleParticipants}
          <select
            aria-label={text.eligibleParticipants}
            className="mt-1 w-full border border-[var(--border)] bg-[var(--bg)] p-2"
            disabled={!accountId || eligible.loading}
            value={selected?.participantId ?? ''}
            onChange={(event) => {
              const participant = eligible.items.find(
                (item) => item.participantId === event.target.value
              );
              if (!accountId || !participant) {
                onChange(undefined);
                return;
              }
              onChange(
                buildSelection({
                  accountId,
                  participantId: participant.participantId as ParticipantId,
                  displayName: participant.displayName,
                  ...(accountDisplayName ? { accountDisplayName } : {}),
                })
              );
            }}
          >
            <option value="">{eligible.loading ? text.loading : text.eligibleParticipants}</option>
            {eligible.items.map((item) => (
              <option key={item.participantId} value={item.participantId}>
                {item.displayName} · {item.authority}
              </option>
            ))}
          </select>
          {accountId && !eligible.loading && eligible.items.length === 0 ? (
            <p className="mt-1 text-[var(--ink-dim)]">{text.noEligible}</p>
          ) : null}
        </label>
      )}
    </div>
  );
}
