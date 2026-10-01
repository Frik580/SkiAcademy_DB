import { randomBytes } from 'node:crypto';
import {
  BookingIdSchema,
  CourseEnrollmentIdSchema,
  OutboxDeliveryPolicyError,
  TEST_EXTERNAL_CHANNEL_SUPPRESSION_REASON,
  applyOutboxDeliveryResult,
  assertOutboxDeliveryMayProceed,
  canonicalDeterministicHash,
  suppressOutboxDelivery,
  timestampFromDate,
  OUTBOX_DELIVERY_BATCH_LIMIT,
  OUTBOX_DELIVERY_MAX_ATTEMPTS,
  OUTBOX_DELIVERY_MAX_SCAN,
  OUTBOX_PROVIDER_NOT_CONFIGURED,
  type CanonicalTimestamp,
  type DomainOutboxObligation,
  type GuestContactSubject,
  type NotificationLocale,
  type OutboxDeliveryAttemptResult,
} from '@ski-academy/shared-domain';
import {
  outboxLocaleFromRenderInputs,
  outboxMessageTemplate,
  outboxMessageType,
  renderOutboundEmail,
} from './outboxMessageCatalog';

export interface InAppNotificationWrite {
  readonly notificationId: string;
  readonly userId: string;
  readonly titleEn: string;
  readonly titleRu: string;
  readonly messageEn: string;
  readonly messageRu: string;
  readonly type: 'info' | 'success' | 'warning';
  readonly timestamp: string;
  readonly isRead: false;
  readonly dataScope: 'live' | 'test';
  readonly testSessionId?: string;
  readonly templateId: string;
  readonly outboxId: string;
}

export type OutboundEmailLocale = NotificationLocale | 'bilingual';

/**
 * Future provider contract. `idempotencyKey` is the outbox id.
 * A crash after the provider accepts the message retries the same key.
 * Network exactly-once delivery still depends on the provider honoring that key.
 */
export interface OutboundEmailMessage {
  readonly idempotencyKey: string;
  readonly to: string;
  readonly locale: OutboundEmailLocale;
  readonly templateId: string;
  readonly subject: string;
  readonly text: string;
}

export interface EmailDeliveryAdapter {
  readonly isConfigured: () => boolean;
  readonly send: (message: OutboundEmailMessage) => Promise<OutboxDeliveryAttemptResult>;
}

export interface OutboxCandidateQuery {
  readonly excludeChannels?: readonly string[];
}

export interface OutboxDeliveryStore {
  readEmailDeliveryEnabled(): Promise<boolean>;
  listCandidates(
    now: CanonicalTimestamp,
    limit: number,
    query?: OutboxCandidateQuery
  ): Promise<{ readonly obligations: readonly DomainOutboxObligation[]; readonly scanned: number }>;
  claim(
    outboxId: string,
    now: CanonicalTimestamp,
    leaseToken: string,
    query?: OutboxCandidateQuery
  ): Promise<
    | { readonly status: 'claimed'; readonly obligation: DomainOutboxObligation }
    | { readonly status: 'lost' | 'invalid' | 'missing' | 'ineligible' }
  >;
  beginSend(
    outboxId: string,
    leaseToken: string,
    now: CanonicalTimestamp
  ): Promise<
    | { readonly status: 'begun'; readonly obligation: DomainOutboxObligation }
    | { readonly status: 'exhausted' }
    | { readonly status: 'lost' }
  >;
  finish(
    outboxId: string,
    leaseToken: string,
    delivery: DomainOutboxObligation['delivery']
  ): Promise<'committed' | 'lost'>;
  putInAppNotificationIfAbsent(notification: InAppNotificationWrite): Promise<'created' | 'exists'>;
  readGuestEmail(obligation: DomainOutboxObligation): Promise<string | undefined>;
  readGuestNotificationLocale(
    obligation: DomainOutboxObligation
  ): Promise<NotificationLocale | undefined>;
}

export interface OutboxDeliveryBatchResult {
  readonly scanned: number;
  readonly claimed: number;
  readonly sent: number;
  readonly retryScheduled: number;
  readonly deadLetter: number;
  readonly notConfigured: number;
  readonly skipped: number;
  readonly failed: number;
}

