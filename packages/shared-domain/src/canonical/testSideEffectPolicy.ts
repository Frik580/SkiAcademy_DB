import {
  LIVE_CANONICAL_EXECUTION_SCOPE,
  parsePersistedCanonicalScope,
  PersistedCanonicalScopeError,
  type CanonicalExecutionScope,
} from './canonicalScope';
import type { OutboxDeliveryChannel, DomainOutboxObligation } from './auditOutbox';
import type { TestSession, TestSessionStatus } from './testSessions';
import { TestSessionPolicyError } from './testSessions';

export const TEST_SIDE_EFFECT_CHANNELS = [
  'in_app',
  'email',
  'sms',
  'push',
  'payment_provider',
  'webhook',
  'image_fetch',
  'analytics',
] as const;

export type TestSideEffectChannel = (typeof TEST_SIDE_EFFECT_CHANNELS)[number];

export const TEST_SIDE_EFFECT_ACTIONS = [
  'allow',
  'allow_same_session_test_recipient',
  'suppress',
  'forbidden',
  'not_implemented',
  'allow_shared_public_allowlist',
] as const;

export type TestSideEffectAction = (typeof TEST_SIDE_EFFECT_ACTIONS)[number];

export const TEST_EXTERNAL_CHANNEL_SUPPRESSION_REASON = 'TEST_EXTERNAL_CHANNEL_SUPPRESSED' as const;
export const TEST_PROVIDER_EVENT_FORBIDDEN_REASON = 'TEST_PROVIDER_EVENT_FORBIDDEN' as const;
export const TEST_NOTIFICATION_CLIENT_REACHABILITY = 'deferred_until_firestore_rules' as const;

export type TestSideEffectPolicyErrorCode =
  | 'UNKNOWN_CHANNEL'
  | 'UNKNOWN_SCOPE'
  | 'FORBIDDEN'
  | 'SUPPRESSED'
  | 'RECIPIENT_CROSS_SCOPE'
  | 'RECIPIENT_IS_COMMAND_ACTOR'
  | 'SESSION_NOT_ACTIVE';

export class TestSideEffectPolicyError extends Error {
  constructor(readonly code: TestSideEffectPolicyErrorCode) {
    super(code);
    this.name = 'TestSideEffectPolicyError';
  }
}

export interface TestSideEffectDecision {
  readonly action: TestSideEffectAction;
  readonly reason: string;
}

const LIVE_DECISIONS: Record<TestSideEffectChannel, TestSideEffectDecision> = {
  in_app: { action: 'allow', reason: 'LIVE_IN_APP' },
  email: { action: 'allow', reason: 'LIVE_EMAIL' },
  sms: { action: 'allow', reason: 'LIVE_SMS' },
  push: { action: 'allow', reason: 'LIVE_PUSH' },
  payment_provider: { action: 'allow', reason: 'LIVE_PAYMENT_PROVIDER' },
  webhook: { action: 'allow', reason: 'LIVE_WEBHOOK' },
  image_fetch: { action: 'allow_shared_public_allowlist', reason: 'LIVE_PUBLIC_IMAGE_ALLOWLIST' },
  analytics: { action: 'not_implemented', reason: 'ANALYTICS_NOT_IMPLEMENTED' },
};

const TEST_DECISIONS: Record<TestSideEffectChannel, TestSideEffectDecision> = {
  in_app: {
    action: 'allow_same_session_test_recipient',
    reason: 'TEST_IN_APP_SAME_SESSION',
  },
  email: { action: 'suppress', reason: TEST_EXTERNAL_CHANNEL_SUPPRESSION_REASON },
  sms: { action: 'suppress', reason: TEST_EXTERNAL_CHANNEL_SUPPRESSION_REASON },
  push: { action: 'suppress', reason: TEST_EXTERNAL_CHANNEL_SUPPRESSION_REASON },
  payment_provider: { action: 'forbidden', reason: TEST_PROVIDER_EVENT_FORBIDDEN_REASON },
  webhook: { action: 'suppress', reason: TEST_EXTERNAL_CHANNEL_SUPPRESSION_REASON },
  image_fetch: {
    action: 'allow_shared_public_allowlist',
    reason: 'TEST_PUBLIC_IMAGE_ALLOWLIST_ONLY',
  },
  analytics: { action: 'not_implemented', reason: 'ANALYTICS_NOT_IMPLEMENTED' },
};

export function isTestSideEffectChannel(value: string): value is TestSideEffectChannel {
  return (TEST_SIDE_EFFECT_CHANNELS as readonly string[]).includes(value);
}

export function resolveTestSideEffectPolicy(
  scope: CanonicalExecutionScope | unknown,
  channel: TestSideEffectChannel | string
): TestSideEffectDecision {
  if (!isTestSideEffectChannel(channel)) {
    throw new TestSideEffectPolicyError('UNKNOWN_CHANNEL');
  }

  let resolved: CanonicalExecutionScope;
  try {
    resolved =
      scope && typeof scope === 'object' && 'dataScope' in scope
        ? parsePersistedCanonicalScope(scope, { allowLegacyLive: true })
        : LIVE_CANONICAL_EXECUTION_SCOPE;
  } catch (error) {
    if (error instanceof PersistedCanonicalScopeError) {
      throw new TestSideEffectPolicyError('UNKNOWN_SCOPE');
    }
    throw error;
  }

  if (resolved.dataScope === 'live') {
    return LIVE_DECISIONS[channel];
  }
  return TEST_DECISIONS[channel];
}

export function outboxChannelToSideEffectChannel(
  channel: OutboxDeliveryChannel
): TestSideEffectChannel {
  return channel;
}

