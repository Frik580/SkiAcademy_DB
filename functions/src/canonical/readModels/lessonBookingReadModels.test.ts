import { describe, expect, it } from 'vitest';
import {
  AccountSchema,
  AccountIdSchema,
  BookingSchema,
  BookingIdSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  PaymentSchema,
  createOpenAdminIssue,
  paymentIdFromBookingId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  buildAdminLessonBookingReadModel,
  canAccountViewLessonBookingFinancial,
  canAccountViewLessonBookingService,
  queryLessonBookingReadModels,
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

function createAdminReadFirestore(input: {
  readonly bookings: readonly { readonly id: string; readonly data: Record<string, unknown> }[];
  readonly documents: Readonly<Record<string, Readonly<Record<string, Record<string, unknown>>>>>;
}): Firestore {
  const readNested = (record: Record<string, unknown>, path: string): unknown =>
    path
      .split('.')
      .reduce<unknown>(
        (value, part) =>
          typeof value === 'object' && value !== null
            ? (value as Record<string, unknown>)[part]
            : undefined,
        record
      );

  const bookingsQuery = (
    cursor?: readonly [number, number, string],
    maximum?: number
  ): Record<string, unknown> => ({
    orderBy: () => bookingsQuery(cursor, maximum),
    startAfter: (seconds: number, nanoseconds: number, id: string) =>
      bookingsQuery([seconds, nanoseconds, id], maximum),
    limit: (value: number) => bookingsQuery(cursor, value),
    get: async () => {
      const ordered = [...input.bookings].sort((left, right) => {
        const leftUpdated = readNested(left.data, 'updatedAt') as {
          seconds: number;
          nanoseconds: number;
        };
        const rightUpdated = readNested(right.data, 'updatedAt') as {
          seconds: number;
          nanoseconds: number;
        };
        return (
          rightUpdated.seconds - leftUpdated.seconds ||
          rightUpdated.nanoseconds - leftUpdated.nanoseconds ||
          String(left.data.bookingId).localeCompare(String(right.data.bookingId))
        );
      });
      const afterCursor = cursor
        ? ordered.filter((document) => {
            const updated = readNested(document.data, 'updatedAt') as {
              seconds: number;
              nanoseconds: number;
            };
            return (
              updated.seconds < cursor[0] ||
              (updated.seconds === cursor[0] && updated.nanoseconds < cursor[1]) ||
              (updated.seconds === cursor[0] &&
                updated.nanoseconds === cursor[1] &&
                String(document.data.bookingId) > cursor[2])
            );
          })
        : ordered;
      return {
        docs: afterCursor.slice(0, maximum).map((document) => ({
          id: document.id,
          data: () => document.data,
        })),
      };
    },
  });

  return {
    collection: (name: string) => {
      if (name === 'bookings') {
        return {
          ...bookingsQuery(),
          doc: (id: string) => ({
            get: async () => {
              const document = input.bookings.find((candidate) => candidate.id === id);
              return {
                id,
                exists: document !== undefined,
                data: () => document?.data,
              };
            },
          }),
        };
      }
      if (name === 'admin_issues') {
        return {
          where: (_field: string, _operator: string, bookingIdValue: string) => ({
            limit: () => ({
              get: async () => ({
                docs: Object.entries(input.documents.admin_issues ?? {})
                  .filter(
                    ([, data]) =>
                      (data.subjectRef as { bookingId?: string }).bookingId === bookingIdValue
                  )
                  .map(([id, data]) => ({ id, data: () => data })),
              }),
            }),
          }),
        };
      }
      return {
        doc: (id: string) => ({
          get: async () => {
            const data = input.documents[name]?.[id];
            return {
              id,
              exists: data !== undefined,
              data: () => data,
            };
          },
        }),
      };
    },
  } as unknown as Firestore;
}

describe('Admin lesson booking read models', () => {
  const adminId = AccountIdSchema.parse('account_admin_lesson_read_01');
  const adminActor = { kind: 'administrator' as const, accountId: adminId };
  const readNow = timestampFromDate(new Date('2026-08-01T10:00:00.000Z'));

  function canonicalBooking(
    id: string,
    updatedIso: string,
    lifecycle:
      | { status: 'confirmed' }
      | {
          status: 'pending_cancellation';
          requestedAt: ReturnType<typeof timestampFromDate>;
        }
  ) {
    const parsedId = BookingIdSchema.parse(id);
    const participant = ParticipantIdSchema.parse(`participant_${id}`);
    return BookingSchema.parse({
      bookingId: parsedId,
      attribution: {
        bookingOrigin: 'account',
        bookedBy: { kind: 'account', accountId: adminId },
      },
      party: { kind: 'individual', participantIds: [participant] },
      occurrence: {
        occurrenceId: OccurrenceIdSchema.parse(`occurrence_${id}`),
        instructorId,
        interval: {
          startsAt: timestampFromDate(new Date('2026-08-02T09:00:00.000Z')),
          endsAt: timestampFromDate(new Date('2026-08-02T10:00:00.000Z')),
        },
        timeZone: 'Asia/Almaty',
        scheduleRevision: 3,
        serviceParty: {
          participantIds: [participant],
          frozenAt: readNow,
        },
      },
      lifecycle,
      paymentId: paymentIdFromBookingId(parsedId),
      payerAccountId: adminId,
      revision: 4,
      createdAt: timestampFromDate(new Date('2026-07-01T10:00:00.000Z')),
      updatedAt: timestampFromDate(new Date(updatedIso)),
      audit: {
        createdByCommandId: `command_create_${id}`,
        lastChangedByCommandId: `command_update_${id}`,
        correlationId: `correlation_${id}`,
      },
    });
  }

  function adminFixture(
    bookings: readonly ReturnType<typeof canonicalBooking>[],
    options: { readonly unmanagedGuest?: boolean } = {}
  ) {
    const participantDocuments: Record<string, Record<string, unknown>> = {};
    const paymentDocuments: Record<string, Record<string, unknown>> = {};
    for (const booking of bookings) {
      const participantIdValue = booking.party.participantIds[0]!;
      participantDocuments[participantIdValue] = ParticipantSchema.parse({
        participantId: participantIdValue,
        displayName: `Student ${booking.bookingId}`,
        age: { kind: 'age_years', years: 17 },
        skillLevel: 'intermediate',
        discipline: 'ski',
        management: options.unmanagedGuest
          ? { kind: 'unmanaged_guest' }
          : {
              kind: 'managed',
              participantManagementId: `management_${booking.bookingId}`,
            },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
        audit: {
          createdByCommandId: `command_participant_${booking.bookingId}`,
          lastChangedByCommandId: `command_participant_${booking.bookingId}`,
          correlationId: `correlation_participant_${booking.bookingId}`,
        },
      }) as unknown as Record<string, unknown>;
      paymentDocuments[booking.paymentId] = PaymentSchema.parse({
        paymentId: booking.paymentId,
        subjectType: 'booking',
        subjectId: booking.bookingId,
        currency: 'KZT',
        originalPrice: 50_000,
        price: 50_000,
        paidAmount: 50_000,
        refundedAmount: 0,
        retainedAmount: 50_000,
        settledAmount: 50_000,
        writtenOffAmount: 0,
        outstandingAmount: 0,
        paymentStatus: 'paid',
        payerAccountId: adminId,
        incrementalRequirements: [],
        eventRevision: 1,
        revision: 2,
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      }) as unknown as Record<string, unknown>;
    }
    const issueBooking = bookings[0]!;
    const issue = createOpenAdminIssue({
      identity: {
        strategyVersion: 'issue:v1',
        kind: 'unresolved_pending_cancellation',
        subjectKind: 'booking',
        subjectId: issueBooking.bookingId,
        occurrenceId: issueBooking.occurrence.occurrenceId,
      },
      now: issueBooking.updatedAt,
      correlationId: `correlation_issue_${issueBooking.bookingId}`,
      commandId: `command_issue_${issueBooking.bookingId}`,
    });
    const account = AccountSchema.parse({
      accountId: adminId,
      lifecycle: { status: 'active' },
      revision: 1,
      createdAt: issueBooking.createdAt,
      updatedAt: issueBooking.updatedAt,
      audit: {
        createdByCommandId: 'command_admin_account',
        lastChangedByCommandId: 'command_admin_account',
        correlationId: 'correlation_admin_account',
      },
    });
    return {
      issue,
      firestore: createAdminReadFirestore({
        bookings: bookings.map((booking) => ({
          id: booking.bookingId,
          data: booking as unknown as Record<string, unknown>,
        })),
        documents: {
          instructors: {
            [instructorId]: {
              id: instructorId,
              name: 'Canonical Coach',
              pricePerHourKZT: 50_000,
            },
          },
          participants: participantDocuments,
          payments: paymentDocuments,
          users: {
            [adminId]: {
              ...(account as unknown as Record<string, unknown>),
              role: 'admin',
              displayName: 'Admin Payer',
            },
          },
          admin_issues: {
            [issue.issueId]: issue as unknown as Record<string, unknown>,
          },
        },
      }),
    };
  }

  it('projects canonical payment, participant, policy, issue, and action detail', async () => {
    const booking = canonicalBooking('booking_admin_detail_read_01', '2026-08-01T12:00:00.000Z', {
      status: 'pending_cancellation',
      requestedAt: timestampFromDate(new Date('2026-08-01T10:00:00.000Z')),
    });
    const { firestore, issue } = adminFixture([booking]);
    const model = await buildAdminLessonBookingReadModel(firestore, adminActor, booking, {
      now: readNow,
    });

    expect(model?.admin).toMatchObject({
      participants: [
        {
          participantId: booking.party.participantIds[0],
          skillLevel: 'intermediate',
          discipline: 'ski',
          age: { kind: 'age_years', years: 17 },
        },
      ],
      attribution: {
        bookingOrigin: 'account',
        bookedBy: { kind: 'account', accountId: adminId },
      },
      payer: { accountId: adminId, displayName: 'Admin Payer' },
      payment: {
        paymentId: booking.paymentId,
        status: 'paid',
        revision: 2,
        currency: 'KZT',
        originalPrice: 50_000,
        price: 50_000,
        paid: 50_000,
        refunded: 0,
        retained: 50_000,
        settled: 50_000,
        writtenOff: 0,
        outstanding: 0,
      },
      cancellationFinancial: {
        timing: 'pending_request',
        maximumRefund: 50_000,
        suggestedRefund: 50_000,
      },
      relatedIssues: [{ issueId: issue.issueId }],
      scheduleRevision: 3,
      serviceParticipantIds: booking.occurrence.serviceParty.participantIds,
      authorizedActions: {
        canConfirmGuest: false,
        canDirectCancel: false,
        canReschedule: false,
        canChangeInstructor: false,
        canChangeDuration: false,
        canRecordAttendance: false,
        canResolveCancellation: true,
        canResolveAttendanceOutcome: false,
        canLinkGuestToAccount: false,
      },
    });
    expect(model?.admin?.payment).not.toHaveProperty('totalPrice');
    expect(model?.admin?.payment).not.toHaveProperty('paidAmount');
  });

  it('authorizes canonical guest confirmation without treating a managed party as linkable', async () => {
    const base = canonicalBooking('booking_admin_guest_confirm_01', '2026-08-01T12:00:00.000Z', {
      status: 'confirmed',
    });
    const booking = BookingSchema.parse({
      ...base,
      attribution: {
        bookingOrigin: 'guest',
        bookedBy: { kind: 'guest', guestSubjectId: 'guest_subject_admin_confirm_01' },
      },
      lifecycle: {
        status: 'pending',
        reservationExpiresAt: timestampFromDate(new Date('2026-08-01T13:00:00.000Z')),
      },
    });
    const { firestore } = adminFixture([booking]);

    const model = await buildAdminLessonBookingReadModel(firestore, adminActor, booking, {
      now: readNow,
    });

    expect(model?.admin?.authorizedActions).toMatchObject({
      canConfirmGuest: false,
      canDirectCancel: false,
      canLinkGuestToAccount: false,
    });
  });

  it('authorizes Admin guest identity linking for a unique unmanaged guest Participant', async () => {
    const base = canonicalBooking('booking_admin_guest_link_01', '2026-08-01T12:00:00.000Z', {
      status: 'confirmed',
    });
    const booking = BookingSchema.parse({
      ...base,
      attribution: {
        bookingOrigin: 'guest',
        bookedBy: { kind: 'guest', guestSubjectId: 'guest_subject_admin_link_01' },
      },
      lifecycle: {
        status: 'pending',
        reservationExpiresAt: timestampFromDate(new Date('2026-08-01T13:00:00.000Z')),
      },
      occurrence: {
        ...base.occurrence,
        serviceParty: { participantIds: base.party.participantIds },
      },
    });
    const { firestore } = adminFixture([booking], { unmanagedGuest: true });

    const model = await buildAdminLessonBookingReadModel(firestore, adminActor, booking, {
      now: readNow,
    });

    expect(model?.admin?.authorizedActions).toMatchObject({
      canConfirmGuest: false,
      canLinkGuestToAccount: true,
    });
    expect(model?.admin?.guestIdentityLinkUnavailableReason).toBeUndefined();
  });

  it('returns Admin hot/detail/history with stable bounded cursors and canonical-only rows', async () => {
    const hot = canonicalBooking('booking_admin_page_hot_01', '2026-08-01T13:00:00.000Z', {
      status: 'confirmed',
    });
    const history = BookingSchema.parse({
      ...canonicalBooking('booking_admin_page_history_01', '2026-08-01T11:00:00.000Z', {
        status: 'confirmed',
      }),
      lifecycle: {
        status: 'cancelled',
        cancelledAt: timestampFromDate(new Date('2026-08-01T11:00:00.000Z')),
        reasonCode: 'administrator_cancelled',
      },
    });
    const legacy = {
      bookingId: 'booking_admin_legacy_course_01',
      courseId: 'course_legacy_01',
      updatedAt: timestampFromDate(new Date('2026-08-01T12:00:00.000Z')),
    };
    const firestore = createAdminReadFirestore({
      bookings: [
        { id: hot.bookingId, data: hot as unknown as Record<string, unknown> },
        { id: legacy.bookingId, data: legacy },
        { id: history.bookingId, data: history as unknown as Record<string, unknown> },
      ],
      documents: {
        instructors: {
          [instructorId]: {
            id: instructorId,
            name: 'Canonical Coach',
            pricePerHourKZT: 50_000,
          },
        },
        participants: Object.fromEntries(
          [hot, history].map((booking) => {
            const participantIdValue = booking.party.participantIds[0]!;
            return [
              participantIdValue,
              ParticipantSchema.parse({
                participantId: participantIdValue,
                displayName: 'Student',
                age: { kind: 'age_years', years: 18 },
                skillLevel: 'beginner',
                discipline: 'ski',
                management: { kind: 'unmanaged_guest' },
                lifecycle: { status: 'active' },
                revision: 1,
                createdAt: booking.createdAt,
                updatedAt: booking.updatedAt,
                audit: {
                  createdByCommandId: `command_${booking.bookingId}`,
                  lastChangedByCommandId: `command_${booking.bookingId}`,
                  correlationId: `correlation_${booking.bookingId}`,
                },
              }) as unknown as Record<string, unknown>,
            ];
          })
        ),
        payments: Object.fromEntries(
          [hot, history].map((booking) => [
            booking.paymentId,
            PaymentSchema.parse({
              paymentId: booking.paymentId,
              subjectType: 'booking',
              subjectId: booking.bookingId,
              currency: 'KZT',
              originalPrice: 1,
              price: 1,
              paidAmount: 1,
              refundedAmount: 0,
              retainedAmount: 1,
              settledAmount: 1,
              writtenOffAmount: 0,
              outstandingAmount: 0,
              paymentStatus: 'paid',
              payerAccountId: adminId,
              incrementalRequirements: [],
              eventRevision: 1,
              revision: 1,
              createdAt: booking.createdAt,
              updatedAt: booking.updatedAt,
            }) as unknown as Record<string, unknown>,
          ])
        ),
        users: {
          [adminId]: {
            accountId: adminId,
            lifecycle: { status: 'active' },
            revision: 1,
            createdAt: hot.createdAt,
            updatedAt: hot.updatedAt,
            audit: {
              createdByCommandId: 'command_admin',
              lastChangedByCommandId: 'command_admin',
              correlationId: 'correlation_admin',
            },
            displayName: 'Admin',
          },
        },
        admin_issues: {},
      },
    });

    const first = await queryLessonBookingReadModels(
      firestore,
      { scope: 'admin_hot', pageSize: 1 },
      { administratorActor: adminActor, now: new Date('2026-08-01T10:00:00.000Z') }
    );
    expect(first.items.map((item) => item.bookingId)).toEqual([hot.bookingId]);
    expect(first.hasMore).toBe(true);
    const skippedLegacy = await queryLessonBookingReadModels(
      firestore,
      { scope: 'admin_hot', pageSize: 1, cursor: first.nextCursor },
      { administratorActor: adminActor, now: new Date('2026-08-01T10:00:00.000Z') }
    );
    expect(skippedLegacy.items).toEqual([]);
    expect(skippedLegacy.hasMore).toBe(true);
    const finalHotPage = await queryLessonBookingReadModels(
      firestore,
      {
        scope: 'admin_hot',
        pageSize: 1,
        cursor: skippedLegacy.nextCursor,
      },
      { administratorActor: adminActor, now: new Date('2026-08-01T10:00:00.000Z') }
    );
    expect(finalHotPage.items).toEqual([]);
    expect(finalHotPage.hasMore).toBe(false);

    const historyResult = await queryLessonBookingReadModels(
      firestore,
      { scope: 'admin_history' },
      { administratorActor: adminActor, now: new Date('2026-08-01T10:00:00.000Z') }
    );
    expect(historyResult.items.map((item) => item.bookingId)).toEqual([history.bookingId]);
    const detail = await queryLessonBookingReadModels(
      firestore,
      { scope: 'admin_detail', bookingId: hot.bookingId },
      { administratorActor: adminActor, now: new Date('2026-08-01T10:00:00.000Z') }
    );
    expect(detail.items[0]?.bookingId).toBe(hot.bookingId);
    expect(detail.items[0]?.admin).toBeDefined();
    expect(detail.items[0]?.admin?.authorizedActions.canDirectCancel).toBe(true);
  });
});
