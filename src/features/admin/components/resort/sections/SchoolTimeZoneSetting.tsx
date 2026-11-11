import { useEffect, useRef, useState } from 'react';
import { useSchoolTimeZoneTranslations } from '../../../../settings/useSchoolTimeZoneTranslations';
import { resolveSchoolTimeZone } from '@ski-academy/shared-domain';
import { useNotifications } from '../../../../notifications';
import { saveSchoolTimeZone, useSchoolTimeZone } from '../../../../settings/schoolTimeZone';
import { ActionButton } from '../../../../../ui/ActionButton';

const cities = {
  'Asia/Almaty': ['Алматы', 'Almaty'],
  'Europe/Moscow': ['Москва', 'Moscow'],
  'Asia/Bishkek': ['Бишкек', 'Bishkek'],
  'Asia/Tashkent': ['Ташкент', 'Tashkent'],
  'Europe/Paris': ['Париж', 'Paris'],
  'Europe/London': ['Лондон', 'London'],
  'America/New_York': ['Нью-Йорк', 'New York'],
  'Asia/Dubai': ['Дубай', 'Dubai'],
};
const supportedZones =
  (
    Intl as typeof Intl & {
      supportedValuesOf?: (key: string) => string[];
    }
  ).supportedValuesOf?.('timeZone') ?? [];

export function SchoolTimeZoneSetting() {
  const { t, language } = useSchoolTimeZoneTranslations();
  const { addNotification } = useNotifications();
  const school = useSchoolTimeZone();
  const [draft, setDraft] = useState(school.timeZone);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => setDraft(school.timeZone), [school.timeZone]);
  const zones = [
    ...new Set([...Object.keys(cities), 'UTC', ...supportedZones, school.timeZone, draft]),
  ];
  let valid = true;
  try {
    resolveSchoolTimeZone({ timeZone: draft });
  } catch {
    valid = false;
  }
  return (
    <div className="space-y-3 border-b border-[var(--border)] pb-4 mb-4">
      <label htmlFor="school-time-zone" className="block type-caption text-[var(--ink)]">
        {t('schoolTimeZoneLabel')}
        <select
          id="school-time-zone"
          value={draft}
          disabled={!school.ready || saving}
          aria-describedby="school-time-zone-help school-time-zone-status"
          onChange={(event) => setDraft(event.target.value)}
          className="w-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--ink)]"
        >
          {zones.map((zone) => {
            const city = cities[zone as keyof typeof cities]?.[language === 'ru' ? 0 : 1];
            return (
              <option key={zone} value={zone}>
                {city ? `${city} — ${zone}` : zone}
              </option>
            );
          })}
        </select>
      </label>
      <label htmlFor="school-time-zone-custom" className="block type-caption">
        {t('schoolTimeZoneCustom')}
        <input
          id="school-time-zone-custom"
          value={draft}
          disabled={!school.ready || saving}
          aria-invalid={!valid}
          aria-describedby="school-time-zone-help"
          onChange={(event) => setDraft(event.target.value)}
          className="w-full border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--ink)]"
        />
      </label>
      <p id="school-time-zone-help" className="type-caption text-[var(--ink-dim)]">
        {t('schoolTimeZoneHelp')}
      </p>
      <p id="school-time-zone-status" role="status" className="type-caption">
        {school.error
          ? `${t('schoolTimeZoneError')} ${school.error.message}`
          : !school.ready
            ? t('loading')
            : ''}
      </p>
      <ActionButton
        type="button"
        pending={saving}
        disabled={!school.ready || !valid || draft === school.timeZone}
        onClick={async () => {
          if (savingRef.current || !school.ready) return;
          savingRef.current = true;
          setSaving(true);
          try {
            await saveSchoolTimeZone(draft, school.timeZone);
            addNotification('success', t('configUpdated'), t('configUpdatedDesc'));
          } catch {
            addNotification('error', t('configSaveError'), t('configSaveErrorDesc'));
          } finally {
            savingRef.current = false;
            setSaving(false);
          }
        }}
      >
        {t('saveResortSettings')}
      </ActionButton>
    </div>
  );
}
