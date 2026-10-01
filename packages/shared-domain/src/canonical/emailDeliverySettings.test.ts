import { describe, expect, it } from 'vitest';
import { CommandIntentSchemaByKind } from './commands/commandIntents';
import {
  EmailDeliverySettingsSchema,
  effectiveEmailDeliveryEnabled,
} from './emailDeliverySettings';
import {
  QueryEmailDeliverySettingsReadModelInputSchema,
  buildEmailDeliveryControlState,
} from './readModels/emailDeliverySettingsReadModel';
import { timestampFromDate } from './primitives';

const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function settings(emailDeliveryEnabled: boolean) {
  return EmailDeliverySettingsSchema.parse({
    settingsId: 'email',
    emailDeliveryEnabled,
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_email_delivery_seed',
      lastChangedByCommandId: 'command_email_delivery_seed',
      correlationId: 'correlation_email_delivery_seed',
    },
  });
}

describe('QueryEmailDeliverySettingsReadModelInputSchema', () => {
  it('accepts scope with canonical read idempotencyKey', () => {
    expect(
      QueryEmailDeliverySettingsReadModelInputSchema.safeParse({
        scope: 'email_delivery_settings',
        idempotencyKey: 'read:email_delivery_settings:current:rs:live',
      }).success
    ).toBe(true);
  });

  it('rejects unexpected fields because the schema is strict', () => {
    expect(
      QueryEmailDeliverySettingsReadModelInputSchema.safeParse({
        scope: 'email_delivery_settings',
        unexpectedField: true,
      }).success
    ).toBe(false);
  });
});

describe('email delivery control state', () => {
  it('defaults to disabled when no settings document exists', () => {
    expect(
      buildEmailDeliveryControlState({ providerConfigured: false, settings: undefined })
    ).toEqual({
      providerConfigured: false,
      deliveryEnabled: false,
      effectiveDeliveryEnabled: false,
      revision: 0,
    });
  });

  it.each([
    [false, false, false],
    [false, true, false],
    [true, false, false],
    [true, true, true],
  ] as const)(
    'provider %s and admin %s yields effective %s',
    (providerConfigured, emailDeliveryEnabled, effective) => {
      expect(effectiveEmailDeliveryEnabled({ providerConfigured, emailDeliveryEnabled })).toBe(
        effective
      );
      expect(
        buildEmailDeliveryControlState({
          providerConfigured,
          settings: settings(emailDeliveryEnabled),
        })
      ).toMatchObject({
        providerConfigured,
        deliveryEnabled: emailDeliveryEnabled,
        effectiveDeliveryEnabled: effective,
      });
    }
  );

  it('does not accept provider state or secrets on the settings document or command', () => {
    expect(
      EmailDeliverySettingsSchema.safeParse({
        ...settings(false),
        providerConfigured: true,
        apiKey: 'secret',
        smtpPassword: 'secret',
      }).success
    ).toBe(false);
    const state = buildEmailDeliveryControlState({
      providerConfigured: true,
      settings: settings(true),
    });
    expect(Object.keys(state).sort()).toEqual([
      'deliveryEnabled',
      'effectiveDeliveryEnabled',
      'providerConfigured',
      'revision',
    ]);
    expect(JSON.stringify(state)).not.toMatch(/apiKey|smtp|password|secret/i);
    expect(
      CommandIntentSchemaByKind.set_email_delivery_enabled.safeParse({
        enabled: true,
        reasonExplanation: 'Administrator changed external email delivery.',
        providerConfigured: true,
        apiKey: 'secret',
      }).success
    ).toBe(false);
  });
});
