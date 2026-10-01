import { z } from 'zod';
import { CanonicalRecordMetadataSchema } from './accountParticipantAccess';
import { EmailDeliverySettingsIdSchema, type EmailDeliverySettingsId } from './identifiers';
import { AggregateRevisionSchema, CanonicalTimestampSchema } from './primitives';

export const EMAIL_DELIVERY_SETTINGS_ID: EmailDeliverySettingsId =
  EmailDeliverySettingsIdSchema.parse('email');

const PersistedRevisionSchema = AggregateRevisionSchema.refine(
  (revision) => revision >= 1,
  'Persisted aggregate revision must be at least one'
);

export const EmailDeliverySettingsSchema = z
  .object({
    settingsId: EmailDeliverySettingsIdSchema,
    emailDeliveryEnabled: z.boolean(),
    revision: PersistedRevisionSchema,
    createdAt: CanonicalTimestampSchema,
    updatedAt: CanonicalTimestampSchema,
    audit: CanonicalRecordMetadataSchema.shape.audit,
  })
  .strict();

export type EmailDeliverySettings = Readonly<z.output<typeof EmailDeliverySettingsSchema>>;

/** Admin permission and provider presence stay separate. Both must be true. */
export function effectiveEmailDeliveryEnabled(input: {
  readonly providerConfigured: boolean;
  readonly emailDeliveryEnabled: boolean;
}): boolean {
  return input.providerConfigured === true && input.emailDeliveryEnabled === true;
}