export function assertTestSessionAcceptsSideEffects(
  session: Pick<TestSession, 'status'> | { readonly status: TestSessionStatus }
): void {
  if (session.status !== 'active') {
    throw new TestSessionPolicyError('TEST_SESSION_NOT_ACTIVE', session.status);
  }
}

export function assertProviderEventAllowedForScope(
  scope: CanonicalExecutionScope | undefined,
  sourceKind: 'provider' | 'manual_external' | 'cash' | 'bank_transfer'
): void {
  if (sourceKind !== 'provider') {
    return;
  }
  const decision = resolveTestSideEffectPolicy(
    scope ?? LIVE_CANONICAL_EXECUTION_SCOPE,
    'payment_provider'
  );
  if (decision.action === 'forbidden' || decision.action === 'suppress') {
    throw new TestSideEffectPolicyError('FORBIDDEN');
  }
}

export function assertInAppNotificationRecipientAllowed(input: {
  readonly executionScope: CanonicalExecutionScope;
  readonly recipientAccountId: string;
  readonly recipientRecord?: unknown;
  readonly commandActorAccountId?: string;
}): void {
  if (input.executionScope.dataScope === 'live') {
    return;
  }

  if (
    input.commandActorAccountId !== undefined &&
    input.commandActorAccountId === input.recipientAccountId
  ) {
    const actorLooksLive =
      !input.recipientRecord ||
      parsePersistedCanonicalScope(input.recipientRecord, { allowLegacyLive: true }).dataScope ===
        'live';
    if (actorLooksLive) {
      throw new TestSideEffectPolicyError('RECIPIENT_IS_COMMAND_ACTOR');
    }
  }

  if (!input.recipientRecord) {
    throw new TestSideEffectPolicyError('RECIPIENT_CROSS_SCOPE');
  }

  let recipientScope: CanonicalExecutionScope;
  try {
    recipientScope = parsePersistedCanonicalScope(input.recipientRecord, {
      allowLegacyLive: true,
    });
  } catch {
    throw new TestSideEffectPolicyError('RECIPIENT_CROSS_SCOPE');
  }

  if (
    recipientScope.dataScope !== 'test' ||
    input.executionScope.dataScope !== 'test' ||
    recipientScope.testSessionId !== input.executionScope.testSessionId
  ) {
    throw new TestSideEffectPolicyError('RECIPIENT_CROSS_SCOPE');
  }

  const record = input.recipientRecord as Record<string, unknown>;
  if (typeof record.accountId === 'string' && record.accountId !== input.recipientAccountId) {
    throw new TestSideEffectPolicyError('RECIPIENT_CROSS_SCOPE');
  }
}

export function notificationEligibleForUserPurge(
  notification: { readonly userId?: unknown; readonly dataScope?: unknown; readonly testSessionId?: unknown },
  userId: string
): boolean {
  return notification.userId === userId;
}

export function notificationEligibleForTestSessionCleanup(
  notification: { readonly dataScope?: unknown; readonly testSessionId?: unknown },
  testSessionId: string
): boolean {
  return notification.dataScope === 'test' && notification.testSessionId === testSessionId;
}

export type OutboxDeliveryPolicyErrorCode = 'SUPPRESSED' | 'FORBIDDEN' | 'UNKNOWN_SCOPE' | 'UNKNOWN_CHANNEL';

export class OutboxDeliveryPolicyError extends Error {
  constructor(readonly code: OutboxDeliveryPolicyErrorCode) {
    super(code);
    this.name = 'OutboxDeliveryPolicyError';
  }
}

/**
 * Future email/SMS/push workers must call this before any external delivery.
 * Unknown scope/channel and TEST external channels fail closed even if a
 * pending record was staged by mistake.
 */
export function assertOutboxDeliveryMayProceed(obligation: DomainOutboxObligation): void {
  if (obligation.delivery.status === 'suppressed') {
    throw new OutboxDeliveryPolicyError('SUPPRESSED');
  }
  if (obligation.delivery.status === 'delivered' || obligation.delivery.status === 'dead_letter') {
    throw new OutboxDeliveryPolicyError('FORBIDDEN');
  }

  let scope: CanonicalExecutionScope;
  try {
    scope = parsePersistedCanonicalScope(obligation, { allowLegacyLive: true });
  } catch {
    throw new OutboxDeliveryPolicyError('UNKNOWN_SCOPE');
  }

  const channel = outboxChannelToSideEffectChannel(obligation.channel);
  const decision = resolveTestSideEffectPolicy(scope, channel);

  if (decision.action === 'forbidden' || decision.action === 'suppress') {
    throw new OutboxDeliveryPolicyError(
      decision.action === 'forbidden' ? 'FORBIDDEN' : 'SUPPRESSED'
    );
  }
  if (decision.action === 'not_implemented') {
    throw new OutboxDeliveryPolicyError('FORBIDDEN');
  }
}

export function testOutboxDeliveryFromPolicy(
  scope: CanonicalExecutionScope,
  channel: OutboxDeliveryChannel,
  createdAt: DomainOutboxObligation['createdAt']
): DomainOutboxObligation['delivery'] {
  const decision = resolveTestSideEffectPolicy(scope, outboxChannelToSideEffectChannel(channel));
  if (decision.action === 'suppress') {
    return {
      status: 'suppressed',
      suppressedAt: createdAt,
      suppressionReason: decision.reason,
    };
  }
  if (decision.action === 'forbidden') {
    throw new TestSideEffectPolicyError('FORBIDDEN');
  }
  return { status: 'pending' };
}
