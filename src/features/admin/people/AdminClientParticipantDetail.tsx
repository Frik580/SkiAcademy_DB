import type { AdminClientParticipantProfileDraft, AdminClientParticipantDetailView } from './adminClientContracts';
import { X } from 'lucide-react';
import {
  adminClientDisciplineLabel,
  adminClientParticipantLifecycleLabel,
  adminClientRelationshipLabel,
  adminClientSkillLevelLabel,
} from './adminClientLabels';
import type { useAdminClientTranslations } from './useAdminClientTranslations';

interface AdminClientParticipantDetailProps {
  readonly detail: AdminClientParticipantDetailView;
  readonly draft: AdminClientParticipantProfileDraft;
  readonly pending: boolean;
  readonly text: ReturnType<typeof useAdminClientTranslations>['text'];
  readonly onDraftChange: (draft: AdminClientParticipantProfileDraft) => void;
  readonly onSaveProfile: () => void;
  readonly onArchive: () => void;
  readonly onRestore: () => void;
  readonly onBack: () => void;
  readonly onClose: () => void;
}

export function AdminClientParticipantDetail({
  detail,
  draft,
  pending,
  text,
  onDraftChange,
  onSaveProfile,
  onArchive,
  onRestore,
  onBack,
  onClose,
}: AdminClientParticipantDetailProps) {
  const canEdit = detail.authorizedActions.some((action) => action.kind === 'update_participant_profile');
  const canArchive = detail.authorizedActions.some((action) => action.kind === 'archive_participant');
  const canRestore = detail.authorizedActions.some((action) => action.kind === 'reactivate_participant');
  const manager = detail.managers[0];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-mono uppercase tracking-wider text-[var(--ink-dim)] underline"
        >
          {text.backToAccount}
        </button>
        <button
          type="button"
          aria-label={text.closeDetail}
          onClick={onClose}
          className="shrink-0 border border-[var(--border)] p-1.5 text-[var(--ink-dim)] transition hover:border-[var(--ink)] hover:text-[var(--ink)]"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <header className="space-y-1">
        <h3 className="font-serif text-lg font-light">{detail.profile.displayName}</h3>
        <p className="text-xs text-[var(--ink-dim)]">
          {manager
            ? adminClientRelationshipLabel(manager.authority, text)
            : detail.classification === 'self'
              ? text.relationshipSelf
              : detail.classification === 'dependent'
                ? text.relationshipGuardian
                : detail.classification}
          {' · '}
          {adminClientParticipantLifecycleLabel(detail.lifecycle, text)}
        </p>
      </header>
      {detail.archiveBlockedByCommitments ? (
        <p className="text-xs text-[var(--ink-dim)]">{text.archiveBlocked}</p>
      ) : null}
      <section className="space-y-2 border border-[var(--border)] p-4 text-xs">
        <p>
          {text.participantSkillLevel}: {adminClientSkillLevelLabel(detail.profile.skillLevel)}
        </p>
        <p>
          {text.discipline}: {adminClientDisciplineLabel(detail.profile.discipline, text)}
        </p>
        <p>
          {text.age}:{' '}
          {detail.profile.age.kind === 'birth_date'
            ? detail.profile.age.birthDate
            : `${detail.profile.age.years} ${text.ageYears}`}
        </p>
        {detail.profile.instructorComment ? (
          <p>
            {text.instructorComment}: {detail.profile.instructorComment}
          </p>
        ) : null}
      </section>
      {canEdit ? (
        <form
          className="space-y-2 border border-[var(--border)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveProfile();
          }}
        >
          <input
            aria-label={text.displayName}
            value={draft.displayName}
            onChange={(event) => onDraftChange({ ...draft, displayName: event.target.value })}
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
            required
          />
          <input
            aria-label={text.birthDate}
            type="date"
            value={draft.birthDate}
            onChange={(event) => onDraftChange({ ...draft, birthDate: event.target.value })}
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
          />
          <input
            aria-label={text.participantSkillLevel}
            value={draft.skillLevel}
            onChange={(event) => onDraftChange({ ...draft, skillLevel: event.target.value })}
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
            required
          />
          <select
            aria-label={text.discipline}
            value={draft.discipline}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                discipline: event.target.value as 'ski' | 'snowboard',
              })
            }
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
          >
            <option value="ski">{text.ski}</option>
            <option value="snowboard">{text.snowboard}</option>
          </select>
          <textarea
            aria-label={text.instructorComment}
            value={draft.instructorComment}
            onChange={(event) => onDraftChange({ ...draft, instructorComment: event.target.value })}
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
            rows={3}
          />
          <button
            type="submit"
            disabled={pending}
            className="border border-[var(--border)] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider disabled:opacity-50"
          >
            {text.saveParticipant}
          </button>
        </form>
      ) : null}
      <div className="flex gap-2">
        {canArchive ? (
          <button
            type="button"
            disabled={pending}
            onClick={onArchive}
            className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider disabled:opacity-50"
          >
            {text.archiveParticipant}
          </button>
        ) : null}
        {canRestore ? (
          <button
            type="button"
            disabled={pending}
            onClick={onRestore}
            className="border border-[var(--border)] px-3 py-2 text-xs font-mono uppercase tracking-wider disabled:opacity-50"
          >
            {text.restoreParticipant}
          </button>
        ) : null}
      </div>
    </div>
  );
}
