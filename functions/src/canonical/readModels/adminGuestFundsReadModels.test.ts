import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  AccountSchema,
  BookingIdSchema,
  BookingSchema,
  CourseEnrollmentIdSchema,
  CourseEnrollmentSchema,
  CourseIdSchema,
  CourseSchema,
  GuestSubjectIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantSchema,
  PaymentSchema,
  paymentIdFromBookingId,
  paymentIdFromCourseEnrollmentId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  canonicalCourseDeliveryFixtures,
  canonicalPaymentWalletAuditFixtures,
} from '@ski-academy/shared-domain/testing';
import { queryAdminFinanceReadModels } from './adminFinanceReadModels';

const adminId = AccountIdSchema.parse('account_admin_guest_funds_01');
const linkedAccountId = AccountIdSchema.parse('account_linked_guest_funds_01');
const actor = { kind: 'administrator' as const, accountId: adminId };
const now = timestampFromDate(new Date('2026-08-10T12:00:00.000Z'));
const instructorId = 'instructor_guest_funds_01';

function nestedValue(data: Record<string, unknown>, field: string): unknown {
  return field
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[key]
          : undefined,
      data
    );
}

function fakeFirestore(seed: Record<string, Record<string, unknown>>): Firestore {
  const snapshot = (entries: Array<[string, Record<string, unknown>]>) => ({
    empty: entries.length === 0,
    docs: entries.map(([path, data]) => ({
      id: path.split('/').at(-1)!,
      data: () => data,
    })),
  });
  const collection = (path: string) => {
    const baseEntries = () =>
      Object.entries(seed).filter(([key]) => {
        if (!key.startsWith(`${path}/`)) return false;
        return key.slice(path.length + 1).split('/').length === 1;
      });
    const makeQuery = (
      filters: Array<{ field: string; op: string; value: unknown }> = [],
      orders: Array<{ field: string; direction: 'asc' | 'desc' }> = [],
      cursor?: readonly unknown[],
      max?: number
    ): Record<string, unknown> => {
      const api = {
        where: (field: string, op: string, value: unknown) =>
          makeQuery([...filters, { field, op, value }], orders, cursor, max),
        orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') =>
          makeQuery(filters, [...orders, { field, direction }], cursor, max),
        startAfter: (...values: unknown[]) => makeQuery(filters, orders, values, max),
        limit: (count: number) => makeQuery(filters, orders, cursor, count),
        get: async () => {
          let entries = baseEntries().filter(([, data]) =>
            filters.every(({ field, op, value }) => {
              const actual = nestedValue(data, field);
              if (op === '==') return Object.is(actual, value);
              return false;
            })
          );
          entries.sort((left, right) => {
            for (const order of orders) {
              const a = nestedValue(left[1], order.field) as number | string;
              const b = nestedValue(right[1], order.field) as number | string;
              if (a === b) continue;
              const compared = a < b ? -1 : 1;
              return order.direction === 'desc' ? -compared : compared;
            }
            return 0;
          });
          if (cursor) {
            const index = entries.findIndex(([, data]) =>
              orders.every((order, orderIndex) =>
                Object.is(nestedValue(data, order.field), cursor[orderIndex])
              )
            );
            if (index >= 0) entries = entries.slice(index + 1);
          }
          return snapshot(max === undefined ? entries : entries.slice(0, max));
        },
      };
      return api as unknown as Record<string, unknown>;
    };
    return {
      doc: (id: string) => ({
        get: async () => {
          const data = seed[`${path}/${id}`];
          return { exists: data !== undefined, data: () => data };
        },
      }),
      ...makeQuery(),
    };
  };
  return { collection } as unknown as Firestore;
}

