import { describe, expect, it } from 'vitest';
import {
  CommandIdSchema,
  DomainOutboxObligationSchema,
  OUTBOX_DELIVERY_BATCH_LIMIT,
  OUTBOX_DELIVERY_LEASE_MS,
  OUTBOX_DELIVERY_MAX_ATTEMPTS,
  OUTBOX_DELIVERY_MAX_SCAN,
  addCanonicalTimestampMs,
  isOutboxRetentionEligible,
  projectOutboxDeadLetter,
  activityLogIdFromCommandId,
  beginOutboxSend,
  buildOutboxObligationRecords,
  claimOutboxDelivery,
  domainOutboxIdFromCommand,
  selectOutboxDeliveryCandidates,
  timestampFromDate,
  type CanonicalTimestamp,
  type DomainOutboxObligation,
} from '@ski-academy/shared-domain';
import { renderOutboundEmail, renderOutboxMessage } from './outboxMessageCatalog';
import {
  deliverDueOutboxBatch,
  deliverOutboxObligation,
  guestContactSubjectForObligation,
  outboxDeliveryLogRecord,
  type EmailDeliveryAdapter,
  type InAppNotificationWrite,
  type OutboundEmailMessage,
  type OutboxDeliveryStore,
} from './outboxDeliveryWorker';

const NOW = new Date('2026-10-01T06:00:00.000Z');
const GUEST_EMAIL = 'guest.delivery@example.com';

class MemoryOutboxDeliveryStore implements OutboxDeliveryStore {
  /**
   * Production treats a missing settings document as disabled.
   * This double defaults to enabled so existing send tests exercise delivery.
   */
  emailDeliveryEnabled = true;
  readonly docs = new Map<string, DomainOutboxObligation>();
  readonly notifications = new Map<string, InAppNotificationWrite>();
  readonly guestEmails = new Map<string, string>();
  readonly guestLocales = new Map<string, 'ru' | 'en'>();
  adminIssueWrites = 0;
  listCalls = 0;
  failNextFinish = false;
  lastScanned = 0;
  private tail: Promise<void> = Promise.resolve();

  private exclusive<T>(fn: () => T): Promise<T> {
    const previous = this.tail;
    let release: () => void = () => undefined;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    return previous.then(() => {
      try {
        return fn();
      } finally {
        release();
      }
    });
  }

  put(obligation: DomainOutboxObligation): void {
    this.docs.set(obligation.outboxId, obligation);
  }

  rememberGuestEmail(obligation: DomainOutboxObligation, email: string): void {
    const subject = guestContactSubjectForObligation(obligation);
    if (!subject) return;
    const id = subject.kind === 'booking' ? subject.bookingId : subject.enrollmentId;
    this.guestEmails.set(`${subject.kind}:${id}`, email);
  }

  rememberGuestLocale(obligation: DomainOutboxObligation, locale: 'ru' | 'en'): void {
    const subject = guestContactSubjectForObligation(obligation);
    if (!subject) return;
    const id = subject.kind === 'booking' ? subject.bookingId : subject.enrollmentId;
    this.guestLocales.set(`${subject.kind}:${id}`, locale);
  }

  async readEmailDeliveryEnabled() {
    return this.emailDeliveryEnabled;
  }

  async listCandidates(
    now: CanonicalTimestamp,
    limit: number,
    query?: { readonly excludeChannels?: readonly string[] }
  ) {
    this.listCalls += 1;
    const excluded = new Set(query?.excludeChannels ?? []);
    const visible = [...this.docs.values()].filter((obligation) => !excluded.has(obligation.channel));
    const listed = selectOutboxDeliveryCandidates(visible, now, limit);
    this.lastScanned = listed.scanned;
    return { obligations: listed.selected, scanned: listed.scanned };
  }

  async claim(
    outboxId: string,
    now: CanonicalTimestamp,
    leaseToken: string,
    query?: { readonly excludeChannels?: readonly string[] }
  ) {
    return this.exclusive(() => {
      const current = this.docs.get(outboxId);
      if (!current) return { status: 'missing' as const };
      if (query?.excludeChannels?.includes(current.channel)) {
        return { status: 'ineligible' as const };
      }
      const delivery = claimOutboxDelivery({ obligation: current, now, leaseToken });
      if (!delivery) return { status: 'lost' as const };
      const obligation = DomainOutboxObligationSchema.parse({ ...current, delivery });
      this.docs.set(outboxId, obligation);
      return { status: 'claimed' as const, obligation };
    });
  }

  async beginSend(outboxId: string, leaseToken: string, now: CanonicalTimestamp) {
    return this.exclusive(() => {
      const current = this.docs.get(outboxId);
      if (!current) return { status: 'lost' as const };
      const decision = beginOutboxSend({ obligation: current, leaseToken, now });
      if (decision.status === 'lost') return { status: 'lost' as const };
      const obligation = DomainOutboxObligationSchema.parse({ ...current, delivery: decision.delivery });
      this.docs.set(outboxId, obligation);
      if (decision.status === 'exhausted') return { status: 'exhausted' as const };
      return { status: 'begun' as const, obligation };
    });
  }

