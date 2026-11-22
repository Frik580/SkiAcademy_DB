import { ProtectedImage } from '../../media/ProtectedImage';
import React from 'react';
import { DisabledOptionTooltip } from '../../../ui/DisabledOptionTooltip';
import type { ManagedParticipantOption } from '../../lesson-bookings/lessonBookingContracts';

export interface ParticipantPickerProps {
  readonly participants: readonly ManagedParticipantOption[];
  readonly selectedParticipantIds: readonly string[];
  readonly onToggleParticipant: (participantId: string) => void;
  readonly loading: boolean;
  readonly error?: string;
  readonly onRetry?: () => void;
  readonly maxParticipants?: number;
  readonly onRemoveUnavailableParticipants?: () => void;
  readonly unavailableParticipantReasons?: Readonly<Record<string, string>>;
  /** `single` replaces the current id (cabinet switcher). Default stays multi-select. */
  readonly selectionMode?: 'single' | 'multiple';
  readonly hideDependentLabel?: boolean;
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
  maxParticipants,
  unavailableParticipantReasons,
  onRemoveUnavailableParticipants,
  selectionMode = 'multiple',
  hideDependentLabel = false,
  t,
  onCreateDependent,
}) => {
  if (loading) {
    return <p className="type-caption text-[var(--ink-dim)]">{t('loading')}</p>;
  }

  if (error) {
    return (
      <div className="space-y-2 rounded-lg border border-rose-200/60 bg-rose-50/40 p-3 dark:border-rose-900/40 dark:bg-rose-950/20">
        <p className="type-caption text-rose-700 dark:text-rose-300">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={() => void onRetry()}
            className="type-button text-[var(--accent)] hover:underline"
          >
            {t('retry')}
          </button>
        )}
      </div>
    );
  }

  if (participants.length < 2 && !unavailableParticipantReasons) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="type-caption text-[var(--ink-dim)]">
          {t('bookingParticipantsLabel')}
        </label>
        {selectionMode !== 'single' && requiresSelectionHint(participants) && (
          <span className="type-caption uppercase text-[var(--ink-dim)]">
            {t('participantsChooseExplicitly')}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {participants.map((participant) => {
          const selected = selectedParticipantIds.includes(participant.participantId);
          const atLimit =
            selectionMode !== 'single' &&
            !selected &&
            (maxParticipants === undefined || selectedParticipantIds.length >= maxParticipants);
          const reason = unavailableParticipantReasons?.[participant.participantId];
          const disabled = atLimit || Boolean(reason);
          const button = (
            <button
              key={participant.participantId}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => {
                if (!disabled) onToggleParticipant(participant.participantId);
              }}
              className={`inline-flex max-w-full items-center rounded-lg border px-3 py-1.5 type-button transition ${
                reason
                  ? 'pointer-events-none cursor-not-allowed border-[var(--border-subtle)] text-[var(--ink)] opacity-60'
                  : selected
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--ink)]'
                    : atLimit
                      ? 'cursor-not-allowed border-[var(--border-subtle)] text-[var(--ink-dim)]/50'
                      : 'border-[var(--border-subtle)] text-[var(--ink-dim)]'
              }`}
            >
              {participant.avatarUrl && (
                <ProtectedImage
                  src={participant.avatarUrl}
                  alt=""
                  className="mr-2 h-6 w-6 shrink-0 rounded-full object-cover"
                />
              )}
              <span>{participant.displayName}</span>
              {(!hideDependentLabel || participant.authority === 'self') && (
                <span className="ml-1.5 type-caption uppercase opacity-70">
                  {authorityLabel(participant.authority, t)}
                </span>
              )}
            </button>
          );
          return reason ? (
            <DisabledOptionTooltip
              key={participant.participantId}
              message={reason}
              label={participant.displayName}
            >
              {button}
            </DisabledOptionTooltip>
          ) : (
            button
          );
        })}
      </div>
      {onRemoveUnavailableParticipants &&
        selectedParticipantIds.some((id) => unavailableParticipantReasons?.[id]) && (
          <button
            type="button"
            onClick={onRemoveUnavailableParticipants}
            className="type-button text-[var(--accent)] hover:underline"
          >
            {t('bookingRemoveUnavailableParticipants')}
          </button>
        )}
      {selectionMode !== 'single' &&
        maxParticipants !== undefined &&
        selectedParticipantIds.length >= maxParticipants && (
          <p className="type-caption text-[var(--ink-dim)]">
            {t('participantsMaxSelected').replace('{count}', String(maxParticipants))}
          </p>
        )}
      {onCreateDependent && (
        <button
          type="button"
          onClick={onCreateDependent}
          className="type-button text-[var(--accent)] hover:underline"
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