function accountDoc(accountId: typeof adminId | typeof linkedAccountId, name: string) {
  return {
    ...AccountSchema.parse({
      accountId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: now,
      updatedAt: now,
      audit: {
        createdByCommandId: 'command_guest_funds_seed',
        lastChangedByCommandId: 'command_guest_funds_seed',
        correlationId: 'correlation_guest_funds_seed',
      },
    }),
    role: accountId === adminId ? 'admin' : 'user',
    displayName: name,
    email: `${accountId}@example.com`,
  };
}

function participantDoc(
  participantId: ReturnType<typeof ParticipantIdSchema.parse>,
  name: string,
  management: 'unmanaged_guest' | 'managed'
) {
  return ParticipantSchema.parse({
    participantId,
    displayName: name,
    age: { kind: 'age_years', years: 30 },
    skillLevel: 'intermediate',
    discipline: 'ski',
    management:
      management === 'unmanaged_guest'
        ? { kind: 'unmanaged_guest' }
        : {
            kind: 'managed',
            participantManagementId: `participant_management_${participantId}`,
          },
    lifecycle: { status: 'active' },
    revision: 1,
    createdAt: now,
    updatedAt: now,
    audit: {
      createdByCommandId: 'command_guest_funds_seed',
      lastChangedByCommandId: 'command_guest_funds_seed',
      correlationId: 'correlation_guest_funds_seed',
    },
  });
}

function guestBooking(input: {
  id: string;
  participantId: ReturnType<typeof ParticipantIdSchema.parse>;
  updatedDay: number;
  payerAccountId?: typeof linkedAccountId;
}) {
  const bookingId = BookingIdSchema.parse(input.id);
  const paymentId = paymentIdFromBookingId(bookingId);
  const updatedAt = timestampFromDate(new Date(`2026-08-${String(input.updatedDay).padStart(2, '0')}T10:00:00.000Z`));
  return BookingSchema.parse({
    bookingId,
    attribution: {
      bookingOrigin: 'guest',
      bookedBy: {
        kind: 'guest',
        guestSubjectId: GuestSubjectIdSchema.parse(`guest_subject_${input.id}`),
      },
    },
    party: { kind: 'individual', participantIds: [input.participantId] },
    occurrence: {
      occurrenceId: OccurrenceIdSchema.parse(`occurrence_${input.id}`),
      instructorId,
      interval: {
        startsAt: timestampFromDate(new Date('2026-09-01T09:00:00.000Z')),
        endsAt: timestampFromDate(new Date('2026-09-01T10:00:00.000Z')),
      },
      timeZone: 'Asia/Almaty',
      scheduleRevision: 1,
      serviceParty: { participantIds: [input.participantId] },
    },
    lifecycle: { status: 'confirmed' },
    paymentId,
    ...(input.payerAccountId ? { payerAccountId: input.payerAccountId } : {}),
    revision: 1,
    createdAt: updatedAt,
    updatedAt,
    audit: {
      createdByCommandId: 'command_guest_funds_seed',
      lastChangedByCommandId: 'command_guest_funds_seed',
      correlationId: 'correlation_guest_funds_seed',
    },
  });
}

function bookingPayment(
  booking: ReturnType<typeof guestBooking>,
  amounts: {
    price: number;
    paidAmount: number;
    outstandingAmount: number;
    paymentStatus: 'unpaid' | 'partially_paid' | 'paid' | 'refunded' | 'partially_refunded';
    payerAccountId?: typeof linkedAccountId;
  }
) {
  const { payerAccountId: _omitPayer, ...basePayment } =
    canonicalPaymentWalletAuditFixtures.underpaidPayment;
  return PaymentSchema.parse({
    ...basePayment,
    paymentId: booking.paymentId,
    subjectType: 'booking',
    subjectId: booking.bookingId,
    currency: 'KZT',
    originalPrice: amounts.price,
    price: amounts.price,
    paidAmount: amounts.paidAmount,
    refundedAmount: 0,
    retainedAmount: amounts.paidAmount,
    settledAmount: amounts.paidAmount,
    writtenOffAmount: 0,
    outstandingAmount: amounts.outstandingAmount,
    paymentStatus: amounts.paymentStatus,
    incrementalRequirements: [],
    ...(amounts.payerAccountId ? { payerAccountId: amounts.payerAccountId } : {}),
    revision: 1,
    eventRevision: 0,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  });
}

