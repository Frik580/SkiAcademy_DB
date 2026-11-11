import { IanaTimeZoneSchema } from './canonical/primitives';

export const DEFAULT_SCHOOL_TIME_ZONE = 'Asia/Almaty';
export const SCHOOL_TIME_ZONE_CONFIG_PATH = 'resort_data/config';

/** Missing settings are supported; corrupt settings must never become a silent fallback. */
export function resolveSchoolTimeZone(config: { readonly timeZone?: unknown } | undefined): string {
  if (config?.timeZone === undefined) return DEFAULT_SCHOOL_TIME_ZONE;
  const timeZone = IanaTimeZoneSchema.parse(config.timeZone);
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(timeZone)) {
    throw new Error('School time zone must be an IANA identifier.');
  }
  return timeZone;
}
