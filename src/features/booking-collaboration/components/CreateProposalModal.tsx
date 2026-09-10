import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock } from 'lucide-react';
import {
  calculateIndividualBookingPriceKzt,
  calculateLessonPartyPriceKzt,
  KztMinorUnitsSchema,
} from '@ski-academy/shared-domain';
import type { InstructorProposalPartyCandidate } from '../bookingCollaborationContracts';
import { useBookingCollaborationTranslations } from '../useBookingCollaborationTranslations';
import { useRescheduleBookingAvailability } from '../useRescheduleBookingAvailability';
import { toLocalDateStr } from '../../../domain/availability';
import { resolveLessonStartTimeSelection } from '../../bookings/instructorOccupancyForBookingModal';
import { BookingAppleDatePicker } from '../../bookings/components/booking_modal/BookingAppleDatePicker';
import { BookingAppleWheelPicker } from '../../bookings/components/booking_modal/BookingAppleWheelPicker';
import { buildBookingTimePickerOptions } from '../../bookings/components/booking_modal/bookingTimePickerOptions';
import { formatDurationLabel } from '../../../lib/i18n/duration';
import { useLanguage } from '../../../app/providers/LanguageContext';
import { ActionButton } from '../../../ui/ActionButton';

const DURATION_HOURS_OPTIONS = [1, 2, 3, 4, 6] as const;

function durationMinutesToHours(minutes: number): number {
  const hours = minutes / 60;
  return (DURATION_HOURS_OPTIONS as readonly number[]).includes(hours) ? hours : 2;
}

export interface CreateProposalModalProps {
  readonly open: boolean;
  readonly instructorId: string;
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
  instructorId,
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
  const { language } = useLanguage();
  const [localDate, setLocalDate] = useState(defaultDate);
  const [localTime, setLocalTime] = useState(defaultTime);
  const [durationHours, setDurationHours] = useState(() =>
    durationMinutesToHours(defaultDurationMinutes)
  );
  const selectableDefaultIds = () =>
    defaultSelectedParticipantIds.filter((participantId) =>
      participants.some(
        (participant) => participant.participantId === participantId && participant.selectable
      )
    );
  const [selectedParticipantIds, setSelectedParticipantIds] =
    useState<string[]>(selectableDefaultIds);
  const [submitting, setSubmitting] = useState(false);

  const minBookingDateStr = useMemo(() => toLocalDateStr(), []);
  const locale = language === 'ru' ? 'ru-RU' : 'en-US';
  const labelStyle = 'mb-1.5 flex items-center gap-1.5 truncate text-xs text-[var(--ink-dim)]';

  useEffect(() => {
    if (!open) return;
    setLocalDate(defaultDate);
    setLocalTime(defaultTime);
    setDurationHours(durationMinutesToHours(defaultDurationMinutes));
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

  const { availableSlots, isLoadingBookings, occupancyLoadFailed } = useRescheduleBookingAvailability(
    {
      isOpen: open,
      instructorId,
      localDate,
      durationHours,
      excludeBookingId: '',
    }
  );

  const timeOptions = useMemo(
    () =>
      buildBookingTimePickerOptions({
        isLoadingBookings,
        occupancyLoadFailed,
        availableSlots,
        t: copy.t as (key: string) => string,
      }),
    [availableSlots, copy.t, isLoadingBookings, occupancyLoadFailed]
  );

  const durationOptions = useMemo(
    () =>
      DURATION_HOURS_OPTIONS.map((hrs) => ({
        value: String(hrs),
        label: formatDurationLabel(hrs, language === 'ru' ? 'ru' : 'en'),
      })),
    [language]
  );

  useEffect(() => {
    const nextTime = resolveLessonStartTimeSelection(localTime, availableSlots);
    if (nextTime !== localTime) {
      setLocalTime(nextTime);
    }
  }, [availableSlots, localTime]);

  const selectedLabels = useMemo(
    () =>
      participants
        .filter((participant) => selectedParticipantIds.includes(participant.participantId))
        .map((participant) => participant.label),
    [participants, selectedParticipantIds]
  );

  const durationMinutes = durationHours * 60;

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

  const canSubmit =
    !submitting &&
    !!localDate &&
    !!localTime &&
    selectedParticipantIds.length > 0 &&
    !isLoadingBookings &&
    !occupancyLoadFailed &&
    availableSlots.includes(localTime);

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelStyle}>
              <Calendar className="h-3.5 w-3.5" /> {copy.t('selectDate')}
            </label>
            <BookingAppleDatePicker
              value={localDate}
              onChange={setLocalDate}
              min={minBookingDateStr}
              locale={locale}
              placeholder={copy.t('selectDate')}
              aria-label={copy.t('selectDate')}
            />
          </div>
          <div>
            <label className={labelStyle}>
              <Clock className="h-3.5 w-3.5" /> {copy.t('collabSelectTime')}
            </label>
            <BookingAppleWheelPicker
              value={localTime}
              onChange={setLocalTime}
              options={timeOptions}
              disabled={isLoadingBookings || occupancyLoadFailed || availableSlots.length === 0}
              placeholder={
                isLoadingBookings
                  ? `${copy.t('loading')}...`
                  : occupancyLoadFailed
                    ? copy.t('instructorOccupancyLoadFailed')
                    : availableSlots.length === 0
                      ? copy.t('noSlotsAvailable')
                      : ''
              }
              aria-label={copy.t('collabSelectTime')}
            />
          </div>
          <div>
            <label className={labelStyle}>
              <Clock className="h-3.5 w-3.5" /> {copy.t('durationHours')}
            </label>
            <BookingAppleWheelPicker
              value={String(durationHours)}
              onChange={(value) => setDurationHours(Number(value))}
              options={durationOptions}
              aria-label={copy.t('durationHours')}
            />
          </div>
        </div>
        {pricePreviewLabel && <p className="text-xs text-[var(--ink-dim)]">{pricePreviewLabel}</p>}
        <div className="flex justify-end gap-2">
          <ActionButton
            type="button"
            unstyled
            disabled={submitting}
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--border-subtle)]"
          >
            {copy.t('cancel')}
          </ActionButton>
          <ActionButton
            type="button"
            unstyled
            pending={submitting}
            pendingLabel={copy.t('submitting')}
            disabled={!canSubmit}
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
            className="px-4 py-2 text-sm rounded-lg bg-[var(--accent)] text-white disabled:opacity-50"
          >
            {copy.createProposal}
          </ActionButton>
        </div>
      </div>
    </div>
  );
};
