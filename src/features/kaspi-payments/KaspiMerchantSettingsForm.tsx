import { useEffect, useId, useRef, useState } from 'react';
import {
  AggregateRevisionSchema,
  IdempotencyKeySchema,
  KASPI_QR_MAX_BYTES,
  KASPI_QR_MIME_TYPES,
} from '@ski-academy/shared-domain';
import { executeAuthenticatedCanonicalCommand } from '../../lib/canonical/canonicalCommandClient';
import { uploadImage } from '../../infrastructure/firebase';
import { AdminModal } from '../admin/components/AdminModal';
import type { KaspiAdminConfigurationInput } from './kaspiContracts';
import { useKaspiTranslations } from './useKaspiTranslations';
import { kaspiQrImageSource } from './kaspiQrImage';

export function KaspiMerchantSettingsForm({
  accountId,
  configuration,
  disabled,
  onBusy,
  onSaved,
}: {
  accountId: string;
  configuration: KaspiAdminConfigurationInput;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useKaspiTranslations();
  const id = useId();
  const [name, setName] = useState(configuration.merchantName ?? '');
  const [minutes, setMinutes] = useState(
    String((configuration.walletRequestTtlSeconds ?? 3600) / 60)
  );
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [verified, setVerified] = useState(false);
  const [replaceMerchant, setReplaceMerchant] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [fileError, setFileError] = useState(false);
  const lock = useRef(false);
  // Retain the same uploaded object and idempotency key for a retry of this exact draft.
  const attempt = useRef<{ key: string; path?: string }>();
  useEffect(() => {
    if (!file) {
      setPreview(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function changed() {
    attempt.current = undefined;
    setError(false);
    setVerified(false);
  }
  const seconds = Number(minutes) * 60;
  const persistedQr = configuration.qrImageUrl
    ? kaspiQrImageSource(configuration.qrImageUrl)
    : undefined;
  const valid = Boolean(
    name.trim() &&
    name.trim().length <= 200 &&
    Number.isSafeInteger(seconds) &&
    seconds >= 60 &&
    seconds <= 2_592_000 &&
    (file || persistedQr) &&
    (!replaceMerchant || file) &&
    verified &&
    !fileError
  );
  async function save() {
    if (!valid || lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError(false);
    try {
      const current = attempt.current ?? { key: `kaspi_settings_${crypto.randomUUID()}` };
      attempt.current = current;
      if (file && !current.path) {
        const path = `kaspi-qr/${accountId}/${crypto.randomUUID()}`;
        await uploadImage(file, path);
        current.path = path;
      }
      const result = await executeAuthenticatedCanonicalCommand(accountId, {
        kind: 'save_kaspi_configuration',
        intent: {
          merchantName: name.trim(),
          walletRequestTtlSeconds: seconds,
          qrVerified: true,
          ...(current.path ? { qrStoragePath: current.path } : {}),
          ...(replaceMerchant ? { replaceMerchant: true } : {}),
        },
        expectedRevision: AggregateRevisionSchema.parse(configuration.revision),
        idempotencyKey: IdempotencyKeySchema.parse(current.key),
      });
      if (result.status !== 'success') throw new Error('Settings save failed');
      setConfirming(false);
      await onSaved();
    } catch {
      setError(true);
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  }
  const image = preview ?? persistedQr;
  return (
    <form
      className="space-y-3 border-t border-[var(--border)] pt-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !disabled && !busy) setConfirming(true);
      }}
    >
      <fieldset disabled={disabled || busy} className="space-y-3 min-w-0">
        <legend className="type-card-title">{t('kaspiMerchantSettings')}</legend>
        <label htmlFor={`${id}-name`} className="block type-caption">
          {t('kaspiMerchantName')}
          <input
            id={`${id}-name`}
            className="ui-field-plain w-full"
            value={name}
            required
            maxLength={200}
            onChange={(event) => {
              setName(event.target.value);
              changed();
            }}
          />
        </label>
        <label htmlFor={`${id}-qr`} className="block type-caption">
          {t('kaspiQrFile')}
          <input
            id={`${id}-qr`}
            type="file"
            accept={KASPI_QR_MIME_TYPES.join(',')}
            className="block w-full type-compact"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              changed();
              const invalid = Boolean(
                selected &&
                (!KASPI_QR_MIME_TYPES.includes(
                  selected.type as (typeof KASPI_QR_MIME_TYPES)[number]
                ) ||
                  selected.size <= 0 ||
                  selected.size >= KASPI_QR_MAX_BYTES)
              );
              setFileError(invalid);
              setFile(invalid ? undefined : selected);
              if (invalid) event.target.value = '';
            }}
          />
        </label>
        <p className="type-caption">{t('kaspiQrFileHelp')}</p>
        {fileError && <p role="alert">{t('kaspiQrFileError')}</p>}
        {image && (
          <img
            src={image}
            alt={t('kaspiQrPreview')}
            className="h-48 w-48 max-w-full bg-white object-contain"
            referrerPolicy="no-referrer"
          />
        )}
        <label htmlFor={`${id}-ttl`} className="block type-caption">
          {t('kaspiRequestMinutes')}
          <input
            id={`${id}-ttl`}
            className="ui-field-plain"
            type="number"
            min="1"
            max="43200"
            step="1"
            required
            value={minutes}
            onChange={(event) => {
              setMinutes(event.target.value);
              changed();
            }}
          />
        </label>
        {configuration.merchantKey && (
          <>
            <p className="break-all type-caption">
              {t('kaspiMerchantKey')}: {configuration.merchantKey}
            </p>
            <label htmlFor={`${id}-replace`} className="flex gap-2 items-start type-compact">
              <input
                id={`${id}-replace`}
                type="checkbox"
                checked={replaceMerchant}
                disabled={configuration.enabled}
                onChange={(event) => {
                  setReplaceMerchant(event.target.checked);
                  changed();
                }}
              />
              {t('kaspiReplaceMerchant')}
            </label>
            <p className="type-caption">{t('kaspiReplaceMerchantHelp')}</p>
          </>
        )}
        <label htmlFor={`${id}-verify`} className="flex gap-2 items-start type-compact">
          <input
            id={`${id}-verify`}
            type="checkbox"
            checked={verified}
            onChange={(event) => setVerified(event.target.checked)}
          />
          {t('kaspiQrVerification')}
        </label>
        <button type="submit" className="btn-primary px-4 py-2" disabled={!valid}>
          {t('kaspiSaveSettings')}
        </button>
      </fieldset>
      {busy && <p role="status">{t('processing')}</p>}
      {error && <p role="alert">{t('kaspiMerchantSaveError')}</p>}
      {confirming && (
        <AdminModal
          title={t('kaspiSaveSettings')}
          closeLabel={t('closeBtn')}
          onClose={() => {
            if (!busy) setConfirming(false);
          }}
          closeDisabled={busy}
        >
          <div className="space-y-3 p-4">
            <p>
              {name.trim()} · {minutes} {t('kaspiMinutes')}
            </p>
            <p>{t(replaceMerchant ? 'kaspiReplaceMerchantHelp' : 'kaspiSaveExplanation')}</p>
            <button
              type="button"
              className="btn-primary px-4 py-2"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? t('processing') : t('confirm')}
            </button>
          </div>
        </AdminModal>
      )}
    </form>
  );
}
