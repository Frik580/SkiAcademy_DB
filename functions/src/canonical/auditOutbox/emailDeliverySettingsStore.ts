import {
  EMAIL_DELIVERY_SETTINGS_ID,
  EmailDeliverySettingsSchema,
  type EmailDeliverySettings,
} from '@ski-academy/shared-domain';

export const EMAIL_DELIVERY_SETTINGS_DOCUMENT_PATH =
  `email_delivery_settings/${EMAIL_DELIVERY_SETTINGS_ID}` as const;

export function parseEmailDeliverySettings(
  data: Record<string, unknown> | undefined
): EmailDeliverySettings | undefined {
  if (!data) return undefined;
  const parsed = EmailDeliverySettingsSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}
