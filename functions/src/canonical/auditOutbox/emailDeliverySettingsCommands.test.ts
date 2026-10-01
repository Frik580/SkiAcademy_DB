import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AccountSchema,
  AggregateRevisionSchema,
  CorrelationIdSchema,
  accountCommandActor,
  activityLogIdFromCommandId,
  buildEmailDeliveryControlState,
  resolveCommandIdempotencyIdentity,
  timestampFromDate,
  type CommandEnvelope,
} from '@ski-academy/shared-domain';
import { createAuthoritativeCommandClock } from '../commands/commandClock';
import { createProductionCanonicalCommands } from '../commands/canonicalCommands';
import { createInMemoryCanonicalTransactionExecutor } from '../transactions';
import { parseEmailDeliverySettings } from './emailDeliverySettingsStore';

const adminAccountId = AccountIdSchema.parse('account_email_admin_01');
const correlationId = CorrelationIdSchema.parse('correlation_email_admin_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));

function envelope(expectedRevision: number, idempotencyKey: string, enabled: boolean) {
  return {
    kind: 'set_email_delivery_enabled',
    context: {
      actor: accountCommandActor(adminAccountId),
      exercisedCapability: 'administrator',
      idempotencyKey,
      correlationId,
      source: 'admin_callable',
      expectedRevision: AggregateRevisionSchema.parse(expectedRevision),
    },
    intent: {
      enabled,
      reasonExplanation: 'Administrator changed external email delivery.',
    },
  } as CommandEnvelope<'set_email_delivery_enabled'>;
}

function executor() {
  return createInMemoryCanonicalTransactionExecutor({
    [`users/${adminAccountId}`]: AccountSchema.parse({
      accountId: adminAccountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed_admin',
        lastChangedByCommandId: 'command_seed_admin',
        correlationId,
      },
    }),
  });
}

function commands(
  tx: ReturnType<typeof executor>,
  isEmailProviderConfigured: () => boolean = () => false
) {
  return createProductionCanonicalCommands(
    { clock: createAuthoritativeCommandClock(new Date('2026-01-01T00:00:00.000Z')) },
    tx,
    { isEmailProviderConfigured }
  );
}

describe('set_email_delivery_enabled command', () => {
  it('defaults email delivery to disabled and lets an admin record that explicitly', async () => {
    const tx = executor();
    expect(
      buildEmailDeliveryControlState({ providerConfigured: false, settings: undefined })
        .deliveryEnabled
    ).toBe(false);
    expect((await commands(tx).execute(envelope(0, 'email-delivery-off', false))).status).toBe(
      'success'
    );
    const stored = parseEmailDeliverySettings(
      tx.snapshot().docs.get('email_delivery_settings/email')?.data
    );
    expect(stored?.emailDeliveryEnabled).toBe(false);
    expect(buildEmailDeliveryControlState({ providerConfigured: false, settings: stored }))
      .toMatchObject({
        providerConfigured: false,
        deliveryEnabled: false,
        effectiveDeliveryEnabled: false,
      });
  });

  it('rejects a non-administrator', async () => {
    for (const exercisedCapability of ['account_owner', 'instructor'] as const) {
      const tx = executor();
      const command = envelope(0, `email-delivery-forbidden-${exercisedCapability}`, false);
      const result = await commands(tx).execute({
        ...command,
        context: {
          ...command.context,
          exercisedCapability,
          source: 'client_callable',
        },
      } as CommandEnvelope<'set_email_delivery_enabled'>);
      expect(result.status).toBe('error');
      if (result.status === 'error') expect(result.error.code).toBe('forbidden');
      expect(tx.snapshot().docs.has('email_delivery_settings/email')).toBe(false);
    }
  });

  it('rejects enable when the server provider is not configured', async () => {
    const tx = executor();
    const result = await commands(tx, () => false).execute(
      envelope(0, 'email-delivery-no-provider', true)
    );
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.error.code).toBe('validation');
    expect(tx.snapshot().docs.has('email_delivery_settings/email')).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/apiKey|smtp|password|secret/i);
  });

  it('lets an admin enable and disable only from server provider state', async () => {
    const tx = executor();
    let providerConfigured = true;
    const api = commands(tx, () => providerConfigured);
    expect((await api.execute(envelope(0, 'email-delivery-on', true))).status).toBe('success');
    expect((await api.execute(envelope(1, 'email-delivery-disable', false))).status).toBe(
      'success'
    );
    providerConfigured = false;
    const rejected = await api.execute(envelope(2, 'email-delivery-reenable-blocked', true));
    expect(rejected.status).toBe('error');
    const stored = parseEmailDeliverySettings(
      tx.snapshot().docs.get('email_delivery_settings/email')?.data
    );
    expect(stored?.emailDeliveryEnabled).toBe(false);
    expect(stored?.revision).toBe(2);
    expect(Object.keys(stored ?? {}).sort()).toEqual([
      'audit',
      'createdAt',
      'emailDeliveryEnabled',
      'revision',
      'settingsId',
      'updatedAt',
    ]);
    const identity = resolveCommandIdempotencyIdentity(envelope(1, 'email-delivery-disable', false));
    expect(
      tx.snapshot().docs.get(`activity_logs/${activityLogIdFromCommandId(identity.commandKey)}`)
        ?.data
    ).toMatchObject({
      reason: { reasonCode: 'manual_override' },
      effects: [{ kind: 'email_delivery_settings_changed' }],
    });
    expect(
      buildEmailDeliveryControlState({ providerConfigured: true, settings: stored })
        .effectiveDeliveryEnabled
    ).toBe(false);
    expect(
      buildEmailDeliveryControlState({
        providerConfigured: true,
        settings: { ...stored!, emailDeliveryEnabled: true },
      }).effectiveDeliveryEnabled
    ).toBe(true);
  });
});
