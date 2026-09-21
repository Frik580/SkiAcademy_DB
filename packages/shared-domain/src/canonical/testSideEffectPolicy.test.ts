import { describe, expect, it } from 'vitest';
import { AccountIdSchema, BookingIdSchema, CommandIdSchema, TestSessionIdSchema } from './identifiers';
import { LIVE_CANONICAL_EXECUTION_SCOPE, testCanonicalExecutionScope } from './canonicalScope';
import { timestampFromDate } from './primitives';
import {
  DomainOutboxObligationSchema,
  OUTBOX_SCHEMA_VERSION,
  type DomainOutboxObligation,
} from './auditOutbox';
import {
  activityLogIdFromCommandId,
  domainOutboxIdFromCommand,
  paymentIdFromBookingId,
} from './deterministicIdentity';
import { parseCommandIntent } from './commands/commandIntents';
import { buildOutboxObligationRecords } from './auditOutboxStaging';
import {
  TEST_EXTERNAL_CHANNEL_SUPPRESSION_REASON,
  TEST_NOTIFICATION_CLIENT_REACHABILITY,
  TEST_PROVIDER_EVENT_FORBIDDEN_REASON,
  OutboxDeliveryPolicyError,
  TestSideEffectPolicyError,
  assertInAppNotificationRecipientAllowed,
  assertOutboxDeliveryMayProceed,
  assertProviderEventAllowedForScope,
  notificationEligibleForTestSessionCleanup,
  notificationEligibleForUserPurge,
  resolveTestSideEffectPolicy,
} from './testSideEffectPolicy';

const sessionA = TestSessionIdSchema.parse('test_session_side_effect_a');
const sessionB = TestSessionIdSchema.parse('test_session_side_effect_b');
const scopeA = testCanonicalExecutionScope(sessionA);
const recipient = AccountIdSchema.parse('account_test_parent_01');
const liveAdmin = AccountIdSchema.parse('account_live_admin_01');
const createdAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const commandId = CommandIdSchema.parse('command_side_effect_01');

function obligation(overrides: Partial<DomainOutboxObligation> = {}): DomainOutboxObligation {
  return DomainOutboxObligationSchema.parse({
    schemaVersion: OUTBOX_SCHEMA_VERSION,
    dataScope: 'test',
    testSessionId: sessionA,
    outboxId: domainOutboxIdFromCommand(commandId, 0),
    commandId,
    activityLogId: activityLogIdFromCommandId(commandId),
    deliveryEffectOrdinal: 0,
    recipient: { kind: 'account', id: recipient },
    channel: 'email',
    templateId: 'booking_confirmed',
    templateVersion: 'v1',
    renderInputs: { bookingId: 'booking_01' },
    deliverySemantics: 'transactional',
    createdAt,
    delivery: {
      status: 'suppressed',
      suppressedAt: createdAt,
      suppressionReason: TEST_EXTERNAL_CHANNEL_SUPPRESSION_REASON,
    },
    ...overrides,
  });
}