  async finish(outboxId: string, leaseToken: string, delivery: DomainOutboxObligation['delivery']) {
    return this.exclusive(() => {
      if (this.failNextFinish) {
        this.failNextFinish = false;
        throw new Error('crash_before_delivery_commit');
      }
      const current = this.docs.get(outboxId);
      if (!current || current.delivery.status !== 'leased' || current.delivery.leaseToken !== leaseToken) {
        return 'lost' as const;
      }
      const obligation = DomainOutboxObligationSchema.parse({ ...current, delivery });
      this.docs.set(outboxId, obligation);
      return 'committed' as const;
    });
  }

  async putInAppNotificationIfAbsent(notification: InAppNotificationWrite) {
    return this.exclusive(() => {
      if (this.notifications.has(notification.notificationId)) return 'exists' as const;
      this.notifications.set(notification.notificationId, notification);
      return 'created' as const;
    });
  }

  async readGuestEmail(obligation: DomainOutboxObligation) {
    const subject = guestContactSubjectForObligation(obligation);
    if (!subject) return undefined;
    const id = subject.kind === 'booking' ? subject.bookingId : subject.enrollmentId;
    return this.guestEmails.get(`${subject.kind}:${id}`);
  }

  async readGuestNotificationLocale(obligation: DomainOutboxObligation) {
    const subject = guestContactSubjectForObligation(obligation);
    if (!subject) return undefined;
    const id = subject.kind === 'booking' ? subject.bookingId : subject.enrollmentId;
    return this.guestLocales.get(`${subject.kind}:${id}`);
  }
}

class FakeEmailAdapter implements EmailDeliveryAdapter {
  configured = true;
  mode: 'sent' | 'retryable' | 'permanent' = 'sent';
  customerSends = 0;
  sendCalls = 0;
  readonly messages: OutboundEmailMessage[] = [];
  private readonly accepted = new Map<string, string>();

  isConfigured(): boolean {
    return this.configured;
  }

  async send(message: OutboundEmailMessage) {
    this.sendCalls += 1;
    this.messages.push(message);
    if (!this.configured) {
      return { resultClass: 'not_configured' as const, errorCode: 'PROVIDER_NOT_CONFIGURED' };
    }
    if (this.mode === 'retryable') {
      return { resultClass: 'retryable' as const, errorCode: 'PROVIDER_TIMEOUT' };
    }
    if (this.mode === 'permanent') {
      return { resultClass: 'permanent' as const, errorCode: 'INVALID_DESTINATION' };
    }
    const existing = this.accepted.get(message.idempotencyKey);
    if (existing) return { resultClass: 'sent' as const, providerMessageId: existing };
    this.customerSends += 1;
    const providerMessageId = `provider_${this.customerSends}`;
    this.accepted.set(message.idempotencyKey, providerMessageId);
    return { resultClass: 'sent' as const, providerMessageId };
  }
}

function obligation(input: {
  readonly commandKey: string;
  readonly ordinal?: number;
  readonly channel?: 'in_app' | 'email' | 'sms';
  readonly templateId?: string;
  readonly recipient?: DomainOutboxObligation['recipient'];
  readonly semantics?: 'transactional' | 'operational';
  readonly createdAt?: Date;
  readonly renderInputs?: Record<string, string | number | boolean>;
}): DomainOutboxObligation {
  const commandId = CommandIdSchema.parse(input.commandKey);
  const ordinal = input.ordinal ?? 0;
  return DomainOutboxObligationSchema.parse({
    schemaVersion: 'outbox:v1',
    dataScope: 'live',
    outboxId: domainOutboxIdFromCommand(commandId, ordinal),
    commandId,
    activityLogId: activityLogIdFromCommandId(commandId),
    deliveryEffectOrdinal: ordinal,
    recipient: input.recipient ?? { kind: 'account', id: 'account_delivery_owner_01' },
    channel: input.channel ?? 'in_app',
    templateId: input.templateId ?? 'booking_confirmed',
    templateVersion: 'v1',
    renderInputs: input.renderInputs ?? { bookingId: 'booking_delivery_01' },
    deliverySemantics: input.semantics ?? 'transactional',
    createdAt: timestampFromDate(input.createdAt ?? NOW),
    delivery: { status: 'pending' },
  });
}

function guestBooking(commandKey: string, templateId = 'guest_booking_confirmed'): DomainOutboxObligation {
  return obligation({
    commandKey,
    channel: 'email',
    templateId,
    recipient: { kind: 'guest', id: 'booking_guest_delivery_01' },
    renderInputs: { bookingId: 'booking_guest_delivery_01' },
  });
}

