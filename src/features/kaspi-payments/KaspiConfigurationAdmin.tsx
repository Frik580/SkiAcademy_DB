import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AggregateRevisionSchema, IdempotencyKeySchema } from '@ski-academy/shared-domain';
import { executeAuthenticatedCanonicalCommand } from '../../lib/canonical/canonicalCommandClient';
import { AdminModal } from '../admin/components/AdminModal';
import type { KaspiAdminConfigurationInput } from './kaspiContracts';
import { queryKaspi } from './kaspiService';
import { useKaspiTranslations } from './useKaspiTranslations';

export function KaspiConfigurationAdmin({ accountId }: { accountId: string }) {
  const { t } = useKaspiTranslations();
  const toggleId = useId();
  const [config, setConfig] = useState<KaspiAdminConfigurationInput>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<{ enabled: boolean; revision: number; key: string }>();
  const lock = useRef(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const result = await queryKaspi<KaspiAdminConfigurationInput>({
        scope: 'admin_configuration',
      });
      if (current === generation.current) {
        setConfig(result);
        setError(false);
        return true;
      }
    } catch {
      if (current === generation.current) {
        setConfig(undefined);
        setError(true);
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
    return false;
  }, []);
  useEffect(() => {
    const requests = generation;
    const onFocus = () => {
      if (!lock.current) void refresh();
    };
    void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      ++requests.current;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);
  async function confirm() {
    if (!pending || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError(false);
    setSaved(false);
    try {
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'set_kaspi_payment_enabled',
        intent: { enabled: pending.enabled },
        expectedRevision: AggregateRevisionSchema.parse(pending.revision),
        idempotencyKey: IdempotencyKeySchema.parse(pending.key),
      });
      if (result.status !== 'success') throw new Error('Configuration change failed');
      setPending(undefined);
      setSaved(await refresh());
      window.dispatchEvent(new Event('kaspi-configuration-changed'));
    } catch {
      await refresh();
      setError(true);
      setPending(undefined);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <section
      className="space-y-3 border border-[var(--border)] bg-[var(--card-bg)] p-4 text-[var(--ink)]"
      aria-label={t('kaspiSettingsTitle')}
      aria-busy={loading || saving}
    >
      <h3 className="type-card-title">{t('kaspiSettingsTitle')}</h3>
      {loading && <p role="status">{t('processing')}</p>}
      {config && (
        <>
          <p>{t(config.enabled ? 'kaspiEnabled' : 'kaspiDisabled')}</p>
          {config.merchantName && <p className="break-words">{config.merchantName}</p>}
          {!config.ready && <p role="alert">{t('kaspiConfigurationMissing')}</p>}
          <label htmlFor={toggleId} className="flex items-center gap-3">
            <input
              id={toggleId}
              type="checkbox"
              role="switch"
              checked={config.enabled}
              disabled={loading || saving || (!config.enabled && !config.ready)}
              onChange={() => {
                setSaved(false);
                setPending({
                  enabled: !config.enabled,
                  revision: config.revision,
                  key: `kaspi_toggle_${crypto.randomUUID()}`,
                });
              }}
            />
            {t('kaspiAllowPayments')}
          </label>
        </>
      )}
      {saving && <p role="status">{t('processing')}</p>}
      {saved && <p role="status">{t('kaspiSettingsSaved')}</p>}
      {error && <p role="alert">{t('kaspiSettingsError')}</p>}
      <button
        type="button"
        className="btn-secondary px-3 py-2"
        disabled={loading || saving}
        onClick={() => {
          setSaved(false);
          void refresh();
        }}
      >
        {t('guestCheckStatus')}
      </button>
      {pending && (
        <AdminModal
          title={t(pending.enabled ? 'kaspiEnableTitle' : 'kaspiDisableTitle')}
          closeLabel={t('closeBtn')}
          onClose={() => setPending(undefined)}
          closeDisabled={saving}
        >
          <div className="space-y-3 p-4">
            <p>{t(pending.enabled ? 'kaspiEnableExplanation' : 'kaspiDisableExplanation')}</p>
            {pending.enabled && <p>{t('kaspiAgreementConfirmation')}</p>}
            <button
              type="button"
              className="btn-primary px-4 py-2"
              disabled={saving}
              onClick={() => void confirm()}
            >
              {saving ? t('processing') : t('confirm')}
            </button>
          </div>
        </AdminModal>
      )}
    </section>
  );
}