export type OutboxDeliveryItemResult =
  | 'sent'
  | 'retry_scheduled'
  | 'dead_letter'
  | 'not_configured'
  | 'skipped'
  | 'failed';

const EMPTY_BATCH: OutboxDeliveryBatchResult = {
  scanned: 0,
  claimed: 0,
  sent: 0,
  retryScheduled: 0,
  deadLetter: 0,
  notConfigured: 0,
  skipped: 0,
  failed: 0,
};

export function inAppNotificationIdForOutbox(outboxId: string): string {
  return canonicalDeterministicHash(['notification:v1', outboxId]);
}

export function createOutboxLeaseToken(): string {
  return randomBytes(16).toString('hex');
}

export function guestContactSubjectForObligation(
  obligation: DomainOutboxObligation
): GuestContactSubject | undefined {
  if (obligation.recipient.kind !== 'guest') return undefined;
  const bookingId = obligation.renderInputs.bookingId;
  if (typeof bookingId === 'string') {
    const parsed = BookingIdSchema.safeParse(bookingId);
    if (parsed.success) return { kind: 'booking', bookingId: parsed.data };
  }
  const enrollmentId = obligation.renderInputs.courseEnrollmentId;
  if (typeof enrollmentId === 'string') {
    const parsed = CourseEnrollmentIdSchema.safeParse(enrollmentId);
    if (parsed.success) return { kind: 'course_enrollment', enrollmentId: parsed.data };
  }
  return undefined;
}

export function outboxDeliveryLogRecord(fields: {
  readonly outboxId: string;
  readonly templateId: string;
  readonly channel: string;
  readonly attemptCount: number;
  readonly resultClass: string;
}): {
  readonly event: 'outbox_delivery';
  readonly outboxId: string;
  readonly templateId: string;
  readonly channel: string;
  readonly attemptCount: number;
  readonly resultClass: string;
} {
  return {
    event: 'outbox_delivery',
    outboxId: fields.outboxId,
    templateId: fields.templateId,
    channel: fields.channel,
    attemptCount: fields.attemptCount,
    resultClass: fields.resultClass,
  };
}

function logDelivery(fields: {
  readonly outboxId: string;
  readonly templateId: string;
  readonly channel: string;
  readonly attemptCount: number;
  readonly resultClass: string;
}): void {
  console.log(JSON.stringify(outboxDeliveryLogRecord(fields)));
}

async function commitDelivery(
  store: OutboxDeliveryStore,
  obligation: DomainOutboxObligation,
  leaseToken: string,
  delivery: DomainOutboxObligation['delivery'] | undefined
): Promise<OutboxDeliveryItemResult> {
  if (!delivery) return 'failed';
  const committed = await store.finish(obligation.outboxId, leaseToken, delivery);
  if (committed !== 'committed') return 'failed';
  const attemptCount = delivery.status === 'suppressed' ? 0 : (delivery.attemptCount ?? 0);
  const resultClass =
    delivery.status === 'delivered'
      ? 'sent'
      : delivery.status === 'dead_letter'
        ? 'dead_letter'
        : delivery.status === 'pending' && delivery.lastErrorCode === OUTBOX_PROVIDER_NOT_CONFIGURED
          ? 'not_configured'
          : delivery.status === 'pending'
            ? 'retry_scheduled'
            : delivery.status === 'suppressed'
              ? 'skipped'
              : 'failed';
  logDelivery({
    outboxId: obligation.outboxId,
    templateId: obligation.templateId,
    channel: obligation.channel,
    attemptCount,
    resultClass,
  });
  if (resultClass === 'sent') return 'sent';
  if (resultClass === 'dead_letter') return 'dead_letter';
  if (resultClass === 'not_configured') return 'not_configured';
  if (resultClass === 'retry_scheduled') return 'retry_scheduled';
  if (resultClass === 'skipped') return 'skipped';
  return 'failed';
}

