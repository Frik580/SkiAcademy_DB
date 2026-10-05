import { ParticipantAvatarFace } from '../CabinetParticipantAvatarSwitcher';
import type { SessionParticipantInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';

export function SessionParticipants({
  participants,
}: {
  readonly participants: readonly SessionParticipantInput[];
}) {
  const { t } = useStudentCabinetTranslations();
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2" aria-label={t('bookingParticipantsLabel')}>
      {participants.map((participant) => (
        <li
          key={participant.participantId}
          className="flex min-w-0 items-center gap-2 text-sm text-[var(--ink)]"
        >
          <span className="ui-avatar h-8 w-8 shrink-0 overflow-hidden rounded-full">
            <ParticipantAvatarFace url={participant.avatarUrl} name={participant.displayName} />
          </span>
          <span className="break-words">{participant.displayName}</span>
        </li>
      ))}
    </ul>
  );
}
