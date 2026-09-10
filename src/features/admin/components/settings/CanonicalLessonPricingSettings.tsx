import React, { useCallback, useEffect, useState } from 'react';
import {
  IdempotencyKeySchema,
  KztMinorUnitsSchema,
  MaxParticipantsPerLessonSchema,
  AggregateRevisionSchema,
  type AggregateRevision,
} from '@ski-academy/shared-domain';
import { auth } from '../../../../infrastructure/firebase';
import { executeAuthenticatedCanonicalCommand } from '../../../../lib/canonical/canonicalCommandClient';
import { queryLessonPricingSettingsReadModel } from '../../../../lib/canonical/canonicalReadModelClient';
import { useAdminProductSettingsTranslations } from './useAdminProductSettingsTranslations';
import { ActionButton } from '../../../../ui/ActionButton';

export const CanonicalLessonPricingSettings: React.FC = () => {
  const { text } = useAdminProductSettingsTranslations();
  const [amount, setAmount] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [reason, setReason] = useState('');
  const [revision, setRevision] = useState<AggregateRevision | undefined>();
  const [configured, setConfigured] = useState<boolean | undefined>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await queryLessonPricingSettingsReadModel({
      scope: 'lesson_pricing_settings',
    });
    setConfigured(result.item.configured);
    if (result.item.configured) {
      setAmount(String(result.item.additionalParticipantSurchargePerHourKzt));
      setMaxParticipants(String(result.item.maxParticipantsPerLesson));
      setRevision(result.item.revision);
    } else {
      setAmount('');
      setMaxParticipants('');
      setRevision(undefined);
    }
  }, []);

  useEffect(() => {
    void load().catch(() => {
      setConfigured(false);
      setMessage(text.failed);
    });
  }, [load, text.failed]);

  const save = async () => {
    const accountId = auth.currentUser?.uid;
    const parsedAmount = KztMinorUnitsSchema.safeParse(Number(amount));
    const parsedMaxParticipants = MaxParticipantsPerLessonSchema.safeParse(Number(maxParticipants));
    if (
      !accountId ||
      !amount.trim() ||
      !parsedAmount.success ||
      !maxParticipants.trim() ||
      !parsedMaxParticipants.success ||
      !reason.trim()
    ) {
      setMessage(text.invalid);
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const idempotencyKey = IdempotencyKeySchema.parse(
        `lesson-pricing-${crypto.randomUUID().replaceAll('-', '')}`
      );
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'update_lesson_pricing_settings',
        intent: {
          additionalParticipantSurchargePerHourKzt: parsedAmount.data,
          maxParticipantsPerLesson: parsedMaxParticipants.data,
          reasonExplanation: reason.trim(),
        },
        idempotencyKey,
        expectedRevision: revision ?? AggregateRevisionSchema.parse(0),
        administratorContext: true,
      });
      if (result.status === 'error') {
        if (result.error.code === 'stale_version') {
          await load();
          setMessage(text.stale);
        } else {
          setMessage(text.failed);
        }
        return;
      }
      setReason('');
      await load();
      setMessage(text.saved);
    } catch {
      setMessage(text.failed);
    } finally {
      setPending(false);
    }
  };

  if (configured === undefined) {
    return <p className="text-sm text-[var(--muted)]">{text.loading}</p>;
  }

  return (
    <div className="space-y-4">
      {!configured && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {text.unconfigured}
        </p>
      )}
      <label className="block space-y-1 text-sm">
        <span>{text.surchargeLabel}</span>
        <input
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          type="number"
          min="0"
          step="1"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{text.maxParticipantsLabel}</span>
        <input
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          type="number"
          min="1"
          step="1"
          value={maxParticipants}
          onChange={(event) => setMaxParticipants(event.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>{text.reasonLabel}</span>
        <input
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          value={reason}
          placeholder={text.reasonPlaceholder}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <ActionButton
          type="button"
          unstyled
          pending={pending}
          pendingLabel={text.saving}
          onClick={() => void save()}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {text.save}
        </ActionButton>
        {revision !== undefined && (
          <span className="text-xs text-[var(--muted)]">
            {text.revision}: {revision}
          </span>
        )}
      </div>
      {message && <p className="text-sm text-[var(--muted)]">{message}</p>}
    </div>
  );
};