async function executeSend(input: {
  readonly store: OutboxDeliveryStore;
  readonly email: EmailDeliveryAdapter;
  readonly obligation: DomainOutboxObligation;
  readonly leaseToken: string;
  readonly now: CanonicalTimestamp;
}): Promise<OutboxDeliveryItemResult> {
  const begun = await input.store.beginSend(input.obligation.outboxId, input.leaseToken, input.now);
  if (begun.status === 'exhausted') {
    logDelivery({
      outboxId: input.obligation.outboxId,
      templateId: input.obligation.templateId,
      channel: input.obligation.channel,
      attemptCount: OUTBOX_DELIVERY_MAX_ATTEMPTS,
      resultClass: 'dead_letter',
    });
    return 'dead_letter';
  }
  if (begun.status !== 'begun') return 'failed';

  let sendResult: OutboxDeliveryAttemptResult;
  try {
    sendResult = await dispatchSend(input.store, input.email, begun.obligation, input.now);
  } catch {
    sendResult = { resultClass: 'retryable', errorCode: 'UNEXPECTED' };
  }
  const delivery = applyOutboxDeliveryResult({
    obligation: begun.obligation,
    leaseToken: input.leaseToken,
    now: input.now,
    result: sendResult,
  });
  return commitDelivery(input.store, begun.obligation, input.leaseToken, delivery);
}

async function dispatchSend(
  store: OutboxDeliveryStore,
  email: EmailDeliveryAdapter,
  obligation: DomainOutboxObligation,
  now: CanonicalTimestamp
): Promise<OutboxDeliveryAttemptResult> {
  if (obligation.channel === 'in_app') {
    if (obligation.recipient.kind !== 'account') {
      return { resultClass: 'permanent', errorCode: 'INVALID_RECIPIENT' };
    }
    const template = outboxMessageTemplate(obligation.templateId);
    if (!template) return { resultClass: 'permanent', errorCode: 'UNKNOWN_TEMPLATE' };
    const notificationId = inAppNotificationIdForOutbox(obligation.outboxId);
    await store.putInAppNotificationIfAbsent({
      notificationId,
      userId: obligation.recipient.id,
      titleEn: template.en.title,
      titleRu: template.ru.title,
      messageEn: template.en.message,
      messageRu: template.ru.message,
      type: outboxMessageType(obligation.templateId),
      timestamp: new Date(now.seconds * 1000).toISOString(),
      isRead: false,
      dataScope: obligation.dataScope === 'test' ? 'test' : 'live',
      ...(obligation.testSessionId === undefined ? {} : { testSessionId: obligation.testSessionId }),
      templateId: obligation.templateId,
      outboxId: obligation.outboxId,
    });
    return { resultClass: 'sent', providerMessageId: notificationId };
  }

  if (obligation.channel !== 'email') {
    return { resultClass: 'permanent', errorCode: 'UNSUPPORTED_CHANNEL' };
  }
  if (!email.isConfigured()) {
    return { resultClass: 'not_configured', errorCode: OUTBOX_PROVIDER_NOT_CONFIGURED };
  }
  if (obligation.recipient.kind !== 'guest') {
    return { resultClass: 'permanent', errorCode: 'INVALID_RECIPIENT' };
  }
  const explicitLocale = outboxLocaleFromRenderInputs(obligation.renderInputs);
  const locale = explicitLocale ?? (await store.readGuestNotificationLocale(obligation)) ?? 'bilingual';
  const rendered = renderOutboundEmail(obligation.templateId, locale);
  if (!rendered) return { resultClass: 'permanent', errorCode: 'UNKNOWN_TEMPLATE' };
  const to = await store.readGuestEmail(obligation);
  if (!to) return { resultClass: 'permanent', errorCode: 'MISSING_RECIPIENT' };
  return email.send({
    idempotencyKey: obligation.outboxId,
    to,
    locale,
    templateId: obligation.templateId,
    subject: rendered.subject,
    text: rendered.text,
  });
}