function guestEnrollment(input: {
  id: string;
  participantId: ReturnType<typeof ParticipantIdSchema.parse>;
  updatedDay: number;
  linked?: boolean;
  payerAccountId?: typeof linkedAccountId;
}) {
  const enrollmentId = CourseEnrollmentIdSchema.parse(input.id);
  const updatedAt = timestampFromDate(new Date(`2026-08-${String(input.updatedDay).padStart(2, '0')}T10:00:00.000Z`));
  return CourseEnrollmentSchema.parse({
    ...canonicalCourseDeliveryFixtures.confirmedEnrollment,
    enrollmentId,
    participantId: input.participantId,
    courseId: CourseIdSchema.parse('course_guest_funds_01'),
    paymentId: paymentIdFromCourseEnrollmentId(enrollmentId),
    attribution: {
      bookingOrigin: 'guest',
      bookedBy: {
        kind: 'guest',
        guestSubjectId: GuestSubjectIdSchema.parse(`guest_subject_${input.id}`),
      },
    },
    lifecycle: { status: 'confirmed' },
    attendanceSummary: undefined,
    ...(input.payerAccountId ? { payerAccountId: input.payerAccountId } : { payerAccountId: undefined }),
    ...(input.linked
      ? {
          guestAccountLink: {
            linkedAccountId,
            linkedParticipantId: input.participantId,
            linkedAt: updatedAt,
          },
        }
      : {}),
    updatedAt,
    createdAt: updatedAt,
  });
}

function enrollmentPayment(
  enrollment: ReturnType<typeof guestEnrollment>,
  amounts: {
    price: number;
    paidAmount: number;
    outstandingAmount: number;
    paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
    payerAccountId?: typeof linkedAccountId;
  }
) {
  const { payerAccountId: _omitPayer, ...basePayment } =
    canonicalPaymentWalletAuditFixtures.underpaidPayment;
  return PaymentSchema.parse({
    ...basePayment,
    paymentId: enrollment.paymentId,
    subjectType: 'course_enrollment',
    subjectId: enrollment.enrollmentId,
    currency: 'KZT',
    originalPrice: amounts.price,
    price: amounts.price,
    paidAmount: amounts.paidAmount,
    refundedAmount: 0,
    retainedAmount: amounts.paidAmount,
    settledAmount: amounts.paidAmount,
    writtenOffAmount: 0,
    outstandingAmount: amounts.outstandingAmount,
    paymentStatus: amounts.paymentStatus,
    incrementalRequirements: [],
    ...(amounts.payerAccountId ? { payerAccountId: amounts.payerAccountId } : {}),
    revision: 1,
    eventRevision: 0,
    createdAt: enrollment.createdAt,
    updatedAt: enrollment.updatedAt,
  });
}

function courseDoc() {
  return CourseSchema.parse({
    ...canonicalCourseDeliveryFixtures.course,
    courseId: CourseIdSchema.parse('course_guest_funds_01'),
    title: 'Guest Alpine Camp',
  });
}

