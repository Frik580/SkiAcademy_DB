import { z } from 'zod';
import { IdempotencyKeySchema } from '../commands/commandContext';
import {
  effectiveEmailDeliveryEnabled,
  type EmailDeliverySettings,
} from '../emailDeliverySettings';
import { AggregateRevisionSchema } from '../primitives';

export const QueryEmailDeliverySettingsReadModelInputSchema = z
  .object({
    scope: z.literal('email_delivery_settings'),
    idempotencyKey: IdempotencyKeySchema.optional(),
  })
  .strict();

export type QueryEmailDeliverySettingsReadModelInput = z.output<
  typeof QueryEmailDeliverySettingsReadModelInputSchema
>;

export const EmailDeliveryControlStateSchema = z
  .object({
    providerConfigured: z.boolean(),
    deliveryEnabled: z.boolean(),
    effectiveDeliveryEnabled: z.boolean(),
    revision: AggregateRevisionSchema,
  })
  .strict();

export type EmailDeliveryControlState = z.output<typeof EmailDeliveryControlStateSchema>;

export const QueryEmailDeliverySettingsReadModelResultSchema = z
  .object({
    scope: z.literal('email_delivery_settings'),
    email: EmailDeliveryControlStateSchema,
  })
  .strict();

export type QueryEmailDeliverySettingsReadModelResult = z.output<
  typeof QueryEmailDeliverySettingsReadModelResultSchema
>;

export function buildEmailDeliveryControlState(input: {
  readonly providerConfigured: boolean;
  readonly settings: EmailDeliverySettings | undefined;
}): EmailDeliveryControlState {
  const providerConfigured = input.providerConfigured === true;
  const deliveryEnabled = input.settings?.emailDeliveryEnabled === true;
  return EmailDeliveryControlStateSchema.parse({
    providerConfigured,
    deliveryEnabled,
    effectiveDeliveryEnabled: effectiveEmailDeliveryEnabled({
      providerConfigured,
      emailDeliveryEnabled: deliveryEnabled,
    }),
    revision: input.settings?.revision ?? 0,
  });
}
