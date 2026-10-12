import type { ParticipantId } from '@ski-academy/shared-domain';
import type {
  AdminClientDependentDraft,
  AdminClientManagedParticipant,
} from './adminClientContracts';
import {
  adminClientAgeLabel,
  adminClientDisciplineLabel,
  adminClientParticipantLifecycleLabel,
  adminClientRelationshipLabel,
  adminClientSkillLevelLabel,
} from './adminClientLabels';
import type { useAdminClientTranslations } from './useAdminClientTranslations';
import { ActionButton } from '../../../ui/ActionButton';

interface AdminClientParticipantListProps {
  readonly participants: readonly AdminClientManagedParticipant[];
  readonly canCreateDependent: boolean;
  readonly canProvisionSelf: boolean;
  readonly dependentDraft: AdminClientDependentDraft;
  readonly pending: boolean;
  readonly text: ReturnType<typeof useAdminClientTranslations>['text'];
  readonly onDependentChange: (draft: AdminClientDependentDraft) => void;
  readonly onCreateDependent: () => void;
  readonly onProvisionSelf: () => void;
  readonly onOpenParticipant: (participantId: ParticipantId) => void;
}

export function AdminClientParticipantList({
  participants,
  canCreateDependent,
  canProvisionSelf,
  dependentDraft,
  pending,
  text,
  onDependentChange,
  onCreateDependent,
  onProvisionSelf,
  onOpenParticipant,
}: AdminClientParticipantListProps) {
  return (
    <section className="space-y-3 border border-[var(--border)] p-4">
      <h4 className="type-card-title">{text.participants}</h4>
      {canProvisionSelf ? (
        <div className="space-y-2 border border-dashed border-[var(--border)] p-3">
          <p className="type-caption text-[var(--ink-dim)]">{text.missingSelf}</p>
          <button
            type="button"
            disabled={pending}
            onClick={onProvisionSelf}
            className="border border-[var(--border)] px-3 py-2 type-button uppercase disabled:opacity-50"
          >
            {text.provisionSelf}
          </button>
        </div>
      ) : null}
      {participants.length === 0 && !canProvisionSelf ? (
        <p className="type-caption text-[var(--ink-dim)]">{text.noParticipants}</p>
      ) : null}
      <ul className="space-y-2">
        {participants.map((participant) => (
          <li
            key={participant.participantId}
            className="flex items-start justify-between gap-3 border border-[var(--border)] p-3"
          >
            <div className="space-y-0.5 type-caption">
              <p className="font-medium">{participant.displayName}</p>
              <p className="text-[var(--ink-dim)]">
                {adminClientRelationshipLabel(participant.authority, text)}
                {' · '}
                {adminClientParticipantLifecycleLabel(participant.lifecycle, text)}
              </p>
              {adminClientAgeLabel(participant.age, text) ? (
                <p className="type-caption text-[var(--ink-dim)]">
                  {text.age}: {adminClientAgeLabel(participant.age, text)}
                </p>
              ) : null}
              {adminClientSkillLevelLabel(participant.skillLevel) ? (
                <p className="type-caption text-[var(--ink-dim)]">
                  {text.participantSkillLevel}: {adminClientSkillLevelLabel(participant.skillLevel)}
                </p>
              ) : null}
              {adminClientDisciplineLabel(participant.discipline, text) ? (
                <p className="type-caption text-[var(--ink-dim)]">
                  {text.discipline}: {adminClientDisciplineLabel(participant.discipline, text)}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onOpenParticipant(participant.participantId)}
              className="shrink-0 border border-[var(--border)] px-2 py-1 type-button uppercase"
            >
              {text.openParticipant}
            </button>
          </li>
        ))}
      </ul>
      {canCreateDependent ? (
        <form
          className="space-y-2 border-t border-[var(--border)] pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateDependent();
          }}
        >
          <p className="type-caption uppercase text-[var(--ink-dim)]">{text.addParticipant}</p>
          <input
            aria-label={text.displayName}
            value={dependentDraft.displayName}
            onChange={(event) =>
              onDependentChange({ ...dependentDraft, displayName: event.target.value })
            }
            placeholder={text.displayName}
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 type-body"
            required
          />
          <input
            aria-label={text.birthDate}
            type="date"
            value={dependentDraft.birthDate}
            onChange={(event) =>
              onDependentChange({ ...dependentDraft, birthDate: event.target.value })
            }
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 type-body"
            required
          />
          <input
            aria-label={text.participantSkillLevel}
            value={dependentDraft.skillLevel}
            onChange={(event) =>
              onDependentChange({ ...dependentDraft, skillLevel: event.target.value })
            }
            placeholder={text.participantSkillLevel}
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 type-body"
            required
          />
          <select
            aria-label={text.discipline}
            value={dependentDraft.discipline}
            onChange={(event) =>
              onDependentChange({
                ...dependentDraft,
                discipline: event.target.value as 'ski' | 'snowboard',
              })
            }
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 type-body"
          >
            <option value="ski">{text.ski}</option>
            <option value="snowboard">{text.snowboard}</option>
          </select>
          <ActionButton type="submit" size="sm" pending={pending} pendingLabel={text.pending}>
            {text.addParticipant}
          </ActionButton>
        </form>
      ) : null}
    </section>
  );
}
