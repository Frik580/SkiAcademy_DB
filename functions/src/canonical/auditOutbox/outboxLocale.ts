import {
  notificationLocaleFromTransportMetadata,
  type NotificationLocale,
} from '@ski-academy/shared-domain';

export function renderInputsWithCommandLocale(
  renderInputs: Record<string, string | number | boolean>,
  transportMetadata: Readonly<Record<string, string>> | undefined
): Record<string, string | number | boolean> {
  const locale: NotificationLocale | undefined =
    notificationLocaleFromTransportMetadata(transportMetadata);
  if (!locale) return renderInputs;
  return { ...renderInputs, locale };
}
