import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  BookingIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  paymentIdFromBookingId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  canAccountViewLessonBookingFinancial,
  canAccountViewLessonBookingService,
  type LessonBookingReadAuthorizationContext,
} from './lessonBookingReadModels';

const accountId = AccountIdSchema.parse('account_read_model_01');
const otherAccountId = AccountIdSchema.parse('account_read_model_02');
const participantId = ParticipantIdSchema.parse('participant_read_model_01');
const bookingId = BookingIdSchema.parse('booking_read_model_01');
const paymentId = paymentIdFromBookingId(bookingId);
const instructorId = InstructorIdSchema.parse('instructor_read_model_01');
const decidedAt = timestampFromDate(new Date('2026-01-01T10:00:00.000Z'));

function seedBooking(payerAccountId?: typeof accountId) {
  return {
    bookingId,
    attribution: {
      bookingOrigin: 'account' as const,
      bookedBy: { kind: 'account' as const, accountId },
    },
    party: {
      kind: 'individual' as const,
      participantIds: [participantId],
    },
    occurrence: {
      occurrenceId: OccurrenceIdSchema.parse('occurrence_read_model_01'),
      instructorId,
      interval: {
        startsAt: timestampFromDate(new Date('2026-06-15T09:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-06-15T10:00:00.000Z')),
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [participantId] },
    },
    lifecycle: { status: 'confirmed' as const },
    paymentId,
    ...(payerAccountId ? { payerAccountId } : {}),
    revision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    audit: {
      createdByCommandId: 'command_seed',
      lastChangedByCommandId: 'command_seed',
      correlationId: 'correlation_read_model_01',
    },
  };
}

function authContext(): LessonBookingReadAuthorizationContext {
  const participantManagementId = ParticipantManagementIdSchema.parse('pm_read_model_01');
  return {
    account: {
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId: 'correlation_read_model_01',
      },
    },
    participantManagement: [
      {
        participantManagementId,
        participantId,
        accountId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed',
          lastChangedByCommandId: 'command_seed',
          correlationId: 'correlation_read_model_01',
        },
      },
    ],
    participants: [
      {
        participantId,
        displayName: 'Student',
        age: { kind: 'age_years', years: 20 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: {
          kind: 'managed',
          participantManagementId,
        },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: decidedAt,
        updatedAt: decidedAt,
        audit: {
          createdByCommandId: 'command_seed',
          lastChangedByCommandId: 'command_seed',
          correlationId: 'correlation_read_model_01',
        },
      },
    ],
  };
}

describe('lesson booking read authorization', () => {
  it('allows service visibility through participant management', () => {
    const booking = seedBooking(accountId);
    expect(canAccountViewLessonBookingService(authContext(), accountId, booking as never)).toBe(
      true
    );
    expect(
      canAccountViewLessonBookingService(authContext(), otherAccountId, booking as never)
    ).toBe(false);
  });

  it('exposes financial visibility only to payer account', () => {
    const booking = seedBooking(accountId);
    const payment = {
      paymentId,
      subjectType: 'booking' as const,
      subjectId: bookingId,
      currency: 'KZT' as const,
      originalPrice: 10000,
      price: 10000,
      paidAmount: 10000,
      refundedAmount: 0,
      retainedAmount: 10000,
      settledAmount: 10000,
      writtenOffAmount: 0,
      outstandingAmount: 0,
      paymentStatus: 'paid' as const,
      payerAccountId: accountId,
      incrementalRequirements: [],
      eventRevision: 1,
      revision: 1,
      createdAt: decidedAt,
      updatedAt: decidedAt,
      audit: {
        createdByCommandId: 'command_seed',
        lastChangedByCommandId: 'command_seed',
        correlationId: 'correlation_read_model_01',
      },
    };

    expect(
      canAccountViewLessonBookingFinancial(accountId, booking as never, payment as never)
    ).toBe(true);
    expect(
      canAccountViewLessonBookingFinancial(otherAccountId, booking as never, payment as never)
    ).toBe(false);
  });
});
