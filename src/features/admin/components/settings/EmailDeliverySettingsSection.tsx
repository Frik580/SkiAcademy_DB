import React, { useCallback, useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { AggregateRevisionSchema, IdempotencyKeySchema } from '@ski-academy/shared-domain';
import type { EmailDeliveryControlState } from '@ski-academy/shared-domain';
import { useLanguage } from '../../../../app/providers/LanguageContext';
import { auth } from '../../../../infrastructure/firebase';
import { executeAuthenticatedCanonicalCommand } from '../../../../lib/canonical/canonicalCommandClient';
import { queryEmailDeliverySettingsReadModel } from '../../../../lib/canonical/canonicalReadModelClient';
import { ToggleSwitch } from '../../../../ui/ToggleSwitch';
import { AdminCollapsibleSection } from './AdminCollapsibleSection';

type SaveMessage = 'saved' | 'failed' | null;

export const EmailDeliverySettingsSection: React.FC = () => {
  const { t } = useLanguage();
  const [state, setState] = useState<EmailDeliveryControlState | undefined>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<SaveMessage>(null);

  const load = useCallback(async () => {
    const result = await queryEmailDeliverySettingsReadModel({
      scope: 'email_delivery_settings',
    });
    setState(result.email);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void load().catch(() => {
      if (!cancelled) setMessage('failed');
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const save = async (enabled: boolean) => {
    if (!state || pending || !state.providerConfigured) return;
    const accountId = auth.currentUser?.uid;
    if (!accountId) {
      setMessage('failed');
      return;
    }
    const previous = state;
    setPending(true);
    setMessage(null);
    try {
      const idempotencyKey = IdempotencyKeySchema.parse(
        `email-delivery-${crypto.randomUUID().replaceAll('-', '')}`
      );
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'set_email_delivery_enabled',
        intent: {
          enabled,
          reasonExplanation: 'Administrator changed external email delivery.',
        },
        idempotencyKey,
        expectedRevision: AggregateRevisionSchema.parse(state.revision),
        administratorContext: true,
      });
      if (result.status === 'error') {
        setState(previous);
        setMessage('failed');
        try {
          await load();
        } catch {
          setState(previous);
        }
        return;
      }
      await load();
      setMessage('saved');
    } catch {
      setState(previous);
      setMessage('failed');
    } finally {
      setPending(false);
    }
  };

  const providerConfigured = state?.providerConfigured === true;
  const deliveryEnabled = providerConfigured && state?.deliveryEnabled === true;
  const statusText = !state
    ? null
    : providerConfigured
      ? t('emailDeliveryProviderConfigured')
      : t('emailDeliveryProviderNotConfigured');
  const description = !state
    ? null
    : !providerConfigured
      ? t('emailDeliveryUnavailable')
      : state.effectiveDeliveryEnabled
        ? t('emailDeliveryEnabledHint')
        : t('emailDeliveryDisabledHint');

  return (
    <AdminCollapsibleSection
      id="email_delivery"
      title={t('emailDeliveryTitle')}
      icon={Mail}
      defaultOpen
    >
      <div className="space-y-3 max-w-xl">
        <div className="flex items-center justify-between gap-3 border border-[var(--border)] p-3 bg-black/5 dark:bg-white/5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
            {t('emailDeliveryProviderLabel')}
          </span>
          <span className="text-xs font-mono uppercase tracking-wider text-[var(--ink)] font-bold">
            {statusText}
          </span>
        </div>
        <ToggleSwitch
          id="email-delivery-enabled"
          checked={deliveryEnabled}
          disabled={!providerConfigured || pending || !state}
          onChange={(checked) => {
            void save(checked);
          }}
          label={t('emailDeliveryToggleLabel')}
          description={description}
        />
        {pending ? (
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink-dim)]">
            {t('emailDeliverySaving')}
          </p>
        ) : null}
        {message === 'saved' ? (
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--ink)]">
            {t('emailDeliverySaved')}
          </p>
        ) : null}
        {message === 'failed' ? (
          <p className="text-[10px] font-mono uppercase tracking-wider text-red-500" role="alert">
            {t('emailDeliverySaveFailed')}
          </p>
        ) : null}
      </div>
    </AdminCollapsibleSection>
  );
};