describe('Admin guest funds discovery read model', () => {
  it('discovers unlinked lesson guest with factual payment amounts and link state', async () => {
    const participantId = ParticipantIdSchema.parse('participant_guest_funds_unlinked');
    const booking = guestBooking({ id: 'booking_guest_funds_unlinked', participantId, updatedDay: 9 });
    const payment = bookingPayment(booking, {
      price: 60_000,
      paidAmount: 0,
      outstandingAmount: 60_000,
      paymentStatus: 'unpaid',
    });
    const firestore = fakeFirestore({
      [`users/${adminId}`]: accountDoc(adminId, 'Admin'),
      [`participants/${participantId}`]: participantDoc(participantId, 'Unlinked Guest', 'unmanaged_guest'),
      [`bookings/${booking.bookingId}`]: booking,
      [`payments/${payment.paymentId}`]: payment,
    });

    const result = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_guest_funds',
    });
    expect(result.scope).toBe('admin_guest_funds');
    if (result.scope !== 'admin_guest_funds') return;
    expect(result.item.items).toHaveLength(1);
    expect(result.item.items[0]).toMatchObject({
      origin: 'guest',
      linkState: 'unlinked',
      guestDisplayName: 'Unlinked Guest',
      paymentStatus: 'unpaid',
      price: 60_000,
      paidAmount: 0,
      outstandingAmount: 60_000,
      currency: 'KZT',
      paymentId: payment.paymentId,
    });
    expect(result.item.items[0]?.payer).toBeUndefined();
  });

  it('keeps linked lesson with payer discoverable and factual linked state', async () => {
    const participantId = ParticipantIdSchema.parse('participant_guest_funds_linked');
    const booking = guestBooking({
      id: 'booking_guest_funds_linked',
      participantId,
      updatedDay: 8,
      payerAccountId: linkedAccountId,
    });
    const payment = bookingPayment(booking, {
      price: 50_000,
      paidAmount: 50_000,
      outstandingAmount: 0,
      paymentStatus: 'paid',
      payerAccountId: linkedAccountId,
    });
    const firestore = fakeFirestore({
      [`users/${adminId}`]: accountDoc(adminId, 'Admin'),
      [`users/${linkedAccountId}`]: accountDoc(linkedAccountId, 'Linked Account'),
      [`participants/${participantId}`]: participantDoc(participantId, 'Linked Guest', 'managed'),
      [`bookings/${booking.bookingId}`]: booking,
      [`payments/${payment.paymentId}`]: payment,
    });

    const result = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_guest_funds',
    });
    expect(result.scope).toBe('admin_guest_funds');
    if (result.scope !== 'admin_guest_funds') return;
    expect(result.item.items[0]).toMatchObject({
      linkState: 'linked',
      paymentStatus: 'paid',
      payer: { accountId: linkedAccountId, displayName: 'Linked Account' },
      price: 50_000,
      paidAmount: 50_000,
      outstandingAmount: 0,
    });
  });

  it('shows historical linked lesson without payer as linked with no wallet payer', async () => {
    const participantId = ParticipantIdSchema.parse('participant_guest_funds_legacy');
    const booking = guestBooking({
      id: 'booking_guest_funds_legacy',
      participantId,
      updatedDay: 7,
    });
    const payment = bookingPayment(booking, {
      price: 40_000,
      paidAmount: 40_000,
      outstandingAmount: 0,
      paymentStatus: 'paid',
    });
    const firestore = fakeFirestore({
      [`users/${adminId}`]: accountDoc(adminId, 'Admin'),
      [`participants/${participantId}`]: participantDoc(participantId, 'Legacy Linked', 'managed'),
      [`bookings/${booking.bookingId}`]: booking,
      [`payments/${payment.paymentId}`]: payment,
    });

    const result = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_guest_funds',
    });
    expect(result.scope).toBe('admin_guest_funds');
    if (result.scope !== 'admin_guest_funds') return;
    expect(result.item.items[0]).toMatchObject({
      linkState: 'linked',
      paymentId: payment.paymentId,
    });
    expect(result.item.items[0]?.payer).toBeUndefined();
  });

  it('presents partial payment without inventing lifecycle status', async () => {
    const participantId = ParticipantIdSchema.parse('participant_guest_funds_partial');
    const booking = guestBooking({
      id: 'booking_guest_funds_partial',
      participantId,
      updatedDay: 6,
    });
    const payment = bookingPayment(booking, {
      price: 60_000,
      paidAmount: 20_000,
      outstandingAmount: 40_000,
      paymentStatus: 'partially_paid',
    });
    const firestore = fakeFirestore({
      [`users/${adminId}`]: accountDoc(adminId, 'Admin'),
      [`participants/${participantId}`]: participantDoc(participantId, 'Partial Guest', 'unmanaged_guest'),
      [`bookings/${booking.bookingId}`]: booking,
      [`payments/${payment.paymentId}`]: payment,
    });

    const result = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_guest_funds',
      filter: 'partially_paid',
    });
    expect(result.scope).toBe('admin_guest_funds');
    if (result.scope !== 'admin_guest_funds') return;
    expect(result.item.items).toHaveLength(1);
    expect(result.item.items[0]).toMatchObject({
      paymentStatus: 'partially_paid',
      price: 60_000,
      paidAmount: 20_000,
      outstandingAmount: 40_000,
    });
  });

  it('discovers course guest enrollment without lifecycle mutations', async () => {
    const participantId = ParticipantIdSchema.parse('participant_guest_funds_course');
    const enrollment = guestEnrollment({
      id: 'enrollment_guest_funds_01',
      participantId,
      updatedDay: 5,
    });
    const payment = enrollmentPayment(enrollment, {
      price: 90_000,
      paidAmount: 0,
      outstandingAmount: 90_000,
      paymentStatus: 'unpaid',
    });
    const firestore = fakeFirestore({
      [`users/${adminId}`]: accountDoc(adminId, 'Admin'),
      [`participants/${participantId}`]: participantDoc(participantId, 'Course Guest', 'unmanaged_guest'),
      [`courses/course_guest_funds_01`]: courseDoc(),
      [`course_enrollments/${enrollment.enrollmentId}`]: enrollment,
      [`payments/${payment.paymentId}`]: payment,
    });

    const result = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_guest_funds',
    });
    expect(result.scope).toBe('admin_guest_funds');
    if (result.scope !== 'admin_guest_funds') return;
    expect(result.item.items[0]).toMatchObject({
      linkState: 'unlinked',
      service: {
        subjectKind: 'course_enrollment',
        courseTitle: 'Guest Alpine Camp',
      },
      outstandingAmount: 90_000,
    });
  });

  it('paginates guest funds with stable cursors and no duplicates', async () => {
    const p1 = ParticipantIdSchema.parse('participant_guest_funds_page_1');
    const p2 = ParticipantIdSchema.parse('participant_guest_funds_page_2');
    const p3 = ParticipantIdSchema.parse('participant_guest_funds_page_3');
    const b1 = guestBooking({ id: 'booking_guest_funds_page_1', participantId: p1, updatedDay: 10 });
    const b2 = guestBooking({ id: 'booking_guest_funds_page_2', participantId: p2, updatedDay: 9 });
    const b3 = guestBooking({ id: 'booking_guest_funds_page_3', participantId: p3, updatedDay: 8 });
    const payments = [b1, b2, b3].map((booking) =>
      bookingPayment(booking, {
        price: 10_000,
        paidAmount: 0,
        outstandingAmount: 10_000,
        paymentStatus: 'unpaid',
      })
    );
    const firestore = fakeFirestore({
      [`users/${adminId}`]: accountDoc(adminId, 'Admin'),
      [`participants/${p1}`]: participantDoc(p1, 'Page 1', 'unmanaged_guest'),
      [`participants/${p2}`]: participantDoc(p2, 'Page 2', 'unmanaged_guest'),
      [`participants/${p3}`]: participantDoc(p3, 'Page 3', 'unmanaged_guest'),
      [`bookings/${b1.bookingId}`]: b1,
      [`bookings/${b2.bookingId}`]: b2,
      [`bookings/${b3.bookingId}`]: b3,
      [`payments/${payments[0]!.paymentId}`]: payments[0]!,
      [`payments/${payments[1]!.paymentId}`]: payments[1]!,
      [`payments/${payments[2]!.paymentId}`]: payments[2]!,
    });

    const first = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_guest_funds',
      pageSize: 2,
    });
    expect(first.scope).toBe('admin_guest_funds');
    if (first.scope !== 'admin_guest_funds') return;
    expect(first.item.items.map((row) => row.rowId)).toEqual([
      'booking:booking_guest_funds_page_1',
      'booking:booking_guest_funds_page_2',
    ]);
    expect(first.item.hasMore).toBe(true);
    expect(first.item.nextCursor).toBeTruthy();

    const second = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_guest_funds',
      pageSize: 2,
      cursor: first.item.nextCursor,
    });
    expect(second.scope).toBe('admin_guest_funds');
    if (second.scope !== 'admin_guest_funds') return;
    expect(second.item.items.map((row) => row.rowId)).toEqual([
      'booking:booking_guest_funds_page_3',
    ]);
    expect(second.item.hasMore).toBe(false);
  });

  it('filters outstanding guest funds server-side', async () => {
    const unpaidParticipant = ParticipantIdSchema.parse('participant_guest_funds_out_unpaid');
    const paidParticipant = ParticipantIdSchema.parse('participant_guest_funds_out_paid');
    const unpaid = guestBooking({
      id: 'booking_guest_funds_out_unpaid',
      participantId: unpaidParticipant,
      updatedDay: 10,
    });
    const paid = guestBooking({
      id: 'booking_guest_funds_out_paid',
      participantId: paidParticipant,
      updatedDay: 9,
    });
    const firestore = fakeFirestore({
      [`users/${adminId}`]: accountDoc(adminId, 'Admin'),
      [`participants/${unpaidParticipant}`]: participantDoc(
        unpaidParticipant,
        'Outstanding Guest',
        'unmanaged_guest'
      ),
      [`participants/${paidParticipant}`]: participantDoc(
        paidParticipant,
        'Settled Guest',
        'unmanaged_guest'
      ),
      [`bookings/${unpaid.bookingId}`]: unpaid,
      [`bookings/${paid.bookingId}`]: paid,
      [`payments/${unpaid.paymentId}`]: bookingPayment(unpaid, {
        price: 30_000,
        paidAmount: 5_000,
        outstandingAmount: 25_000,
        paymentStatus: 'partially_paid',
      }),
      [`payments/${paid.paymentId}`]: bookingPayment(paid, {
        price: 30_000,
        paidAmount: 30_000,
        outstandingAmount: 0,
        paymentStatus: 'paid',
      }),
    });

    const result = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_guest_funds',
      filter: 'outstanding',
    });
    expect(result.scope).toBe('admin_guest_funds');
    if (result.scope !== 'admin_guest_funds') return;
    expect(result.item.items).toHaveLength(1);
    expect(result.item.items[0]?.rowId).toBe('booking:booking_guest_funds_out_unpaid');
    expect(result.item.items[0]?.outstandingAmount).toBe(25_000);
  });

  it('skips lesson rows when participant identity docs are missing instead of inventing linked', async () => {
    const participantId = ParticipantIdSchema.parse('participant_guest_funds_missing');
    const booking = guestBooking({
      id: 'booking_guest_funds_missing',
      participantId,
      updatedDay: 4,
    });
    const payment = bookingPayment(booking, {
      price: 10_000,
      paidAmount: 0,
      outstandingAmount: 10_000,
      paymentStatus: 'unpaid',
    });
    const firestore = fakeFirestore({
      [`users/${adminId}`]: accountDoc(adminId, 'Admin'),
      [`bookings/${booking.bookingId}`]: booking,
      [`payments/${payment.paymentId}`]: payment,
    });

    const result = await queryAdminFinanceReadModels(firestore, actor, {
      scope: 'admin_guest_funds',
    });
    expect(result.scope).toBe('admin_guest_funds');
    if (result.scope !== 'admin_guest_funds') return;
    expect(result.item.items).toHaveLength(0);
  });
});
