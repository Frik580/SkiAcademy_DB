import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  AccountId,
  CanonicalTimestamp,
  CommandId,
  CommandKind,
  CorrelationId,
  DataScope,
  GuestSubjectId,
  PaymentId,
  PaymentStatus,
} from '@ski-academy/shared-domain';

/**
 * Non-authoritative conversion facts for an already-committed canonical command.
 *
 * These events are not a source of truth for bookings, enrollments, or money.
 * Canonical Payment / Booking / CourseEnrollment documents remain authoritative.
 * Emission is best-effort and happens only after the command transaction commits.
 * Idempotent replays do not emit again. TEST-scope commands do not emit.
 *
 * `auth_*` is intentionally absent: Firebase Auth outcomes are not canonical
 * command results. `complete_booking` (lesson completion) is not `booking_complete`.
 *
 * Dev contract: docs/analytics/conversion-analytics-events.md
 */
export const CONVERSION_ANALYTICS_EVENT_NAMES = ['booking_complete', 'paid'] as const;

export type ConversionAnalyticsEventName = (typeof CONVERSION_ANALYTICS_EVENT_NAMES)[number];

export const CONVERSION_ANALYTICS_SOURCE = 'canonical_command' as const;

export interface ConversionAnalyticsEventBase {
  readonly source: typeof CONVERSION_ANALYTICS_SOURCE;
  readonly occurredAt: string;
  readonly commandKind: CommandKind;
  readonly commandId: CommandId;
  readonly correlationId: CorrelationId;
  readonly subjectType: 'booking' | 'course_enrollment';
  readonly subjectId: string;
  readonly paymentId: PaymentId;
  readonly currency: 'KZT';
  /** Service price in minor units (tiyn) on the committed projection. Snapshot only. */
  readonly priceMinor: number;
  /** Amount paid in minor units (tiyn) on the committed projection. Snapshot only. */
  readonly paidAmountMinor: number;
  readonly paymentStatus: PaymentStatus;
  readonly accountId?: AccountId;
  readonly guestSubjectId?: GuestSubjectId;
}

export interface BookingCompleteAnalyticsEvent extends ConversionAnalyticsEventBase {
  readonly name: 'booking_complete';
  /**
   * Lifecycle written by this command. `pending` is a guest reservation.
   * `confirmed` is a committed lesson booking or non-guest course enrollment.
   */
  readonly subjectLifecycle: 'pending' | 'confirmed';
  readonly dataScope: 'live';
}

export interface PaidAnalyticsEvent extends ConversionAnalyticsEventBase {
  readonly name: 'paid';
  readonly dataScope: 'live';
}

export type ConversionAnalyticsEvent = BookingCompleteAnalyticsEvent | PaidAnalyticsEvent;

export type StagedConversionAnalyticsEvent =
  Omit<BookingCompleteAnalyticsEvent, 'dataScope'> | Omit<PaidAnalyticsEvent, 'dataScope'>;

export interface NewCommercialSubjectConversionInput {
  readonly commandKind: CommandKind;
  readonly commandId: CommandId;
  readonly correlationId: CorrelationId;
  readonly occurredAt: CanonicalTimestamp;
  readonly subjectType: 'booking' | 'course_enrollment';
  readonly subjectId: string;
  readonly paymentId: PaymentId;
  readonly priceMinor: number;
  readonly paidAmountMinor: number;
  readonly paymentStatus: PaymentStatus;
  readonly subjectLifecycle: 'pending' | 'confirmed';
  readonly accountId?: AccountId;
  readonly guestSubjectId?: GuestSubjectId;
}

export interface PaidTransitionConversionInput {
  readonly commandKind: CommandKind;
  readonly commandId: CommandId;
  readonly correlationId: CorrelationId;
  readonly occurredAt: CanonicalTimestamp;
  readonly subjectType: 'booking' | 'course_enrollment';
  readonly subjectId: string;
  readonly paymentId: PaymentId;
  readonly priceMinor: number;
  readonly paidAmountMinor: number;
  readonly previousPaymentStatus: PaymentStatus;
  readonly paymentStatus: PaymentStatus;
  readonly accountId?: AccountId;
  readonly guestSubjectId?: GuestSubjectId;
}

const draftStorage = new AsyncLocalStorage<StagedConversionAnalyticsEvent[]>();

