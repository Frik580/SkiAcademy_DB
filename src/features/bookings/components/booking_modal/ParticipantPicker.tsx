import React from 'react';
import type { ManagedParticipantOption } from '../../../../features/lesson-bookings/lessonBookingContracts';

interface ParticipantPickerProps {
  participants: ManagedParticipantOption[];
  selectedParticipantIds: string[];
  onToggleParticipant: (participantId: string) => void;
  loading: boolean;
  t: (key: string) => string;
}

export const ParticipantPicker: React.FC<ParticipantPickerProps> = ({
  participants,
  selectedParticipantIds,
  onToggleParticipant,
  loading,
  t,
}) => {
  if (loading) {
    return <p className="text-xs text-[var(--ink-dim)]">{t('loading')}</p>;
  }
  if (participants.length === 0) {
    return <p className="text-xs text-[var(--ink-dim)]">{t('bookingSelectParticipant')}</p>;
  }

  return (
    <div className="space-y-2">
      <label className="text-xs text-[var(--ink-dim)]">{t('bookingParticipantsLabel')}</label>
      <div className="flex flex-wrap gap-2">
        {participants.map((participant) => {
          const selected = selectedParticipantIds.includes(participant.participantId);
          return (
            <button
              key={participant.participantId}
              type="button"
              onClick={() => onToggleParticipant(participant.participantId)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                selected
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--ink)]'
                  : 'border-[var(--border-subtle)] text-[var(--ink-dim)]'
              }`}
            >
              {participant.displayName}
            </button>
          );
        })}
      </div>
    </div>
  );
};
