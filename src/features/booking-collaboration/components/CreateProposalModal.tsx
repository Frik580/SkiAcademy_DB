import React, { useEffect, useMemo, useState } from 'react';
import {
  calculateIndividualBookingPriceKzt,
  calculateLessonPartyPriceKzt,
  KztMinorUnitsSchema,
} from '@ski-academy/shared-domain';
import type { InstructorProposalPartyCandidate } from '../bookingCollaborationContracts';
import { useBookingCollaborationTranslations } from '../useBookingCollaborationTranslations';
import { ActionButton } from '../../../ui/ActionButton';

export interface CreateProposalModalProps {
  readonly open: boolean;
  readonly participants: readonly InstructorProposalPartyCandidate[];
  readonly defaultSelectedParticipantIds?: readonly string[];
  readonly maxParticipants?: number;
  readonly pricePreviewLabel?: string;
  readonly defaultDate?: string;
  readonly defaultTime?: string;
  readonly defaultDurationMinutes?: number;
  readonly pricingPreview?: {
    readonly hourlyRateKzt: number;
    readonly surchargePerHourKzt: number;
  };
  readonly onClose: () => void;
  readonly onSubmit: (input: {
    readonly participantIds: readonly string[];
    readonly localDate: string;
    readonly localTime: string;
    readonly durationMinutes: number;
  }) => Promise<void>;
}

export const CreateProposalModal: React.FC<CreateProposalModalProps> = ({
  open,
  participants,
  defaultSelectedParticipantIds = [],
  maxParticipants,
  pricePreviewLabel: pricePreviewLabelProp,
  defaultDate = '',
  defaultTime = '',
  defaultDurationMinutes = 120,
  pricingPreview,
  onClose,
  onSubmit,
}) => {
  const copy = useBookingCollaborationTranslations();
  const [localDate, setLocalDate] = useState(defaultDate);
  const [localTime, setLocalTime] = useState(defaultTime);
  const [durationMinutes, setDurationMinutes] = useState(defaultDurationMinutes);
  const selectableDefaultIds = () =>
    defaultSelectedParticipantIds.filter((participantId) =>
      participants.some(
        (participant) => participant.participantId === participantId && participant.selectable
      )
    );
  const [selectedParticipantIds, setSelectedParticipantIds] =
    useState<string[]>(selectableDefaultIds);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocalDate(defaultDate);
    setLocalTime(defaultTime);
    setDurationMinutes(defaultDurationMinutes);
    setSelectedParticipantIds(selectableDefaultIds());
    setSubmitting(false);
  }, [
    open,
    defaultDate,
    defaultTime,
    defaultDurationMinutes,
    defaultSelectedParticipantIds,
    participants,
  ]);

  const selectedLabels = useMemo(
    () =>
      participants
        .filter((participant) => selectedParticipantIds.includes(participant.participantId))
        .map((participant) => participant.label),
    [participants, selectedParticipantIds]
  );

  if (!open) return null;

  const atMax = maxParticipants !== undefined && selectedParticipantIds.length >= maxParticipants;

  let pricePreviewLabel = pricePreviewLabelProp;
  if (pricingPreview && selectedParticipantIds.length > 0 && durationMinutes > 0) {
    try {
      const amount = calculateLessonPartyPriceKzt({
        baseLessonPriceKzt: calculateIndividualBookingPriceKzt(
          KztMinorUnitsSchema.parse(pricingPreview.hourlyRateKzt),
          durationMinutes
        ),
        additionalParticipantSurchargePerHourKzt: KztMinorUnitsSchema.parse(
          pricingPreview.surchargePerHourKzt
        ),
        participantCount: selectedParticipantIds.length,
        lessonDurationMinutes: durationMinutes,
      });
      pricePreviewLabel = copy.proposalPricePreview(amount);
    } catch {
      pricePreviewLabel = pricePreviewLabelProp;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-[var(--card-bg)] p-5 shadow-xl space-y-4">
        <h3 className="text-lg font-serif text-[var(--ink)]">{copy.createProposal}</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--ink-dim)]">
            <span>{copy.proposalParticipantsLabel}</span>
            <span>
              {copy.proposalParticipantCount(selectedParticipantIds.length, maxParticipants)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {participants.map((participant) => {
              const selected = selectedParticipantIds.includes(participant.participantId);
              const disabled = !participant.selectable || (!selected && atMax);
              return (
                <button
                  key={participant.participantId}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setSelectedParticipantIds((current) =>
                      current.includes(participant.participantId)
                        ? current.filter((id) => id !== participant.participantId)
                        : [...current, participant.participantId]
                    );
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    selected
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--ink)]'
                      : 'border-[var(--border-subtle)] text-[var(--ink-dim)]'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {participant.label}
                  {participant.disabledReason === 'no_authority'
                    ? ` — ${copy.proposalParticipantNoAuthority}`
                    : ''}
                </button>
              );
            })}
          </div>
          {selectedLabels.length > 0 && (
            <p className="text-xs text-[var(--ink)]">
              {copy.proposalSelectedParticipants}: {selectedLabels.join(' · ')}
            </p>
          )}
        </div>
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
        {pricePreviewLabel && <p className="text-xs text-[var(--ink-dim)]">{pricePreviewLabel}</p>}
        <div className="flex justify-end gap-2">
          <ActionButton
            type="button"
            unstyled
            disabled={submitting}
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border"
          >
            {copy.t('cancel')}
          </ActionButton>
          <ActionButton
            type="button"
            unstyled
            pending={submitting}
            pendingLabel={copy.t('submitting')}
            disabled={!localDate || !localTime || selectedParticipantIds.length === 0}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmit({
                  participantIds: selectedParticipantIds,
                  localDate,
                  localTime,
                  durationMinutes,
                });
                onClose();
              } finally {
                setSubmitting(false);
              }
            }}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--accent)] text-white"
          >
            {copy.createProposal}
          </ActionButton>
        </div>
      </div>
    </div>
  );
};