let activeSink: ConversionAnalyticsSink = {
  emit(event) {
    console.info('conversion_analytics', event);
  },
};

export interface ConversionAnalyticsSink {
  emit(event: ConversionAnalyticsEvent): void;
}

export function canonicalTimestampToIso(timestamp: CanonicalTimestamp): string {
  return new Date(timestamp.seconds * 1000 + timestamp.nanoseconds / 1_000_000).toISOString();
}

function optionalIdentity(input: {
  readonly accountId?: AccountId;
  readonly guestSubjectId?: GuestSubjectId;
}): Pick<ConversionAnalyticsEventBase, 'accountId' | 'guestSubjectId'> {
  return {
    ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
    ...(input.guestSubjectId === undefined ? {} : { guestSubjectId: input.guestSubjectId }),
  };
}

function eventBase(
  input: NewCommercialSubjectConversionInput | PaidTransitionConversionInput
): ConversionAnalyticsEventBase {
  return {
    source: CONVERSION_ANALYTICS_SOURCE,
    occurredAt: canonicalTimestampToIso(input.occurredAt),
    commandKind: input.commandKind,
    commandId: input.commandId,
    correlationId: input.correlationId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    paymentId: input.paymentId,
    currency: 'KZT',
    priceMinor: input.priceMinor,
    paidAmountMinor: input.paidAmountMinor,
    paymentStatus: input.paymentStatus,
    ...optionalIdentity(input),
  };
}

/** New booking or course enrollment committed by this command. Also `paid` when the new payment is already paid. */
export function conversionEventsForNewCommercialSubject(
  input: NewCommercialSubjectConversionInput
): StagedConversionAnalyticsEvent[] {
  const base = eventBase(input);
  const events: StagedConversionAnalyticsEvent[] = [
    {
      ...base,
      name: 'booking_complete',
      subjectLifecycle: input.subjectLifecycle,
    },
  ];
  if (input.paymentStatus === 'paid') {
    events.push({
      ...base,
      name: 'paid',
    });
  }
  return events;
}

/** First transition of an existing payment projection to `paid`. Already-paid outcomes emit nothing. */
export function conversionEventsForPaidTransition(
  input: PaidTransitionConversionInput
): StagedConversionAnalyticsEvent[] {
  if (input.previousPaymentStatus === 'paid' || input.paymentStatus !== 'paid') {
    return [];
  }
  return [
    {
      ...eventBase(input),
      name: 'paid',
    },
  ];
}

export function stageConversionAnalyticsEvents(
  events: readonly StagedConversionAnalyticsEvent[]
): void {
  if (events.length === 0) {
    return;
  }
  const draft = draftStorage.getStore();
  if (draft === undefined) {
    return;
  }
  draft.push(...events);
}

export function runWithConversionAnalyticsDraft<T>(fn: () => Promise<T>): Promise<T> {
  return draftStorage.run([], fn);
}

export function takeStagedConversionAnalyticsEvents(): readonly StagedConversionAnalyticsEvent[] {
  const draft = draftStorage.getStore();
  return draft === undefined ? [] : draft.slice();
}

export function selectCommittedConversionAnalyticsEvents(input: {
  readonly dataScope: DataScope;
  readonly replayed: boolean;
  readonly status: 'success' | 'error';
  readonly staged: readonly StagedConversionAnalyticsEvent[];
}): readonly ConversionAnalyticsEvent[] {
  if (input.replayed || input.status !== 'success' || input.dataScope !== 'live') {
    return [];
  }
  return input.staged.map((event) => ({ ...event, dataScope: 'live' }));
}

export function emitConversionAnalyticsBestEffort(
  events: readonly ConversionAnalyticsEvent[]
): void {
  for (const event of events) {
    try {
      activeSink.emit(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      console.warn('conversion_analytics_emit_failed', {
        name: event.name,
        commandKind: event.commandKind,
        commandId: event.commandId,
        subjectId: event.subjectId,
        message,
      });
    }
  }
}

export async function withConversionAnalyticsSink<T>(
  sink: ConversionAnalyticsSink,
  fn: () => Promise<T>
): Promise<T> {
  const previous = activeSink;
  activeSink = sink;
  try {
    return await fn();
  } finally {
    activeSink = previous;
  }
}
