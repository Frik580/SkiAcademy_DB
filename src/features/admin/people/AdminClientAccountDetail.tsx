import type { ParticipantId } from '@ski-academy/shared-domain';
import { X } from 'lucide-react';
import type {
  AdminClientAccountDetailView,
  AdminClientContactDraft,
  AdminClientDependentDraft,
  AdminClientWalletSummaryView,
} from './adminClientContracts';
import { AdminClientContactEditor } from './AdminClientContactEditor';
import { AdminClientParticipantList } from './AdminClientParticipantList';
import { AdminClientWalletSummary } from './AdminClientWalletSummary';
import { adminClientLifecycleLabel } from './adminClientLabels';
import type { useAdminClientTranslations } from './useAdminClientTranslations';

interface AdminClientAccountDetailProps {
  readonly detail: AdminClientAccountDetailView;
  readonly wallet?: AdminClientWalletSummaryView;
  readonly walletLoading: boolean;
  readonly contactEditing: boolean;
  readonly contactDraft: AdminClientContactDraft;
  readonly dependentDraft: AdminClientDependentDraft;
  readonly pending: boolean;
  readonly locale: string;
  readonly text: ReturnType<typeof useAdminClientTranslations>['text'];
  readonly onClose: () => void;
  readonly onStartContactEdit: () => void;
  readonly onContactChange: (draft: AdminClientContactDraft) => void;
  readonly onSaveContact: () => void;
  readonly onCancelContact: () => void;
  readonly onEnable: () => void;
  readonly onDisable: () => void;
  readonly onOpenFinance: () => void;
  readonly onDependentChange: (draft: AdminClientDependentDraft) => void;
  readonly onCreateDependent: () => void;
  readonly onProvisionSelf: () => void;
  readonly onOpenParticipant: (participantId: ParticipantId) => void;
}

export function AdminClientAccountDetail({
  detail,
  wallet,
  walletLoading,
  contactEditing,
  contactDraft,
  dependentDraft,
  pending,
  locale,
  text,
  onClose,
  onStartContactEdit,
  onContactChange,
  onSaveContact,
  onCancelContact,
  onEnable,
  onDisable,
  onOpenFinance,
  onDependentChange,
  onCreateDependent,
  onProvisionSelf,
  onOpenParticipant,
}: AdminClientAccountDetailProps) {
  const canDisable = detail.authorizedActions.some((action) => action.kind === 'disable_account');
  const canEnable = detail.authorizedActions.some((action) => action.kind === 'enable_account');
  const canEditContact = detail.authorizedActions.some(
    (action) => action.kind === 'update_account_contact_as_administrator'
  );
  const canCreateDependent = detail.authorizedActions.some(
    (action) => action.kind === 'create_managed_dependent_participant'
  );
  const canProvisionSelf = detail.authorizedActions.some(
    (action) => action.kind === 'provision_self_participant_for_account'
  );

  return (
    <div className="space-y-4">
      <header className="space-y-1 border-b border-[var(--border)] pb-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-serif text-lg font-light">{detail.displayName}</h3>
          <button
            type="button"
            aria-label={text.closeDetail}
            onClick={onClose}
            className="shrink-0 border border-[var(--border)] p-1.5 text-[var(--ink-dim)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {detail.email ? <p className="font-mono text-xs">{detail.email}</p> : null}
        {detail.phoneNumber ? (
          <p className="font-mono text-xs text-[var(--ink-dim)]">{detail.phoneNumber}</p>
        ) : (
          <p className="font-mono text-[10px] italic text-[var(--ink-dim)]">{text.noPhone}</p>
        )}
        <p className="text-xs text-[var(--ink-dim)]">
          {text.lifecycle}: {adminClientLifecycleLabel(detail.lifecycle, text)}
        </p>
        <div className="flex flex-wrap gap-1 pt-1">
          {detail.role.systemRole === 'owner' ? (
            <span className="border border-[var(--ink)] px-2 py-0.5 text-[9px] font-mono uppercase">
              {text.roleOwner}
            </span>
          ) : detail.role.role === 'admin' ? (
            <span className="border border-[var(--ink)] px-2 py-0.5 text-[9px] font-mono uppercase">
              {text.roleAdmin}
            </span>
          ) : null}
          {detail.instructorLink.isInstructor ? (
            <span className="border border-accent-soft px-2 py-0.5 text-[9px] font-mono uppercase text-accent">
              {text.coachBadge}
            </span>
          ) : null}
        </div>
      </header>
      <div className="flex flex-wrap gap-2">
        {canDisable ? (
          <button
            type="button"
            disabled={pending}
            onClick={onDisable}
            className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider disabled:opacity-50"
          >
            {text.disable}
          </button>
        ) : null}
        {canEnable ? (
          <button
            type="button"
            disabled={pending}
            onClick={onEnable}
            className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider disabled:opacity-50"
          >
            {text.enable}
          </button>
        ) : null}
        {canEditContact && !contactEditing ? (
          <button
            type="button"
            onClick={onStartContactEdit}
            className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider"
          >
            {text.editContact}
          </button>
        ) : null}
      </div>
      <section className="space-y-2 border border-[var(--border)] p-4">
        <h4 className="text-sm font-medium">{text.contactDetails}</h4>
        {contactEditing ? (
          <AdminClientContactEditor
            draft={contactDraft}
            email={detail.email}
            pending={pending}
            text={text}
            onChange={onContactChange}
            onSave={onSaveContact}
            onCancel={onCancelContact}
          />
        ) : (
          <dl className="space-y-1 text-xs">
            <div>
              <dt className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">{text.displayName}</dt>
              <dd>{detail.displayName}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">{text.email}</dt>
              <dd>{detail.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10px] uppercase text-[var(--ink-dim)]">{text.phone}</dt>
              <dd>{detail.phoneNumber ?? text.noPhone}</dd>
            </div>
          </dl>
        )}
      </section>
      <AdminClientParticipantList
        participants={detail.managedParticipants}
        canCreateDependent={canCreateDependent}
        canProvisionSelf={canProvisionSelf}
        dependentDraft={dependentDraft}
        pending={pending}
        text={text}
        onDependentChange={onDependentChange}
        onCreateDependent={onCreateDependent}
        onProvisionSelf={onProvisionSelf}
        onOpenParticipant={onOpenParticipant}
      />
      <AdminClientWalletSummary
        wallet={wallet}
        loading={walletLoading}
        locale={locale}
        text={text}
        onOpenFinance={onOpenFinance}
      />
    </div>
  );
}