describe('outbox delivery worker', () => {
  it('creates one logical delivery intent and ignores a duplicate command plan', () => {
    const commandId = CommandIdSchema.parse('command_delivery_dedupe_01');
    const createdAt = timestampFromDate(NOW);
    const drafts = [
      {
        deliveryEffectOrdinal: 0,
        recipient: { kind: 'account' as const, id: 'account_delivery_owner_01' },
        channel: 'in_app' as const,
        templateId: 'booking_confirmed',
        templateVersion: 'v1',
        renderInputs: { bookingId: 'booking_delivery_01' },
        deliverySemantics: 'transactional' as const,
      },
    ];
    const first = buildOutboxObligationRecords({
      commandId,
      activityLogId: activityLogIdFromCommandId(commandId),
      createdAt,
      drafts,
    });
    const second = buildOutboxObligationRecords({
      commandId,
      activityLogId: activityLogIdFromCommandId(commandId),
      createdAt,
      drafts,
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]?.outboxId).toBe(second[0]?.outboxId);
  });

  it('claims a pending job once and does not let a second worker send it', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const job = guestBooking('command_delivery_claim_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    const [first, second] = await Promise.all([
      deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW }),
      deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW }),
    ]);
    expect([first, second].sort()).toEqual(['sent', 'skipped']);
    expect(email.customerSends).toBe(1);
    expect(store.docs.get(job.outboxId)?.delivery.status).toBe('delivered');
    expect(JSON.stringify(store.docs.get(job.outboxId))).not.toContain(GUEST_EMAIL);
  });

  it('marks a successful in-app send delivered and does not duplicate it on re-entry', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const job = obligation({
      commandKey: 'command_delivery_success_01',
      templateId: 'course_enrollment_created',
      renderInputs: { courseEnrollmentId: 'course_enrollment_delivery_01' },
    });
    store.put(job);
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe('sent');
    expect(store.docs.get(job.outboxId)?.delivery.status).toBe('delivered');
    expect(store.notifications.size).toBe(1);
    const notification = [...store.notifications.values()][0];
    expect(notification?.titleRu.length).toBeGreaterThan(0);
    expect(notification?.titleEn.length).toBeGreaterThan(0);
    expect(notification?.messageEn).not.toContain('course_enrollment_delivery_01');
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe('skipped');
    expect(store.notifications.size).toBe(1);
    expect(email.customerSends).toBe(0);
  });

  it('schedules a retryable provider failure and skips it until it is due', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    email.mode = 'retryable';
    const job = guestBooking('command_delivery_retry_01', 'guest_booking_pending');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe(
      'retry_scheduled'
    );
    const waiting = store.docs.get(job.outboxId);
    expect(waiting?.delivery.status).toBe('pending');
    expect(waiting?.delivery.status === 'pending' ? waiting.delivery.lastErrorCode : '').toBe(
      'PROVIDER_TIMEOUT'
    );
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe(
      'skipped'
    );
    expect(email.sendCalls).toBe(1);
    const dueAt =
      waiting?.delivery.status === 'pending' && waiting.delivery.nextAttemptAt
        ? new Date(waiting.delivery.nextAttemptAt.seconds * 1000 + 1000)
        : NOW;
    expect(
      await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: dueAt })
    ).toBe('retry_scheduled');
    expect(email.sendCalls).toBe(2);
  });

  it('stops on a permanent provider failure', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    email.mode = 'permanent';
    const job = guestBooking('command_delivery_permanent_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe(
      'dead_letter'
    );
    expect(store.docs.get(job.outboxId)?.delivery.status).toBe('dead_letter');
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe(
      'skipped'
    );
    expect(email.sendCalls).toBe(1);
  });

  it('dead-letters retry exhaustion once and does not open another operational record', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    email.mode = 'retryable';
    const job = guestBooking('command_delivery_exhaust_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    let clock = NOW;
    let terminal = store.docs.get(job.outboxId);
    for (let attempt = 0; attempt < OUTBOX_DELIVERY_MAX_ATTEMPTS + 2; attempt += 1) {
      await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: clock });
      terminal = store.docs.get(job.outboxId);
      if (terminal?.delivery.status === 'dead_letter') break;
      if (terminal?.delivery.status === 'pending' && terminal.delivery.nextAttemptAt) {
        clock = new Date(terminal.delivery.nextAttemptAt.seconds * 1000 + 1000);
      }
    }
    expect(terminal?.delivery.status).toBe('dead_letter');
    expect(email.sendCalls).toBe(OUTBOX_DELIVERY_MAX_ATTEMPTS);
    const deadLetteredAt =
      terminal?.delivery.status === 'dead_letter' ? terminal.delivery.deadLetteredAt : undefined;
    expect(
      await deliverOutboxObligation({
        store,
        email,
        outboxId: job.outboxId,
        now: new Date(clock.getTime() + 60_000),
      })
    ).toBe('skipped');
    expect(store.docs.get(job.outboxId)?.delivery).toMatchObject({
      status: 'dead_letter',
      deadLetteredAt,
    });
    expect(store.adminIssueWrites).toBe(0);
    expect(email.sendCalls).toBe(OUTBOX_DELIVERY_MAX_ATTEMPTS);
  });

  it('keeps a successful provider accept from becoming a second customer message after a crash', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const job = guestBooking('command_delivery_crash_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    store.failNextFinish = true;
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe(
      'failed'
    );
    expect(email.customerSends).toBe(1);
    expect(store.docs.get(job.outboxId)?.delivery.status).toBe('leased');
    const recovered = await deliverOutboxObligation({
      store,
      email,
      outboxId: job.outboxId,
      now: new Date(NOW.getTime() + 5 * 60 * 1000),
    });
    expect(recovered).toBe('sent');
    expect(email.customerSends).toBe(1);
    expect(email.sendCalls).toBe(2);
    expect(store.docs.get(job.outboxId)?.delivery.status).toBe('delivered');
  });

  it('does not let a missing recipient or one failed job stop the batch', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const missingEnrollment = obligation({
      commandKey: 'command_delivery_missing_01',
      channel: 'email',
      templateId: 'guest_course_enrollment_cancelled',
      recipient: { kind: 'guest', id: 'course_enrollment_delivery_01' },
      renderInputs: { courseEnrollmentId: 'course_enrollment_delivery_01' },
    });
    const ok = obligation({
      commandKey: 'command_delivery_missing_02',
      templateId: 'booking_cancelled',
    });
    store.put(missingEnrollment);
    store.put(ok);
    const result = await deliverDueOutboxBatch({ store, email, now: NOW });
    expect(result.deadLetter).toBe(1);
    expect(result.sent).toBe(1);
    expect(store.docs.get(missingEnrollment.outboxId)?.delivery.status).toBe('dead_letter');
    expect(store.docs.get(ok.outboxId)?.delivery.status).toBe('delivered');
  });

  it('does not mark a job sent when the email provider is not configured', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const send = async () => {
      throw new Error('send must not be called');
    };
    const email: EmailDeliveryAdapter = { isConfigured: () => false, send };
    const job = guestBooking('command_delivery_unconfigured_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe(
      'skipped'
    );
    const stored = store.docs.get(job.outboxId);
    expect(stored?.delivery).toEqual({ status: 'pending' });
    expect(JSON.stringify(stored)).not.toContain(GUEST_EMAIL);
  });

  it('processes only a bounded batch', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const jobs = Array.from({ length: 40 }, (_, index) =>
      obligation({
        commandKey: `command_delivery_batch_${String(index).padStart(2, '0')}`,
        createdAt: new Date(NOW.getTime() + index * 1000),
      })
    );
    for (const job of jobs) store.put(job);
    const now = timestampFromDate(NOW);
    const preview = selectOutboxDeliveryCandidates([...store.docs.values()], now, OUTBOX_DELIVERY_BATCH_LIMIT);
    expect(preview.selected).toHaveLength(OUTBOX_DELIVERY_BATCH_LIMIT);
    expect(preview.scanned).toBe(OUTBOX_DELIVERY_BATCH_LIMIT);
    const result = await deliverDueOutboxBatch({
      store,
      email,
      now: NOW,
      limit: OUTBOX_DELIVERY_BATCH_LIMIT,
    });
    expect(result.sent).toBe(OUTBOX_DELIVERY_BATCH_LIMIT);
    expect(store.lastScanned).toBe(OUTBOX_DELIVERY_BATCH_LIMIT);
    const pending = [...store.docs.values()].filter((job) => job.delivery.status === 'pending');
    expect(pending).toHaveLength(15);
  });

  it('renders Russian and English without internal ids', () => {
    expect(renderOutboxMessage('booking_confirmed', 'ru')?.title).toBe('Бронирование урока подтверждено');
    expect(renderOutboxMessage('booking_confirmed', 'en')?.title).toBe('Lesson booking confirmed');
    expect(renderOutboxMessage('course_enrollment_cancelled', 'ru')?.message).toBe(
      'Ваша запись на курс отменена.'
    );
    expect(renderOutboxMessage('course_enrollment_cancelled', 'en')?.message).toBe(
      'Your course enrollment was cancelled.'
    );
    const russianEmail = renderOutboundEmail('guest_booking_pending', 'ru');
    expect(russianEmail?.subject).toBe('Заявка на урок получена');
    expect(russianEmail?.text).not.toContain('Lesson request');
    expect(russianEmail?.text).not.toContain('booking_');
    const englishEmail = renderOutboundEmail('guest_booking_confirmed', 'en');
    expect(englishEmail?.subject).toBe('Lesson booking confirmed');
    expect(englishEmail?.text).not.toContain('Бронирование');
    const bilingual = renderOutboundEmail('guest_course_enrollment_confirmed', 'bilingual');
    expect(bilingual?.text).toContain('Запись на курс подтверждена');
    expect(bilingual?.text).toContain('Course enrollment confirmed');
  });

  it('leaves operational non-customer obligations unclaimed', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const cleanup = obligation({
      commandKey: 'command_delivery_cleanup_01',
      channel: 'in_app',
      templateId: 'instructor_catalog_image_cleanup',
      recipient: { kind: 'instructor', id: 'instructor_delivery_01' },
      semantics: 'operational',
      renderInputs: { storagePath: 'instructors/instructor_delivery_01/catalog' },
    });
    const customer = obligation({ commandKey: 'command_delivery_cleanup_02' });
    store.put(cleanup);
    store.put(customer);
    await deliverDueOutboxBatch({ store, email, now: NOW });
    expect(store.docs.get(cleanup.outboxId)?.delivery.status).toBe('pending');
    expect(store.docs.get(customer.outboxId)?.delivery.status).toBe('delivered');
  });

  it('does not claim or rewrite email jobs while delivery is off, and still delivers in-app', async () => {
    const store = new MemoryOutboxDeliveryStore();
    store.emailDeliveryEnabled = false;
    const email = new FakeEmailAdapter();
    const emails = Array.from({ length: 100 }, (_, index) =>
      guestBooking(`command_delivery_paused_${String(index).padStart(3, '0')}`)
    );
    for (const job of emails) {
      store.put(job);
      store.rememberGuestEmail(job, GUEST_EMAIL);
    }
    const inApp = obligation({ commandKey: 'command_delivery_paused_in_app' });
    store.put(inApp);
    const before = emails.map((job) => JSON.stringify(store.docs.get(job.outboxId)));
    const first = await deliverDueOutboxBatch({ store, email, now: NOW });
    const second = await deliverDueOutboxBatch({ store, email, now: new Date(NOW.getTime() + 15 * 60 * 1000) });
    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    expect(email.sendCalls).toBe(0);
    expect(email.customerSends).toBe(0);
    expect(emails.map((job) => JSON.stringify(store.docs.get(job.outboxId)))).toEqual(before);
    expect(store.docs.get(inApp.outboxId)?.delivery.status).toBe('delivered');
    for (const job of emails) {
      expect(store.docs.get(job.outboxId)?.delivery).toEqual({ status: 'pending' });
    }
  });

  it('invokes the email adapter only when the provider is configured and delivery is enabled', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const job = guestBooking('command_delivery_enabled_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    expect(await deliverDueOutboxBatch({ store, email, now: NOW })).toMatchObject({ sent: 1 });
    expect(email.sendCalls).toBe(1);
    expect(store.docs.get(job.outboxId)?.delivery.status).toBe('delivered');
  });

  it('makes a paused email job eligible again without sending it twice', async () => {
    const store = new MemoryOutboxDeliveryStore();
    store.emailDeliveryEnabled = false;
    const email = new FakeEmailAdapter();
    const job = guestBooking('command_delivery_reenable_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    await deliverDueOutboxBatch({ store, email, now: NOW });
    expect(store.docs.get(job.outboxId)?.delivery).toEqual({ status: 'pending' });
    expect(email.customerSends).toBe(0);
    store.emailDeliveryEnabled = true;
    const resumed = await deliverDueOutboxBatch({
      store,
      email,
      now: new Date(NOW.getTime() + 60_000),
    });
    expect(resumed.sent).toBe(1);
    expect(email.customerSends).toBe(1);
    expect(store.docs.get(job.outboxId)?.delivery.status).toBe('delivered');
    const again = await deliverDueOutboxBatch({
      store,
      email,
      now: new Date(NOW.getTime() + 120_000),
    });
    expect(again.sent).toBe(0);
    expect(email.customerSends).toBe(1);
  });

  it('keeps in-app delivery when email is administratively disabled', async () => {
    const store = new MemoryOutboxDeliveryStore();
    store.emailDeliveryEnabled = false;
    const email = new FakeEmailAdapter();
    email.configured = false;
    const emailJob = guestBooking('command_delivery_channel_split_email');
    const inApp = obligation({ commandKey: 'command_delivery_channel_split_in_app' });
    store.put(emailJob);
    store.put(inApp);
    store.rememberGuestEmail(emailJob, GUEST_EMAIL);
    await deliverDueOutboxBatch({ store, email, now: NOW });
    expect(store.docs.get(emailJob.outboxId)?.delivery).toEqual({ status: 'pending' });
    expect(store.docs.get(inApp.outboxId)?.delivery.status).toBe('delivered');
    expect(email.sendCalls).toBe(0);
  });
});

