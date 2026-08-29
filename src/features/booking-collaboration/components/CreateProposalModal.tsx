import React, { useState } from 'react';
import { useBookingCollaborationTranslations } from '../useBookingCollaborationTranslations';

export interface CreateProposalModalProps {
  readonly open: boolean;
  readonly participantLabel?: string;
  readonly defaultDate?: string;
  readonly defaultTime?: string;
  readonly defaultDurationMinutes?: number;
  readonly onClose: () => void;
  readonly onSubmit: (input: {
    readonly localDate: string;
    readonly localTime: string;
    readonly durationMinutes: number;
  }) => Promise<void>;
}

export const CreateProposalModal: React.FC<CreateProposalModalProps> = ({
  open,
  participantLabel,
  defaultDate = '',
  defaultTime = '',
  defaultDurationMinutes = 120,
  onClose,
  onSubmit,
}) => {
  const copy = useBookingCollaborationTranslations();
  const [localDate, setLocalDate] = useState(defaultDate);
  const [localTime, setLocalTime] = useState(defaultTime);
  const [durationMinutes, setDurationMinutes] = useState(defaultDurationMinutes);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--card-bg)] p-5 shadow-xl space-y-4">
        <h3 className="text-lg font-serif text-[var(--ink)]">{copy.createProposal}</h3>
        {participantLabel && <p className="text-sm text-[var(--ink-dim)]">{participantLabel}</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-[var(--ink-dim)] space-y-1">
            <span>{copy.t('selectDate')}</span>
            <input
              type="date"
              value={localDate}
              onChange={(event) => setLocalDate(event.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs text-[var(--ink-dim)] space-y-1">
            <span>{copy.t('collabSelectTime')}</span>
            <input
              type="time"
              value={localTime}
              onChange={(event) => setLocalTime(event.target.value)}
              className="w-full rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="text-xs text-[var(--ink-dim)] space-y-1 block">
          <span>{copy.t('collabDurationMinutes')}</span>
          <input
            type="number"
            min={30}
            step={30}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
            className="w-full rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">
            {copy.t('cancel')}
          </button>
          <button
            type="button"
            disabled={submitting || !localDate || !localTime}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmit({ localDate, localTime, durationMinutes });
                onClose();
              } finally {
                setSubmitting(false);
              }
            }}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--accent)] text-white"
          >
            {copy.createProposal}
          </button>
        </div>
      </div>
    </div>
  );
};
