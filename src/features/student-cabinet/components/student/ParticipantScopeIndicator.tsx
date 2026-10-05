import { ParticipantAvatarFace } from '../CabinetParticipantAvatarSwitcher';
import type { SessionParticipantInput } from './studentCabinetContracts';

/** A read-only scope label; participant selection belongs to the cabinet header. */
export function ParticipantScopeIndicator({
  participant,
  visible,
}: {
  readonly participant?: SessionParticipantInput;
  readonly visible: boolean;
}) {
  if (!visible || !participant) return null;

  return (
    <span
      data-participant-scope={participant.participantId}
      title={participant.displayName}
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-tint)] px-2 py-1 text-xs font-normal normal-case tracking-normal text-[var(--ink-dim)]"
    >
      <span className="ui-avatar h-5 w-5 shrink-0 overflow-hidden rounded-full" aria-hidden="true">
        <ParticipantAvatarFace url={participant.avatarUrl} name={participant.displayName} />
      </span>
      <span className="min-w-0 truncate">{participant.displayName}</span>
    </span>
  );
}
