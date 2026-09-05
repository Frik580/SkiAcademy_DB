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
      <h4 className="text-sm font-medium">{text.participants}</h4>
      {canProvisionSelf ? (
        <div className="space-y-2 border border-dashed border-[var(--border)] p-3">
          <p className="text-xs text-[var(--ink-dim)]">{text.missingSelf}</p>
          <button
            type="button"
            disabled={pending}
            onClick={onProvisionSelf}
            className="border border-[var(--border)] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider disabled:opacity-50"
          >
            {text.provisionSelf}
          </button>
        </div>
      ) : null}
      {participants.length === 0 && !canProvisionSelf ? (
        <p className="text-xs text-[var(--ink-dim)]">{text.noParticipants}</p>
      ) : null}
      <ul className="space-y-2">
        {participants.map((participant) => (
          <li
            key={participant.participantId}
            className="flex items-start justify-between gap-3 border border-[var(--border)] p-3"
          >
            <div className="space-y-0.5 text-xs">
              <p className="font-medium">{participant.displayName}</p>
              <p className="text-[var(--ink-dim)]">
                {adminClientRelationshipLabel(participant.authority, text)}
                {' · '}
                {adminClientParticipantLifecycleLabel(participant.lifecycle, text)}
              </p>
              {adminClientAgeLabel(participant.age, text) ? (
                <p className="font-mono text-[10px] text-[var(--ink-dim)]">
                  {text.age}: {adminClientAgeLabel(participant.age, text)}
                </p>
              ) : null}
              {adminClientSkillLevelLabel(participant.skillLevel) ? (
                <p className="font-mono text-[10px] text-[var(--ink-dim)]">
                  {text.participantSkillLevel}: {adminClientSkillLevelLabel(participant.skillLevel)}
                </p>
              ) : null}
              {adminClientDisciplineLabel(participant.discipline, text) ? (
                <p className="font-mono text-[10px] text-[var(--ink-dim)]">
                  {text.discipline}: {adminClientDisciplineLabel(participant.discipline, text)}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onOpenParticipant(participant.participantId)}
              className="shrink-0 border border-[var(--border)] px-2 py-1 text-[10px] font-mono uppercase tracking-wider"
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
          <p className="text-[10px] font-mono uppercase text-[var(--ink-dim)]">
            {text.addParticipant}
          </p>
          <input
            aria-label={text.displayName}
            value={dependentDraft.displayName}
            onChange={(event) =>
              onDependentChange({ ...dependentDraft, displayName: event.target.value })
            }
            placeholder={text.displayName}
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
            required
          />
          <input
            aria-label={text.birthDate}
            type="date"
            value={dependentDraft.birthDate}
            onChange={(event) =>
              onDependentChange({ ...dependentDraft, birthDate: event.target.value })
            }
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
            required
          />
          <input
            aria-label={text.participantSkillLevel}
            value={dependentDraft.skillLevel}
            onChange={(event) =>
              onDependentChange({ ...dependentDraft, skillLevel: event.target.value })
            }
            placeholder={text.participantSkillLevel}
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
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
            className="w-full border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-xs"
          >
            <option value="ski">{text.ski}</option>
            <option value="snowboard">{text.snowboard}</option>
          </select>
          <button
            type="submit"
            disabled={pending}
            className="border border-[var(--border)] px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider disabled:opacity-50"
          >
            {text.addParticipant}
          </button>
        </form>
      ) : null}
    </section>
  );
}