describe('T42B-4 TestSideEffectPolicy', () => {
  it('preserves LIVE channels and suppresses TEST external delivery', () => {
    expect(resolveTestSideEffectPolicy(LIVE_CANONICAL_EXECUTION_SCOPE, 'in_app').action).toBe('allow');
    expect(resolveTestSideEffectPolicy(LIVE_CANONICAL_EXECUTION_SCOPE, 'email').action).toBe('allow');
    expect(resolveTestSideEffectPolicy(LIVE_CANONICAL_EXECUTION_SCOPE, 'payment_provider').action).toBe(
      'allow'
    );
    expect(resolveTestSideEffectPolicy(scopeA, 'in_app').action).toBe(
      'allow_same_session_test_recipient'
    );
    expect(resolveTestSideEffectPolicy(scopeA, 'email')).toEqual({
      action: 'suppress',
      reason: TEST_EXTERNAL_CHANNEL_SUPPRESSION_REASON,
    });
    expect(resolveTestSideEffectPolicy(scopeA, 'sms').action).toBe('suppress');
    expect(resolveTestSideEffectPolicy(scopeA, 'push').action).toBe('suppress');
    expect(resolveTestSideEffectPolicy(scopeA, 'webhook').action).toBe('suppress');
    expect(resolveTestSideEffectPolicy(scopeA, 'payment_provider')).toEqual({
      action: 'forbidden',
      reason: TEST_PROVIDER_EVENT_FORBIDDEN_REASON,
    });
    expect(resolveTestSideEffectPolicy(scopeA, 'analytics').action).toBe('not_implemented');
    expect(resolveTestSideEffectPolicy(scopeA, 'image_fetch').action).toBe(
      'allow_shared_public_allowlist'
    );
  });

  it('fails closed for unknown channels', () => {
    expect(() => resolveTestSideEffectPolicy(scopeA, 'carrier_pigeon')).toThrow(
      new TestSideEffectPolicyError('UNKNOWN_CHANNEL')
    );
  });

  it('forbids TEST provider events and allows TEST manual capture', () => {
    expect(() => assertProviderEventAllowedForScope(scopeA, 'provider')).toThrow(
      new TestSideEffectPolicyError('FORBIDDEN')
    );
    expect(() => assertProviderEventAllowedForScope(scopeA, 'manual_external')).not.toThrow();
    expect(() =>
      assertProviderEventAllowedForScope(LIVE_CANONICAL_EXECUTION_SCOPE, 'provider')
    ).not.toThrow();

    const paymentId = paymentIdFromBookingId(BookingIdSchema.parse('booking_side_effect_01'));
    expect(
      parseCommandIntent('record_provider_payment_event', {
        paymentId,
        amount: 10_000,
        sourceKind: 'provider',
        providerKind: 'stripe',
        providerEventId: 'evt_01',
        sandbox: true,
      }).success
    ).toBe(false);
  });

  it('allows TEST in-app only for same-session TEST recipients, never the live admin actor', () => {
    expect(() =>
      assertInAppNotificationRecipientAllowed({
        executionScope: scopeA,
        recipientAccountId: recipient,
        recipientRecord: { accountId: recipient, dataScope: 'test', testSessionId: sessionA },
        commandActorAccountId: liveAdmin,
      })
    ).not.toThrow();

    expect(() =>
      assertInAppNotificationRecipientAllowed({
        executionScope: scopeA,
        recipientAccountId: liveAdmin,
        recipientRecord: { accountId: liveAdmin, dataScope: 'live' },
        commandActorAccountId: liveAdmin,
      })
    ).toThrow(new TestSideEffectPolicyError('RECIPIENT_IS_COMMAND_ACTOR'));

    expect(() =>
      assertInAppNotificationRecipientAllowed({
        executionScope: scopeA,
        recipientAccountId: recipient,
        recipientRecord: { accountId: recipient, dataScope: 'live' },
      })
    ).toThrow(new TestSideEffectPolicyError('RECIPIENT_CROSS_SCOPE'));

    expect(() =>
      assertInAppNotificationRecipientAllowed({
        executionScope: scopeA,
        recipientAccountId: recipient,
        recipientRecord: { accountId: recipient, dataScope: 'test', testSessionId: sessionB },
      })
    ).toThrow(new TestSideEffectPolicyError('RECIPIENT_CROSS_SCOPE'));
  });

  it('stages TEST email/sms/push as suppressed and blocks future workers', () => {
    const [email] = buildOutboxObligationRecords({
      commandId,
      activityLogId: activityLogIdFromCommandId(commandId),
      createdAt,
      scope: scopeA,
      drafts: [
        {
          deliveryEffectOrdinal: 0,
          recipient: { kind: 'account', id: recipient },
          channel: 'email',
          templateId: 'booking_confirmed',
          templateVersion: 'v1',
          renderInputs: { to: 'real@example.com' },
          deliverySemantics: 'transactional',
        },
      ],
    });
    expect(email.delivery).toEqual({
      status: 'suppressed',
      suppressedAt: createdAt,
      suppressionReason: TEST_EXTERNAL_CHANNEL_SUPPRESSION_REASON,
    });
    expect(email.dataScope).toBe('test');
    expect(email.testSessionId).toBe(sessionA);
    expect(() => assertOutboxDeliveryMayProceed(email)).toThrow(
      new OutboxDeliveryPolicyError('SUPPRESSED')
    );

    const pendingLeak = obligation({
      delivery: { status: 'pending' },
    });
    expect(() => assertOutboxDeliveryMayProceed(pendingLeak)).toThrow(
      new OutboxDeliveryPolicyError('SUPPRESSED')
    );

    const liveEmail = buildOutboxObligationRecords({
      commandId,
      activityLogId: activityLogIdFromCommandId(commandId),
      createdAt,
      scope: LIVE_CANONICAL_EXECUTION_SCOPE,
      drafts: [
        {
          deliveryEffectOrdinal: 0,
          recipient: { kind: 'account', id: liveAdmin },
          channel: 'email',
          templateId: 'booking_confirmed',
          templateVersion: 'v1',
          renderInputs: {},
          deliverySemantics: 'transactional',
        },
      ],
    })[0];
    expect(liveEmail.delivery).toEqual({ status: 'pending' });
    expect(() => assertOutboxDeliveryMayProceed(liveEmail)).not.toThrow();
  });

  it('keeps TEST notification client writes deferred and purge scoped by user/session', () => {
    expect(TEST_NOTIFICATION_CLIENT_REACHABILITY).toBe('deferred_until_firestore_rules');
    expect(
      notificationEligibleForUserPurge({ userId: recipient, dataScope: 'test', testSessionId: sessionA }, recipient)
    ).toBe(true);
    expect(
      notificationEligibleForUserPurge({ userId: liveAdmin, dataScope: 'live' }, recipient)
    ).toBe(false);
    expect(
      notificationEligibleForTestSessionCleanup(
        { dataScope: 'test', testSessionId: sessionA },
        sessionA
      )
    ).toBe(true);
    expect(
      notificationEligibleForTestSessionCleanup({ dataScope: 'live' }, sessionA)
    ).toBe(false);
  });
});
