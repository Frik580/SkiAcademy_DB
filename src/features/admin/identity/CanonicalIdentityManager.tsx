import {
  AccountIdSchema,
  IdempotencyKeySchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  canonicalDeterministicHash,
  participantManagementIdFromGuestLink,
  type AccountId,
  type InstructorId,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import { Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toCanonicalCommandClientError } from '../../../lib/canonical/mapCanonicalCommandError';
import type { AdminIdentityAttempt, AdminIdentityDirectory } from './identityContracts';
import { executeAdminIdentityAttempt } from './useAdminIdentityCommands';
import { useAdminIdentityReadModels } from './useAdminIdentityReadModels';
import { useAdminIdentityTranslations } from './useAdminIdentityTranslations';

interface CanonicalIdentityManagerProps {
  readonly adminAccountId: string;
}

function entropy(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replaceAll('-', '');
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function attemptKey(action: string): AdminIdentityAttempt['idempotencyKey'] {
  return IdempotencyKeySchema.parse(`admin_identity:${action}:${entropy()}`);
}

export function CanonicalIdentityManager({ adminAccountId }: CanonicalIdentityManagerProps) {
  const { text } = useAdminIdentityTranslations();
  const [directory, setDirectory] = useState<AdminIdentityDirectory>('accounts');
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<AccountId | undefined>();
  const [selectedParticipantId, setSelectedParticipantId] = useState<ParticipantId | undefined>();
  const [selectedInstructorId, setSelectedInstructorId] = useState<InstructorId | undefined>();
  const reads = useAdminIdentityReadModels({
    enabled: true,
    directory,
    search,
    selectedAccountId,
    selectedParticipantId,
    selectedInstructorId,
  });
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState<{
    attempt: AdminIdentityAttempt;
    message: string;
  }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [profileName, setProfileName] = useState('');
  const [profileBirthDate, setProfileBirthDate] = useState('');
  const [dependentName, setDependentName] = useState('');
  const [dependentBirthDate, setDependentBirthDate] = useState('');
  const [catalogName, setCatalogName] = useState('');
  const [catalogPrice, setCatalogPrice] = useState('15000');
  const [assignAccountId, setAssignAccountId] = useState('');
  const [linkAccountId, setLinkAccountId] = useState('');

  const list =
    directory === 'accounts'
      ? reads.accounts
      : directory === 'participants'
        ? reads.participants
        : reads.instructors;

  const requestAttempt = (attempt: AdminIdentityAttempt, message: string) => {
    if (!reason.trim()) return;
    setError(undefined);
    setConfirmation({ attempt: { ...attempt, reasonExplanation: reason.trim() }, message });
  };

  const runConfirmation = async () => {
    if (!confirmation || pending) return;
    setPending(true);
    try {
      await executeAdminIdentityAttempt(adminAccountId, confirmation.attempt);
      setConfirmation(undefined);
      setReason('');
      await reads.refresh();
    } catch (caught) {
      const clientError = toCanonicalCommandClientError(caught, 'admin_identity');
      setError(
        clientError.code === 'stale_version'
          ? text.stale
          : clientError.code === 'forbidden'
            ? text.permissionDenied
            : clientError.message
      );
      if (clientError.code === 'stale_version') {
        setConfirmation(undefined);
        await reads.refresh();
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">{text.title}</h3>
        <p className="mt-1 text-xs text-[var(--ink-dim)]">{text.subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['accounts', 'participants', 'instructors'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setDirectory(item);
              setConfirmation(undefined);
            }}
            className={`border px-3 py-2 text-xs ${directory === item ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]' : 'border-[var(--border)]'}`}
          >
            {text[item]}
          </button>
        ))}
        <button type="button" className="border border-[var(--border)] px-3 py-2 text-xs" onClick={() => void reads.refresh()}>
          <RefreshCw className="mr-1 inline h-3 w-3" />
          {text.refresh}
        </button>
      </div>
      <input
        aria-label={text.search}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={text.searchHint}
        className="w-full border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
      />
      {list.error ? (
        <p role="alert" className="text-xs text-red-600">
          {list.error === 'permission-denied' ? text.permissionDenied : text.mutationFailed}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border border-[var(--border)] p-3">
          {list.loading ? <p className="text-xs">{text.loading}</p> : null}
          {!list.loading && list.items.length === 0 ? <p className="text-xs">{text.empty}</p> : null}
          <ul className="space-y-1">
            {directory === 'accounts'
              ? reads.accounts.items.map((item) => (
                  <li key={item.accountId}>
                    <button
                      type="button"
                      className={`w-full border p-2 text-left text-xs ${selectedAccountId === item.accountId ? 'border-[var(--ink)]' : 'border-[var(--border)]'}`}
                      onClick={() => setSelectedAccountId(item.accountId)}
                    >
                      {item.displayName} · {item.lifecycle}
                      {item.email ? ` · ${item.email}` : ''}
                    </button>
                  </li>
                ))
              : null}
            {directory === 'participants'
              ? reads.participants.items.map((item) => (
                  <li key={item.participantId}>
                    <button
                      type="button"
                      className={`w-full border p-2 text-left text-xs ${selectedParticipantId === item.participantId ? 'border-[var(--ink)]' : 'border-[var(--border)]'}`}
                      onClick={() => setSelectedParticipantId(item.participantId)}
                    >
                      {item.displayName} · {item.classification} · {item.lifecycle}
                    </button>
                  </li>
                ))
              : null}
            {directory === 'instructors'
              ? reads.instructors.items.map((item) => (
                  <li key={item.instructorId}>
                    <button
                      type="button"
                      className={`w-full border p-2 text-left text-xs ${selectedInstructorId === item.instructorId ? 'border-[var(--ink)]' : 'border-[var(--border)]'}`}
                      onClick={() => setSelectedInstructorId(item.instructorId)}
                    >
                      {item.name} · {item.isAvailable ? text.activate : text.deactivate}
                    </button>
                  </li>
                ))
              : null}
          </ul>
          {list.hasMore ? (
            <button type="button" className="mt-2 text-xs underline" onClick={reads.loadMore}>
              {text.loadMore}
            </button>
          ) : null}
        </section>
        <section className="space-y-3 border border-[var(--border)] p-3">
          {reads.detailLoading ? <p className="text-xs">{text.loading}</p> : null}
          {directory === 'accounts' && reads.accountDetail ? (
            <AccountDetail
              detail={reads.accountDetail}
              text={text}
              profileName={dependentName}
              profileBirthDate={dependentBirthDate}
              onProfileName={setDependentName}
              onProfileBirthDate={setDependentBirthDate}
              linkInstructorId={linkAccountId}
              onLinkInstructorId={setLinkAccountId}
              onAction={requestAttempt}
            />
          ) : null}
          {directory === 'participants' && reads.participantDetail ? (
            <ParticipantDetail
              detail={reads.participantDetail}
              text={text}
              profileName={profileName || reads.participantDetail.profile.displayName}
              profileBirthDate={
                profileBirthDate ||
                (reads.participantDetail.profile.age.kind === 'birth_date'
                  ? reads.participantDetail.profile.age.birthDate
                  : '')
              }
              assignAccountId={assignAccountId}
              onProfileName={setProfileName}
              onProfileBirthDate={setProfileBirthDate}
              onAssignAccountId={setAssignAccountId}
              onAction={requestAttempt}
            />
          ) : null}
          {directory === 'instructors' && reads.instructorDetail ? (
            <InstructorDetail
              detail={reads.instructorDetail}
              text={text}
              catalogName={catalogName || reads.instructorDetail.name}
              catalogPrice={catalogPrice}
              onCatalogName={setCatalogName}
              onCatalogPrice={setCatalogPrice}
              onAction={requestAttempt}
            />
          ) : null}
          {directory === 'instructors' ? (
            <div className="space-y-2 border-t border-[var(--border)] pt-3">
              <p className="text-xs font-medium">{text.createCatalog}</p>
              <input
                aria-label={text.displayName}
                value={catalogName}
                onChange={(event) => setCatalogName(event.target.value)}
                className="w-full border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
              />
              <input
                aria-label={text.price}
                value={catalogPrice}
                onChange={(event) => setCatalogPrice(event.target.value)}
                className="w-full border border-[var(--border)] bg-[var(--bg)] p-2 text-xs"
              />
              <button
                type="button"
                className="border border-[var(--border)] px-3 py-2 text-xs"
                onClick={() => {
                  const instructorId = InstructorIdSchema.parse(
                    canonicalDeterministicHash(['instructor_catalog:v1', entropy()])
                  );
                  requestAttempt(
                    {
                      kind: 'create_instructor_catalog_entry',
                      instructorId,
                      name: catalogName.trim(),
                      pricePerHourKZT: Number(catalogPrice),
                      idempotencyKey: attemptKey(`create_catalog:${instructorId}`),
                      expectedRevision: 1,
                      reasonExplanation: reason,
                    },
                    `${text.createCatalog} ${catalogName}`
                  );
                }}
              >
                {text.createCatalog}
              </button>
            </div>
          ) : null}
          <label className="block text-xs">
            {text.reason}
            <textarea
              aria-label={text.reason}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full border border-[var(--border)] bg-[var(--bg)] p-2"
              rows={2}
            />
          </label>
          {error ? (
            <p role="alert" className="text-xs text-red-600">
              {error}
            </p>
          ) : null}
          {confirmation ? (
            <div className="border border-[var(--border)] p-3 text-xs">
              <p>{confirmation.message}</p>
              <p className="mt-1 text-[var(--ink-dim)]">rev {confirmation.attempt.expectedRevision}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="border border-[var(--ink)] px-3 py-2" onClick={() => void runConfirmation()} disabled={pending}>
                  {pending ? <Loader2 className="inline h-3 w-3 animate-spin" /> : text.confirm}
                </button>
                <button type="button" className="border border-[var(--border)] px-3 py-2" onClick={() => setConfirmation(undefined)}>
                  {text.cancel}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function AccountDetail(props: {
  readonly detail: NonNullable<ReturnType<typeof useAdminIdentityReadModels>['accountDetail']>;
  readonly text: ReturnType<typeof useAdminIdentityTranslations>['text'];
  readonly profileName: string;
  readonly profileBirthDate: string;
  readonly onProfileName: (value: string) => void;
  readonly onProfileBirthDate: (value: string) => void;
  readonly linkInstructorId: string;
  readonly onLinkInstructorId: (value: string) => void;
  readonly onAction: (attempt: AdminIdentityAttempt, message: string) => void;
}) {
  const { detail, text, onAction } = props;
  const action = (kind: AdminIdentityAttempt['kind']) =>
    detail.authorizedActions.find((item) => item.kind === kind);
  return (
    <div className="space-y-2 text-xs">
      <p className="font-medium">{detail.displayName}</p>
      <p>
        {text.lifecycle}: {detail.lifecycle} · {detail.role.role}
        {detail.role.systemRole ? ` · ${detail.role.systemRole}` : ''}
      </p>
      <p>
        {text.managed}: {detail.managedParticipants.map((item) => item.displayName).join(', ') || '—'}
      </p>
      {detail.diagnostics.length > 0 ? (
        <ul>
          {detail.diagnostics.map((item) => (
            <li key={`${item.diagnosticType}:${item.subject}`}>
              {item.diagnosticType} · {item.evidence}
            </li>
          ))}
        </ul>
      ) : null}
      {action('disable_account') ? (
        <button
          type="button"
          className="mr-2 border border-[var(--border)] px-2 py-1"
          onClick={() =>
            onAction(
              {
                kind: 'disable_account',
                accountId: detail.accountId,
                expectedRevision: action('disable_account')!.expectedRevision,
                idempotencyKey: attemptKey(`disable:${detail.accountId}`),
                reasonExplanation: '',
              },
              `${text.deactivate} ${detail.displayName}`
            )
          }
        >
          {text.deactivate}
        </button>
      ) : null}
      {action('enable_account') ? (
        <button
          type="button"
          className="mr-2 border border-[var(--border)] px-2 py-1"
          onClick={() =>
            onAction(
              {
                kind: 'enable_account',
                accountId: detail.accountId,
                expectedRevision: action('enable_account')!.expectedRevision,
                idempotencyKey: attemptKey(`enable:${detail.accountId}`),
                reasonExplanation: '',
              },
              `${text.activate} ${detail.displayName}`
            )
          }
        >
          {text.activate}
        </button>
      ) : null}
      {action('change_account_role') ? (
        <button
          type="button"
          className="mr-2 border border-[var(--border)] px-2 py-1"
          onClick={() =>
            onAction(
              {
                kind: 'change_account_role',
                accountId: detail.accountId,
                role: detail.role.role === 'admin' ? 'user' : 'admin',
                expectedRevision: action('change_account_role')!.expectedRevision,
                idempotencyKey: attemptKey(`role:${detail.accountId}:${detail.role.role === 'admin' ? 'user' : 'admin'}`),
                reasonExplanation: '',
              },
              detail.role.role === 'admin' ? text.demote : text.promote
            )
          }
        >
          {detail.role.role === 'admin' ? text.demote : text.promote}
        </button>
      ) : null}
      {action('provision_self_participant_for_account') ? (
        <button
          type="button"
          className="mr-2 border border-[var(--border)] px-2 py-1"
          onClick={() =>
            onAction(
              {
                kind: 'provision_self_participant_for_account',
                accountId: detail.accountId,
                expectedRevision: action('provision_self_participant_for_account')!.expectedRevision,
                idempotencyKey: attemptKey(`provision_self:${detail.accountId}`),
                reasonExplanation: '',
              },
              text.provisionSelf
            )
          }
        >
          {text.provisionSelf}
        </button>
      ) : null}
      {action('create_managed_dependent_participant') ? (
        <div className="space-y-1">
          <input
            aria-label={text.displayName}
            value={props.profileName}
            onChange={(event) => props.onProfileName(event.target.value)}
            className="w-full border border-[var(--border)] bg-[var(--bg)] p-2"
            placeholder={text.displayName}
          />
          <input
            aria-label={text.birthDate}
            type="date"
            value={props.profileBirthDate}
            onChange={(event) => props.onProfileBirthDate(event.target.value)}
            className="w-full border border-[var(--border)] bg-[var(--bg)] p-2"
          />
          <button
            type="button"
            className="border border-[var(--border)] px-2 py-1"
            onClick={() => {
              const participantId = ParticipantIdSchema.parse(
                canonicalDeterministicHash(['participant:v1', 'dependent', detail.accountId, entropy()])
              );
              const participantManagementId = participantManagementIdFromGuestLink({
                participantId,
                accountId: detail.accountId,
              });
              onAction(
                {
                  kind: 'create_managed_dependent_participant',
                  accountId: detail.accountId,
                  participantId,
                  participantManagementId,
                  displayName: props.profileName.trim(),
                  birthDate: props.profileBirthDate,
                  skillLevel: 'beginner',
                  discipline: 'ski',
                  expectedRevision: action('create_managed_dependent_participant')!.expectedRevision,
                  idempotencyKey: attemptKey(`create_dependent:${participantId}`),
                  reasonExplanation: '',
                },
                `${text.createDependent} ${props.profileName}`
              );
            }}
          >
            {text.createDependent}
          </button>
        </div>
      ) : null}
      {action('link_account_instructor_catalog') ? (
        <div className="space-y-1">
          <input
            aria-label={text.linkCatalog}
            value={props.linkInstructorId}
            onChange={(event) => props.onLinkInstructorId(event.target.value)}
            className="w-full border border-[var(--border)] bg-[var(--bg)] p-2"
            placeholder="instructorId"
          />
          <button
            type="button"
            className="border border-[var(--border)] px-2 py-1"
            onClick={() =>
              onAction(
                {
                  kind: 'link_account_instructor_catalog',
                  accountId: detail.accountId,
                  instructorId: InstructorIdSchema.parse(props.linkInstructorId.trim()),
                  expectedRevision: action('link_account_instructor_catalog')!.expectedRevision,
                  idempotencyKey: attemptKey(`link:${detail.accountId}:${props.linkInstructorId}`),
                  reasonExplanation: '',
                },
                text.linkCatalog
              )
            }
          >
            {text.linkCatalog}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ParticipantDetail(props: {
  readonly detail: NonNullable<ReturnType<typeof useAdminIdentityReadModels>['participantDetail']>;
  readonly text: ReturnType<typeof useAdminIdentityTranslations>['text'];
  readonly profileName: string;
  readonly profileBirthDate: string;
  readonly assignAccountId: string;
  readonly onProfileName: (value: string) => void;
  readonly onProfileBirthDate: (value: string) => void;
  readonly onAssignAccountId: (value: string) => void;
  readonly onAction: (attempt: AdminIdentityAttempt, message: string) => void;
}) {
  const { detail, text, onAction } = props;
  const action = (kind: AdminIdentityAttempt['kind']) =>
    detail.authorizedActions.find((item) => item.kind === kind);
  const manager = detail.managers[0];
  return (
    <div className="space-y-2 text-xs">
      <p className="font-medium">{detail.displayName}</p>
      <p>
        {detail.classification} · {detail.lifecycle}
      </p>
      {detail.archiveBlockedByCommitments ? <p>{text.archiveBlocked}</p> : null}
      <p>
        {text.managers}: {detail.managers.map((item) => `${item.displayName} (${item.authority})`).join(', ') || '—'}
      </p>
      {detail.diagnostics.map((item) => (
        <p key={`${item.diagnosticType}:${item.subject}`}>
          {item.diagnosticType}: {item.evidence}
        </p>
      ))}
      {action('update_participant_profile') ? (
        <div className="space-y-1">
          <input
            aria-label={text.displayName}
            value={props.profileName}
            onChange={(event) => props.onProfileName(event.target.value)}
            className="w-full border border-[var(--border)] bg-[var(--bg)] p-2"
          />
          <input
            aria-label={text.birthDate}
            type="date"
            value={props.profileBirthDate}
            onChange={(event) => props.onProfileBirthDate(event.target.value)}
            className="w-full border border-[var(--border)] bg-[var(--bg)] p-2"
          />
          <button
            type="button"
            className="border border-[var(--border)] px-2 py-1"
            onClick={() =>
              onAction(
                {
                  kind: 'update_participant_profile',
                  participantId: detail.participantId,
                  displayName: props.profileName.trim(),
                  birthDate: props.profileBirthDate,
                  expectedRevision: action('update_participant_profile')!.expectedRevision,
                  idempotencyKey: attemptKey(
                    `profile:${detail.participantId}:${action('update_participant_profile')!.expectedRevision}`
                  ),
                  reasonExplanation: '',
                },
                text.saveProfile
              )
            }
          >
            {text.saveProfile}
          </button>
        </div>
      ) : null}
      {action('archive_participant') ? (
        <button
          type="button"
          className="mr-2 border border-[var(--border)] px-2 py-1"
          onClick={() =>
            onAction(
              {
                kind: 'archive_participant',
                participantId: detail.participantId,
                expectedRevision: action('archive_participant')!.expectedRevision,
                idempotencyKey: attemptKey(`archive:${detail.participantId}`),
                reasonExplanation: '',
              },
              text.archive
            )
          }
        >
          {text.archive}
        </button>
      ) : null}
      {action('reactivate_participant') ? (
        <button
          type="button"
          className="mr-2 border border-[var(--border)] px-2 py-1"
          onClick={() =>
            onAction(
              {
                kind: 'reactivate_participant',
                participantId: detail.participantId,
                expectedRevision: action('reactivate_participant')!.expectedRevision,
                idempotencyKey: attemptKey(`reactivate:${detail.participantId}`),
                reasonExplanation: '',
              },
              text.restore
            )
          }
        >
          {text.restore}
        </button>
      ) : null}
      {action('assign_participant_management_as_administrator') ? (
        <div className="space-y-1">
          <input
            aria-label={text.assignManagement}
            value={props.assignAccountId}
            onChange={(event) => props.onAssignAccountId(event.target.value)}
            className="w-full border border-[var(--border)] bg-[var(--bg)] p-2"
            placeholder="accountId"
          />
          <button
            type="button"
            className="border border-[var(--border)] px-2 py-1"
            onClick={() => {
              const accountId = AccountIdSchema.parse(props.assignAccountId.trim());
              const participantManagementId = participantManagementIdFromGuestLink({
                participantId: detail.participantId,
                accountId,
              });
              onAction(
                {
                  kind: 'assign_participant_management_as_administrator',
                  participantId: detail.participantId,
                  participantManagementId,
                  accountId,
                  expectedRevision: action('assign_participant_management_as_administrator')!.expectedRevision,
                  idempotencyKey: attemptKey(`assign:${detail.participantId}:${accountId}`),
                  reasonExplanation: '',
                },
                text.assignManagement
              );
            }}
          >
            {text.assignManagement}
          </button>
        </div>
      ) : null}
      {action('revoke_participant_management') && manager ? (
        <button
          type="button"
          className="border border-[var(--border)] px-2 py-1"
          onClick={() =>
            onAction(
              {
                kind: 'revoke_participant_management',
                participantManagementId: manager.participantManagementId,
                expectedRevision: action('revoke_participant_management')!.expectedRevision,
                idempotencyKey: attemptKey(`revoke:${manager.participantManagementId}`),
                reasonExplanation: '',
              },
              text.revokeManagement
            )
          }
        >
          {text.revokeManagement}
        </button>
      ) : null}
    </div>
  );
}

function InstructorDetail(props: {
  readonly detail: NonNullable<ReturnType<typeof useAdminIdentityReadModels>['instructorDetail']>;
  readonly text: ReturnType<typeof useAdminIdentityTranslations>['text'];
  readonly catalogName: string;
  readonly catalogPrice: string;
  readonly onCatalogName: (value: string) => void;
  readonly onCatalogPrice: (value: string) => void;
  readonly onAction: (attempt: AdminIdentityAttempt, message: string) => void;
}) {
  const { detail, text, onAction } = props;
  const action = (kind: AdminIdentityAttempt['kind']) =>
    detail.authorizedActions.find((item) => item.kind === kind);
  return (
    <div className="space-y-2 text-xs">
      <p className="font-medium">{detail.name}</p>
      <p>
        {text.lifecycle}: {detail.isAvailable ? 'available' : 'unavailable'}
        {detail.linkedAccountId ? ` · ${detail.linkedAccountId}` : ''}
      </p>
      <input
        aria-label={text.displayName}
        value={props.catalogName}
        onChange={(event) => props.onCatalogName(event.target.value)}
        className="w-full border border-[var(--border)] bg-[var(--bg)] p-2"
      />
      {action('update_instructor_catalog_profile') ? (
        <button
          type="button"
          className="mr-2 border border-[var(--border)] px-2 py-1"
          onClick={() =>
            onAction(
              {
                kind: 'update_instructor_catalog_profile',
                instructorId: detail.instructorId,
                name: props.catalogName.trim(),
                expectedRevision: action('update_instructor_catalog_profile')!.expectedRevision,
                idempotencyKey: attemptKey(`catalog_update:${detail.instructorId}:${action('update_instructor_catalog_profile')!.expectedRevision}`),
                reasonExplanation: '',
              },
              text.updateCatalog
            )
          }
        >
          {text.updateCatalog}
        </button>
      ) : null}
      {action('deactivate_instructor_catalog') ? (
        <button
          type="button"
          className="mr-2 border border-[var(--border)] px-2 py-1"
          onClick={() =>
            onAction(
              {
                kind: 'deactivate_instructor_catalog',
                instructorId: detail.instructorId,
                expectedRevision: action('deactivate_instructor_catalog')!.expectedRevision,
                idempotencyKey: attemptKey(`catalog_off:${detail.instructorId}`),
                reasonExplanation: '',
              },
              text.deactivateCatalog
            )
          }
        >
          {text.deactivateCatalog}
        </button>
      ) : null}
      {action('reactivate_instructor_catalog') ? (
        <button
          type="button"
          className="mr-2 border border-[var(--border)] px-2 py-1"
          onClick={() =>
            onAction(
              {
                kind: 'reactivate_instructor_catalog',
                instructorId: detail.instructorId,
                expectedRevision: action('reactivate_instructor_catalog')!.expectedRevision,
                idempotencyKey: attemptKey(`catalog_on:${detail.instructorId}`),
                reasonExplanation: '',
              },
              text.reactivateCatalog
            )
          }
        >
          {text.reactivateCatalog}
        </button>
      ) : null}
      {action('unlink_account_instructor_catalog') && detail.linkedAccountId ? (
        <button
          type="button"
          className="mr-2 border border-[var(--border)] px-2 py-1"
          onClick={() =>
            onAction(
              {
                kind: 'unlink_account_instructor_catalog',
                accountId: detail.linkedAccountId!,
                instructorId: detail.instructorId,
                expectedRevision: action('unlink_account_instructor_catalog')!.expectedRevision,
                idempotencyKey: attemptKey(`unlink:${detail.linkedAccountId}:${detail.instructorId}`),
                reasonExplanation: '',
              },
              text.unlinkCatalog
            )
          }
        >
          {text.unlinkCatalog}
        </button>
      ) : null}
    </div>
  );
}