export async function deliverOutboxObligation(input: {
  readonly store: OutboxDeliveryStore;
  readonly email: EmailDeliveryAdapter;
  readonly outboxId: string;
  readonly now: Date;
  readonly leaseToken?: string;
  readonly emailDeliveryEnabled?: boolean;
}): Promise<OutboxDeliveryItemResult> {
  const now = timestampFromDate(input.now);
  const leaseToken = input.leaseToken ?? createOutboxLeaseToken();
  const emailDeliveryEnabled =
    input.emailDeliveryEnabled ?? (await input.store.readEmailDeliveryEnabled());
  const effectiveEmailDelivery = input.email.isConfigured() && emailDeliveryEnabled;
  let claimed: Awaited<ReturnType<OutboxDeliveryStore['claim']>>;
  try {
    claimed = await input.store.claim(input.outboxId, now, leaseToken, {
      excludeChannels: effectiveEmailDelivery ? [] : ['email'],
    });
  } catch {
    return 'failed';
  }
  if (claimed.status !== 'claimed') return 'skipped';
  const obligation = claimed.obligation;

  try {
    assertOutboxDeliveryMayProceed(obligation);
  } catch (error) {
    if (error instanceof OutboxDeliveryPolicyError && error.code === 'SUPPRESSED') {
      return commitDelivery(
        input.store,
        obligation,
        leaseToken,
        suppressOutboxDelivery({
          obligation,
          leaseToken,
          now,
          suppressionReason: TEST_EXTERNAL_CHANNEL_SUPPRESSION_REASON,
        })
      );
    }
    return commitDelivery(
      input.store,
      obligation,
      leaseToken,
      applyOutboxDeliveryResult({
        obligation,
        leaseToken,
        now,
        result: { resultClass: 'permanent', errorCode: 'DELIVERY_FORBIDDEN' },
      })
    );
  }

  if (obligation.channel === 'in_app' && !outboxMessageTemplate(obligation.templateId)) {
    return commitDelivery(
      input.store,
      obligation,
      leaseToken,
      applyOutboxDeliveryResult({
        obligation,
        leaseToken,
        now,
        result: { resultClass: 'permanent', errorCode: 'UNKNOWN_TEMPLATE' },
      })
    );
  }

  if (obligation.channel === 'email' && !renderOutboundEmail(obligation.templateId, 'en')) {
    return commitDelivery(
      input.store,
      obligation,
      leaseToken,
      applyOutboxDeliveryResult({
        obligation,
        leaseToken,
        now,
        result: { resultClass: 'permanent', errorCode: 'UNKNOWN_TEMPLATE' },
      })
    );
  }

  try {
    return await executeSend({
      store: input.store,
      email: input.email,
      obligation,
      leaseToken,
      now,
    });
  } catch {
    return 'failed';
  }
}

export async function deliverDueOutboxBatch(input: {
  readonly store: OutboxDeliveryStore;
  readonly email: EmailDeliveryAdapter;
  readonly now?: Date;
  readonly limit?: number;
}): Promise<OutboxDeliveryBatchResult> {
  const clock = input.now ?? new Date();
  const now = timestampFromDate(clock);
  const limit = input.limit ?? OUTBOX_DELIVERY_BATCH_LIMIT;
  let emailDeliveryEnabled = false;
  try {
    emailDeliveryEnabled = await input.store.readEmailDeliveryEnabled();
  } catch {
    return { ...EMPTY_BATCH, failed: 1 };
  }
  const effectiveEmailDelivery = input.email.isConfigured() && emailDeliveryEnabled;
  let listed: { readonly obligations: readonly DomainOutboxObligation[]; readonly scanned: number };
  try {
    listed = await input.store.listCandidates(now, limit, {
      excludeChannels: effectiveEmailDelivery ? [] : ['email'],
    });
  } catch {
    return { ...EMPTY_BATCH, failed: 1 };
  }

  const result: OutboxDeliveryBatchResult = {
    ...EMPTY_BATCH,
    scanned: Math.min(listed.scanned, OUTBOX_DELIVERY_MAX_SCAN),
  };
  const counters = { ...result };
  for (const candidate of listed.obligations) {
    let item: OutboxDeliveryItemResult;
    try {
      item = await deliverOutboxObligation({
        store: input.store,
        email: input.email,
        outboxId: candidate.outboxId,
        now: clock,
        emailDeliveryEnabled,
      });
    } catch {
      item = 'failed';
    }
    if (item !== 'skipped') counters.claimed += 1;
    if (item === 'sent') counters.sent += 1;
    else if (item === 'retry_scheduled') counters.retryScheduled += 1;
    else if (item === 'dead_letter') counters.deadLetter += 1;
    else if (item === 'not_configured') counters.notConfigured += 1;
    else if (item === 'skipped') counters.skipped += 1;
    else counters.failed += 1;
  }
  return counters;
}
