import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { useNotifications } from '../../../../../features/notifications';
import { saveResortSeason, subscribeResortConfig } from '../../../../../features/settings';
import { getResortSeasonValidationError } from '../../../../../features/settings/resortSeason';
import type { ResortSeasonSettings } from '../../../../../types';
import { ActionButton } from '../../../../../ui/ActionButton';
import { FormSkeleton } from '../../../../../ui/Skeleton';
import { useResortSeasonTranslations } from '../../../../../features/settings/useResortSeasonTranslations';

const DATE_INPUT_CLASS =
  'w-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2 type-body text-[var(--ink)] focus:outline-none focus:border-[var(--ink)] rounded-none';

export function ResortSeasonSection() {
  const { t } = useResortSeasonTranslations();
  const { addNotification } = useNotifications();
  const [seasonStart, setSeasonStart] = useState('');
  const [seasonEnd, setSeasonEnd] = useState('');
  const [highStart, setHighStart] = useState('');
  const [highEnd, setHighEnd] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [attemptedSave, setAttemptedSave] = useState(false);
  const [readError, setReadError] = useState(false);
  // An unrelated resort-setting snapshot must not erase unsaved date edits.
  const dirty = useRef(false);

  useEffect(() => {
    return subscribeResortConfig(
      (config) => {
        if (!dirty.current) {
          setSeasonStart(config?.season?.startDate ?? '');
          setSeasonEnd(config?.season?.endDate ?? '');
          setHighStart(config?.season?.highSeason?.startDate ?? '');
          setHighEnd(config?.season?.highSeason?.endDate ?? '');
        }
        setReadError(false);
        setIsLoading(false);
      },
      () => {
        setReadError(true);
        setIsLoading(false);
      }
    );
  }, []);

  const season: ResortSeasonSettings = {
    startDate: seasonStart,
    endDate: seasonEnd,
    highSeason: highStart || highEnd ? { startDate: highStart, endDate: highEnd } : null,
  };
  const error = getResortSeasonValidationError(season);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setAttemptedSave(true);
    if (error || isLoading || readError || isSaving) return;
    setIsSaving(true);
    try {
      await saveResortSeason(season);
      dirty.current = false;
      setAttemptedSave(false);
      addNotification('success', t('configUpdated'), t('seasonSettingsSaved'));
    } catch {
      addNotification('error', t('configSaveError'), t('configSaveErrorDesc'));
    } finally {
      setIsSaving(false);
    }
  };

  const dateInput = (
    id: string,
    label: string,
    value: string,
    setValue: (date: string) => void,
    required: boolean
  ) => (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block type-caption uppercase text-[var(--ink-dim)] font-medium"
      >
        {label}
        <input
          id={id}
          type="date"
          required={required}
          value={value}
          disabled={isSaving || readError}
          onChange={(event) => {
            dirty.current = true;
            setValue(event.target.value);
          }}
          className={`${DATE_INPUT_CLASS} mt-1.5`}
        />
      </label>
    </div>
  );

  if (isLoading) return <FormSkeleton fields={4} />;

  return (
    <section className="border-b border-[var(--border)] pb-5 mb-4 space-y-3">
      <h5 className="type-compact uppercase text-[var(--ink)] font-medium">
        {t('seasonSettingsTitle')}
      </h5>
      <p className="type-caption text-[var(--ink-dim)]">{t('seasonSettingsHelp')}</p>
      {readError ? (
        <p role="alert" className="type-caption text-red-600 dark:text-red-400">
          {t('seasonSettingsReadError')}
        </p>
      ) : null}
      <form onSubmit={onSave} noValidate className="space-y-4">
        <fieldset className="space-y-2" disabled={isSaving || readError}>
          <legend className="type-button text-[var(--ink)] mb-2">{t('seasonPeriodTitle')}</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dateInput(
              'resort-season-start',
              t('seasonStartDate'),
              seasonStart,
              setSeasonStart,
              true
            )}
            {dateInput('resort-season-end', t('seasonEndDate'), seasonEnd, setSeasonEnd, true)}
          </div>
        </fieldset>
        <fieldset className="space-y-2" disabled={isSaving || readError}>
          <legend className="type-button text-[var(--ink)] mb-2">
            {t('highSeasonPeriodTitle')}
          </legend>
          <p className="type-caption text-[var(--ink-dim)]">{t('highSeasonPeriodHelp')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dateInput(
              'resort-high-season-start',
              t('seasonStartDate'),
              highStart,
              setHighStart,
              false
            )}
            {dateInput('resort-high-season-end', t('seasonEndDate'), highEnd, setHighEnd, false)}
          </div>
        </fieldset>
        {attemptedSave && error ? (
          <p role="alert" className="type-caption text-red-600 dark:text-red-400">
            {t(error)}
          </p>
        ) : null}
        <div className="flex justify-end">
          <ActionButton type="submit" pending={isSaving} disabled={readError}>
            <Save className="w-3.5 h-3.5" />
            {t('saveSeasonSettings')}
          </ActionButton>
        </div>
      </form>
    </section>
  );
}
