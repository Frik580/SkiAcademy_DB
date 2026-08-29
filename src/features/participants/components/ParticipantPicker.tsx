import React from 'react';
import type { ManagedParticipantOption } from '../../lesson-bookings/lessonBookingContracts';
import { MAX_MULTI_PARTICIPANT_SELECTION } from '../participantSelectionState';

export interface ParticipantPickerProps {
  readonly participants: readonly ManagedParticipantOption[];
  readonly selectedParticipantIds: readonly string[];
  readonly onToggleParticipant: (participantId: string) => void;
  readonly loading: boolean;
  readonly error?: string;
  readonly onRetry?: () => void;
  readonly maxParticipants?: number;
  readonly t: (key: string) => string;
  readonly onCreateDependent?: () => void;
}

function authorityLabel(
  authority: ManagedParticipantOption['authority'],
  t: (key: string) => string
): string {
  return authority === 'self' ? t('participantAuthoritySelf') : t('participantAuthorityDependent');
}

export const ParticipantPicker: React.FC<ParticipantPickerProps> = ({
  participants,
  selectedParticipantIds,
  onToggleParticipant,
  loading,
  error,
  onRetry,
  maxParticipants = MAX_MULTI_PARTICIPANT_SELECTION,
  t,
  onCreateDependent,
}) => {
  if (loading) {
    return <p className="text-xs text-[var(--ink-dim)]">{t('loading')}</p>;
  }

  if (error) {
    return (
      <div className="space-y-2 rounded-lg border border-rose-200/60 bg-rose-50/40 p-3 dark:border-rose-900/40 dark:bg-rose-950/20">
        <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={() => void onRetry()}
            className="text-xs font-medium text-[var(--accent)] hover:underline"
          >
            {t('retry')}
          </button>
        )}
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-[var(--ink-dim)]">{t('participantsNoneAvailable')}</p>
        {onCreateDependent && (
          <button
            type="button"
            onClick={onCreateDependent}
            className="text-xs font-medium text-[var(--accent)] hover:underline"
          >
            {t('participantsCreateDependent')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-[var(--ink-dim)]">{t('bookingParticipantsLabel')}</label>
        {requiresSelectionHint(participants) && (
          <span className="text-[10px] uppercase tracking-wide text-[var(--ink-dim)]">
            {t('participantsChooseExplicitly')}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {participants.map((participant) => {
          const selected = selectedParticipantIds.includes(participant.participantId);
          const atLimit = !selected && selectedParticipantIds.length >= maxParticipants;
          return (
            <button
              key={participant.participantId}
              type="button"
              disabled={atLimit}
              onClick={() => onToggleParticipant(participant.participantId)}
              className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                selected
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--ink)]'
                  : atLimit
                    ? 'cursor-not-allowed border-[var(--border-subtle)] text-[var(--ink-dim)]/50'
                    : 'border-[var(--border-subtle)] text-[var(--ink-dim)]'
              }`}
            >
              <span>{participant.displayName}</span>
              <span className="ml-1.5 text-[10px] uppercase tracking-wide opacity-70">
                {authorityLabel(participant.authority, t)}
              </span>
            </button>
          );
        })}
      </div>
      {selectedParticipantIds.length >= maxParticipants && (
        <p className="text-[10px] text-[var(--ink-dim)]">
          {t('participantsMaxSelected').replace('{count}', String(maxParticipants))}
        </p>
      )}
      {onCreateDependent && (
        <button
          type="button"
          onClick={onCreateDependent}
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          {t('participantsCreateDependent')}
        </button>
      )}
    </div>
  );
};

function requiresSelectionHint(participants: readonly ManagedParticipantOption[]): boolean {
  return participants.length > 1;
}
