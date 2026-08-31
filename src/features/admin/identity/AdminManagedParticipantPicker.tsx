import { AccountIdSchema, type AccountId, type ParticipantId } from '@ski-academy/shared-domain';
import { useEffect, useState } from 'react';
import { queryAdminIdentityReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import type { AdminManagedParticipantSelection } from './identityContracts';
import { useAdminEligibleParticipants } from './useAdminIdentityReadModels';
import { useAdminIdentityTranslations } from './useAdminIdentityTranslations';

interface AdminManagedParticipantPickerProps {
  readonly selected?: AdminManagedParticipantSelection;
  readonly onChange: (selection: AdminManagedParticipantSelection | undefined) => void;
}

export function AdminManagedParticipantPicker({
  selected,
  onChange,
}: AdminManagedParticipantPickerProps) {
  const { text } = useAdminIdentityTranslations();
  const [search, setSearch] = useState('');
  const [accountId, setAccountId] = useState<AccountId | undefined>(selected?.accountId);
  const [accountOptions, setAccountOptions] = useState<
    readonly { accountId: AccountId; displayName: string; email?: string }[]
  >([]);
  const eligible = useAdminEligibleParticipants(accountId);

  useEffect(() => {
    const trimmed = search.trim();
    if (!trimmed) {
      setAccountOptions([]);
      return;
    }
    let cancelled = false;
    void queryAdminIdentityReadModels({
      scope: 'admin_account_list',
      search: trimmed,
      pageSize: 20,
    }).then((result) => {
      if (cancelled || result.scope !== 'admin_account_list') return;
      setAccountOptions(
        result.items
          .filter((item) => item.lifecycle === 'active')
          .map((item) => ({
            accountId: item.accountId,
            displayName: item.displayName,
            ...(item.email ? { email: item.email } : {}),
          }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [search]);

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <label className="text-xs">
        {text.pickerAccount}
        <input
          aria-label={text.pickerAccount}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={text.searchHint}
          className="mt-1 w-full border border-[var(--border)] bg-[var(--bg)] p-2"
        />
        <select
          aria-label={text.selectAccount}
          className="mt-1 w-full border border-[var(--border)] bg-[var(--bg)] p-2"
          value={accountId ?? ''}
          onChange={(event) => {
            const parsed = AccountIdSchema.safeParse(event.target.value);
            const next = parsed.success ? parsed.data : undefined;
            setAccountId(next);
            onChange(undefined);
          }}
        >
          <option value="">{text.selectAccount}</option>
          {accountOptions.map((option) => (
            <option key={option.accountId} value={option.accountId}>
              {option.displayName}
              {option.email ? ` · ${option.email}` : ''}
            </option>
          ))}
        </select>
      </label>
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
            onChange({
              accountId,
              participantId: participant.participantId as ParticipantId,
              displayName: participant.displayName,
            });
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
    </div>
  );
}