function withDelivery(
  job: DomainOutboxObligation,
  delivery: DomainOutboxObligation['delivery']
): DomainOutboxObligation {
  return DomainOutboxObligationSchema.parse({ ...job, delivery });
}

describe('outbox delivery hardening', () => {
  it('processes a new outbox document on the exact-job path without a queue scan', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const job = obligation({ commandKey: 'command_hardening_immediate_01' });
    store.put(job);
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe('sent');
    expect(store.docs.get(job.outboxId)?.delivery.status).toBe('delivered');
    expect(store.listCalls).toBe(0);
    expect(store.notifications.size).toBe(1);
  });

  it('sends once when the same event is delivered twice', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const job = obligation({ commandKey: 'command_hardening_duplicate_event_01' });
    store.put(job);
    const [first, second] = await Promise.all([
      deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW }),
      deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW }),
    ]);
    expect([first, second].sort()).toEqual(['sent', 'skipped']);
    expect(store.notifications.size).toBe(1);
    expect(store.listCalls).toBe(0);
  });

  it('lets the trigger and the recovery scheduler send one message', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const job = guestBooking('command_hardening_race_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    const [trigger, recovery] = await Promise.all([
      deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW }),
      deliverDueOutboxBatch({ store, email, now: NOW }),
    ]);
    expect(email.customerSends).toBe(1);
    expect([trigger, recovery.sent].filter((value) => value === 'sent' || value === 1).length).toBeGreaterThan(0);
    expect(store.docs.get(job.outboxId)?.delivery.status).toBe('delivered');
  });

  it('lets two recovery schedulers send one message', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const job = guestBooking('command_hardening_schedulers_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    const [left, right] = await Promise.all([
      deliverDueOutboxBatch({ store, email, now: NOW }),
      deliverDueOutboxBatch({ store, email, now: NOW }),
    ]);
    expect(left.sent + right.sent).toBe(1);
    expect(email.customerSends).toBe(1);
  });

  it('does not steal a live lease', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const job = withDelivery(obligation({ commandKey: 'command_hardening_live_lease_01' }), {
      status: 'leased',
      leasedAt: timestampFromDate(NOW),
      leaseExpiresAt: timestampFromDate(new Date(NOW.getTime() + OUTBOX_DELIVERY_LEASE_MS)),
      leaseToken: 'live-lease-token-01',
      attemptCount: 1,
    });
    store.put(job);
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe('skipped');
    expect(store.docs.get(job.outboxId)?.delivery.status).toBe('leased');
    expect(store.notifications.size).toBe(0);
  });

  it('reclaims an expired lease after a crashed event worker', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const job = obligation({ commandKey: 'command_hardening_crash_01' });
    store.put(job);
    store.failNextFinish = true;
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe('failed');
    expect(store.docs.get(job.outboxId)?.delivery.status).toBe('leased');
    expect(store.notifications.size).toBe(1);
    const recovered = await deliverDueOutboxBatch({
      store,
      email,
      now: new Date(NOW.getTime() + OUTBOX_DELIVERY_LEASE_MS + 1_000),
    });
    expect(recovered.sent).toBe(1);
    expect(store.notifications.size).toBe(1);
    expect(store.docs.get(job.outboxId)?.delivery.status).toBe('delivered');
  });

  it('recovers a missed pending job and a due retry, and skips a future retry', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const missed = obligation({ commandKey: 'command_hardening_missed_01' });
    const due = withDelivery(obligation({ commandKey: 'command_hardening_due_01' }), {
      status: 'pending',
      attemptCount: 1,
      nextAttemptAt: timestampFromDate(new Date(NOW.getTime() - 1_000)),
      lastErrorCode: 'PROVIDER_TIMEOUT',
    });
    const waiting = withDelivery(obligation({ commandKey: 'command_hardening_waiting_01' }), {
      status: 'pending',
      attemptCount: 1,
      nextAttemptAt: timestampFromDate(new Date(NOW.getTime() + 60 * 60 * 1000)),
      lastErrorCode: 'PROVIDER_TIMEOUT',
    });
    store.put(missed);
    store.put(due);
    store.put(waiting);
    const result = await deliverDueOutboxBatch({ store, email, now: NOW });
    expect(result.sent).toBe(2);
    expect(store.docs.get(missed.outboxId)?.delivery.status).toBe('delivered');
    expect(store.docs.get(due.outboxId)?.delivery.status).toBe('delivered');
    expect(store.docs.get(waiting.outboxId)?.delivery.status).toBe('pending');
  });

  it('bounds recovery to the batch and scan limits', () => {
    const jobs = Array.from({ length: 200 }, (_, index) =>
      obligation({ commandKey: `command_hardening_bound_${String(index).padStart(3, '0')}` })
    );
    const preview = selectOutboxDeliveryCandidates(jobs, timestampFromDate(NOW), OUTBOX_DELIVERY_BATCH_LIMIT);
    expect(preview.selected).toHaveLength(OUTBOX_DELIVERY_BATCH_LIMIT);
    expect(preview.scanned).toBeLessThanOrEqual(OUTBOX_DELIVERY_MAX_SCAN);
    expect(preview.scanned).toBe(OUTBOX_DELIVERY_BATCH_LIMIT);
  });

  it('does not claim, write, or count attempts for email while delivery is off', async () => {
    const store = new MemoryOutboxDeliveryStore();
    store.emailDeliveryEnabled = false;
    const email = new FakeEmailAdapter();
    email.configured = false;
    const job = guestBooking('command_hardening_email_off_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    const before = JSON.stringify(store.docs.get(job.outboxId));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(
        await deliverOutboxObligation({
          store,
          email,
          outboxId: job.outboxId,
          now: new Date(NOW.getTime() + attempt * 60_000),
        })
      ).toBe('skipped');
    }
    expect(JSON.stringify(store.docs.get(job.outboxId))).toBe(before);
    expect(store.listCalls).toBe(0);
    expect(email.sendCalls).toBe(0);
    expect(store.docs.get(job.outboxId)?.delivery).toEqual({ status: 'pending' });
  });

  it('delivers in-app immediately while email stays idle', async () => {
    const store = new MemoryOutboxDeliveryStore();
    store.emailDeliveryEnabled = false;
    const email = new FakeEmailAdapter();
    email.configured = false;
    const emailJob = guestBooking('command_hardening_split_email');
    const inApp = obligation({ commandKey: 'command_hardening_split_in_app' });
    store.put(emailJob);
    store.put(inApp);
    expect(await deliverOutboxObligation({ store, email, outboxId: inApp.outboxId, now: NOW })).toBe('sent');
    expect(await deliverOutboxObligation({ store, email, outboxId: emailJob.outboxId, now: NOW })).toBe('skipped');
    expect(store.docs.get(inApp.outboxId)?.delivery.status).toBe('delivered');
    expect(store.docs.get(emailJob.outboxId)?.delivery).toEqual({ status: 'pending' });
  });

  it('does not report delivered when the provider is missing', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    email.configured = false;
    const job = guestBooking('command_hardening_provider_missing_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe('skipped');
    expect(store.docs.get(job.outboxId)?.delivery).toEqual({ status: 'pending' });
    expect(email.sendCalls).toBe(0);
  });

  it('keeps a dead letter terminal and visible exactly once without contact data', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    email.mode = 'permanent';
    const job = guestBooking('command_hardening_dead_letter_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe('dead_letter');
    expect(await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW })).toBe('skipped');
    const terminal = store.docs.get(job.outboxId);
    expect(terminal?.delivery.status).toBe('dead_letter');
    const signal = terminal ? projectOutboxDeadLetter(terminal) : undefined;
    expect(signal?.outboxId).toBe(job.outboxId);
    expect(signal?.errorCode).toBe('INVALID_DESTINATION');
    const encoded = JSON.stringify(signal);
    expect(encoded).not.toContain(GUEST_EMAIL);
    expect(encoded).not.toContain('@');
    expect(store.adminIssueWrites).toBe(0);
    expect(email.customerSends).toBe(0);
  });

  it('purges old terminal rows and keeps active or fresh rows', () => {
    const now = timestampFromDate(NOW);
    const oldDelivered = withDelivery(obligation({ commandKey: 'command_hardening_old_delivered' }), {
      status: 'delivered',
      deliveredAt: addCanonicalTimestampMs(now, -31 * 24 * 60 * 60 * 1000),
      attemptCount: 1,
    });
    const freshDelivered = withDelivery(obligation({ commandKey: 'command_hardening_fresh_delivered' }), {
      status: 'delivered',
      deliveredAt: addCanonicalTimestampMs(now, -1 * 24 * 60 * 60 * 1000),
      attemptCount: 1,
    });
    const oldDead = withDelivery(obligation({ commandKey: 'command_hardening_old_dead' }), {
      status: 'dead_letter',
      deadLetteredAt: addCanonicalTimestampMs(now, -91 * 24 * 60 * 60 * 1000),
      lastErrorCode: 'INVALID_DESTINATION',
      attemptCount: 1,
    });
    const freshDead = withDelivery(obligation({ commandKey: 'command_hardening_fresh_dead' }), {
      status: 'dead_letter',
      deadLetteredAt: now,
      lastErrorCode: 'INVALID_DESTINATION',
      attemptCount: 1,
    });
    const pending = obligation({ commandKey: 'command_hardening_pending_keep' });
    const leased = withDelivery(obligation({ commandKey: 'command_hardening_leased_keep' }), {
      status: 'leased',
      leasedAt: now,
      leaseExpiresAt: addCanonicalTimestampMs(now, OUTBOX_DELIVERY_LEASE_MS),
      leaseToken: 'retention-lease-01',
      attemptCount: 1,
    });
    expect(isOutboxRetentionEligible(oldDelivered, now)).toBe(true);
    expect(isOutboxRetentionEligible(freshDelivered, now)).toBe(false);
    expect(isOutboxRetentionEligible(oldDead, now)).toBe(true);
    expect(isOutboxRetentionEligible(freshDead, now)).toBe(false);
    expect(isOutboxRetentionEligible(pending, now)).toBe(false);
    expect(isOutboxRetentionEligible(leased, now)).toBe(false);
  });

  it('renders guest email in the explicit locale and falls back when locale is absent', async () => {
    const russian = new MemoryOutboxDeliveryStore();
    const russianEmail = new FakeEmailAdapter();
    const russianJob = obligation({
      commandKey: 'command_hardening_locale_ru',
      channel: 'email',
      templateId: 'guest_booking_pending',
      recipient: { kind: 'guest', id: 'booking_guest_delivery_01' },
      renderInputs: { bookingId: 'booking_guest_delivery_01', locale: 'ru' },
    });
    russian.put(russianJob);
    russian.rememberGuestEmail(russianJob, GUEST_EMAIL);
    await deliverOutboxObligation({ store: russian, email: russianEmail, outboxId: russianJob.outboxId, now: NOW });
    expect(russianEmail.messages[0]?.locale).toBe('ru');
    expect(russianEmail.messages[0]?.subject).toBe('Заявка на урок получена');
    expect(russianEmail.messages[0]?.text).not.toContain(GUEST_EMAIL);

    const english = new MemoryOutboxDeliveryStore();
    const englishEmail = new FakeEmailAdapter();
    const englishJob = obligation({
      commandKey: 'command_hardening_locale_en',
      channel: 'email',
      templateId: 'guest_booking_confirmed',
      recipient: { kind: 'guest', id: 'booking_guest_delivery_01' },
      renderInputs: { bookingId: 'booking_guest_delivery_01', locale: 'en' },
    });
    english.put(englishJob);
    english.rememberGuestEmail(englishJob, GUEST_EMAIL);
    await deliverOutboxObligation({ store: english, email: englishEmail, outboxId: englishJob.outboxId, now: NOW });
    expect(englishEmail.messages[0]?.locale).toBe('en');
    expect(englishEmail.messages[0]?.subject).toBe('Lesson booking confirmed');

    const stored = new MemoryOutboxDeliveryStore();
    const storedEmail = new FakeEmailAdapter();
    const storedJob = guestBooking('command_hardening_locale_stored', 'guest_booking_confirmed');
    stored.put(storedJob);
    stored.rememberGuestEmail(storedJob, GUEST_EMAIL);
    stored.rememberGuestLocale(storedJob, 'ru');
    await deliverOutboxObligation({ store: stored, email: storedEmail, outboxId: storedJob.outboxId, now: NOW });
    expect(storedEmail.messages[0]?.locale).toBe('ru');

    const fallback = new MemoryOutboxDeliveryStore();
    const fallbackEmail = new FakeEmailAdapter();
    const fallbackJob = guestBooking('command_hardening_locale_fallback', 'guest_course_enrollment_confirmed');
    fallback.put(fallbackJob);
    fallback.rememberGuestEmail(fallbackJob, '+77011234567');
    await deliverOutboxObligation({
      store: fallback,
      email: fallbackEmail,
      outboxId: fallbackJob.outboxId,
      now: NOW,
    });
    expect(fallbackEmail.messages[0]?.locale).toBe('bilingual');
    expect(fallbackEmail.messages[0]?.text).toContain('Запись на курс подтверждена');
    expect(fallbackEmail.messages[0]?.text).toContain('Course enrollment confirmed');
  });

  it('retries a crashed provider accept with the same outbox idempotency key', async () => {
    const store = new MemoryOutboxDeliveryStore();
    const email = new FakeEmailAdapter();
    const job = guestBooking('command_hardening_idempotency_01');
    store.put(job);
    store.rememberGuestEmail(job, GUEST_EMAIL);
    store.failNextFinish = true;
    await deliverOutboxObligation({ store, email, outboxId: job.outboxId, now: NOW });
    await deliverOutboxObligation({
      store,
      email,
      outboxId: job.outboxId,
      now: new Date(NOW.getTime() + OUTBOX_DELIVERY_LEASE_MS + 1_000),
    });
    expect(email.messages.map((message) => message.idempotencyKey)).toEqual([job.outboxId, job.outboxId]);
    expect(email.customerSends).toBe(1);
  });

  it('logs only delivery classification fields', () => {
    const record = outboxDeliveryLogRecord({
      outboxId: 'domain_outbox_log_01',
      templateId: 'guest_booking_pending',
      channel: 'email',
      attemptCount: 1,
      resultClass: 'sent',
    });
    expect(Object.keys(record).sort()).toEqual(
      ['attemptCount', 'channel', 'event', 'outboxId', 'resultClass', 'templateId'].sort()
    );
    expect(JSON.stringify(record)).not.toContain('@');
    expect(JSON.stringify(record)).not.toContain(GUEST_EMAIL);
  });
});
