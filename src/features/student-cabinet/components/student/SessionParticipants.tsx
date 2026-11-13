import { useEffect, useRef, useState } from 'react';
import { ParticipantAvatarFace } from '../CabinetParticipantAvatarSwitcher';
import type { SessionParticipantInput } from './studentCabinetContracts';
import { useStudentCabinetTranslations } from './useStudentCabinetTranslations';

export function SessionParticipants({
  participants,
  avatarsOnly = false,
}: {
  readonly avatarsOnly?: boolean;
  readonly participants: readonly SessionParticipantInput[];
}) {
  const { t } = useStudentCabinetTranslations();
  const ref = useRef<HTMLUListElement>(null);
  const [capacity, setCapacity] = useState(5);
  useEffect(() => {
    if (!avatarsOnly || !ref.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      // Match the shared 32px avatars and 8px gaps.
      setCapacity(Math.max(1, Math.floor((entry.contentRect.width + 8) / 40)));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [avatarsOnly]);
  const visibleCount = participants.length <= capacity ? participants.length : capacity - 1;
  const visible = avatarsOnly ? participants.slice(0, visibleCount) : participants;
  const hidden = participants.slice(visible.length);
  return (
    <ul
      ref={ref}
      className={avatarsOnly ? 'sc-session-participants' : 'flex flex-wrap gap-x-4 gap-y-2'}
      aria-label={t('bookingParticipantsLabel')}
    >
      {visible.map((participant) => (
        <li
          key={participant.participantId}
          title={avatarsOnly ? participant.displayName : undefined}
          aria-label={avatarsOnly ? participant.displayName : undefined}
          className="flex min-w-0 items-center gap-2 type-compact text-[var(--ink)]"
        >
          <span className="ui-avatar h-8 w-8 shrink-0 overflow-hidden rounded-full">
            <ParticipantAvatarFace url={participant.avatarUrl} name={participant.displayName} />
          </span>
          {!avatarsOnly && <span className="break-words">{participant.displayName}</span>}
        </li>
      ))}
      {hidden.length > 0 && (
        <li
          className="sc-session-participants-overflow"
          title={hidden.map((p) => p.displayName).join(', ')}
          aria-label={hidden.map((p) => p.displayName).join(', ')}
        >
          +{hidden.length}
        </li>
      )}
    </ul>
  );
}
