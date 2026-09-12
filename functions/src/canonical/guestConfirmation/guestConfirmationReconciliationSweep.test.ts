import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AccountIdSchema,
  AdminIssueSchema,
  BookingIdSchema,
  CommandIdSchema,
  CorrelationIdSchema,
  CourseEnrollmentIdSchema,
  PaymentSchema,
  createOpenAdminIssue,
  financialReconciliationMismatchIdentity,
  timestampFromDate,
  type AdminIssue,
  type Payment,
} from '@ski-academy/shared-domain';
import {
  GUEST_CONFIRMATION_RECONCILIATION_BOOKING_STATUSES,
  GUEST_CONFIRMATION_RECONCILIATION_ENROLLMENT_STATUSES,
  GUEST_CONFIRMATION_RECONCILIATION_SWEEP_MAX_CANDIDATES,
  GUEST_CONFIRMATION_RECONCILIATION_SWEEP_MAX_SCANNED_SUBJECTS,
  GUEST_CONFIRMATION_RECONCILIATION_SWEEP_PAGE_SIZE,
  discoverFullyFundedGuestConfirmationSweepPaymentIds,
} from './guestConfirmationReconciliationSweep';

const decidedAt = timestampFromDate(new Date('2026-01-01T00:00:00.000Z'));
const SWEEP_SOURCE = readFileSync(
  fileURLToPath(new URL('./guestConfirmationReconciliationSweep.ts', import.meta.url)),
  'utf8'
);

type FakeDoc = {
  readonly id: string;
  readonly data: Record<string, unknown>;
};

type FakeConstraint =
  | { readonly type: 'where'; readonly field: string; readonly op: string; readonly value: unknown }
  | { readonly type: 'orderBy'; readonly field: string; readonly direction: 'asc' | 'desc' }
  | { readonly type: 'limit'; readonly limit: number }
  | { readonly type: 'startAfter'; readonly values: readonly unknown[] };

function getPath(data: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, data);
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left ?? '').localeCompare(String(right ?? ''));
}

class FakeQuery {
  constructor(
    private readonly firestore: FakeFirestore,
    private readonly collectionName: string,
    private readonly constraints: readonly FakeConstraint[] = []
  ) {}

  where(field: string, op: string, value: unknown): FakeQuery {
    return new FakeQuery(this.firestore, this.collectionName, [
      ...this.constraints,
      { type: 'where', field, op, value },
    ]);
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): FakeQuery {
    return new FakeQuery(this.firestore, this.collectionName, [
      ...this.constraints,
      { type: 'orderBy', field, direction },
    ]);
  }

  limit(limit: number): FakeQuery {
    return new FakeQuery(this.firestore, this.collectionName, [
      ...this.constraints,
      { type: 'limit', limit },
    ]);
  }

  startAfter(...values: unknown[]): FakeQuery {
    return new FakeQuery(this.firestore, this.collectionName, [
      ...this.constraints,
      { type: 'startAfter', values },
    ]);
  }

  async get() {
    this.firestore.queries.push({
      collectionName: this.collectionName,
      constraints: this.constraints,
    });
    const docs = [...(this.firestore.collections.get(this.collectionName)?.values() ?? [])];
    const filtered = docs.filter((doc) =>
      this.constraints.every((constraint) => {
        if (constraint.type !== 'where') return true;
        return getPath(doc.data, constraint.field) === constraint.value;
      })
    );
    const orderBys = this.constraints.filter(
      (constraint): constraint is Extract<FakeConstraint, { type: 'orderBy' }> =>
        constraint.type === 'orderBy'
    );
    filtered.sort((left, right) => {
      for (const orderBy of orderBys) {
        const cmp = compareValues(getPath(left.data, orderBy.field), getPath(right.data, orderBy.field));
        if (cmp !== 0) return orderBy.direction === 'desc' ? -cmp : cmp;
      }
      return left.id.localeCompare(right.id);
    });
    const startAfter = [...this.constraints].reverse().find((constraint) => constraint.type === 'startAfter');
    let sliced = filtered;
    if (startAfter && startAfter.type === 'startAfter') {
      const afterIndex = filtered.findIndex((doc) => {
        const cursor = startAfter.values;
        for (const [index, orderBy] of orderBys.entries()) {
          const cmp = compareValues(getPath(doc.data, orderBy.field), cursor[index]);
          const ordered = orderBy.direction === 'desc' ? -cmp : cmp;
          if (ordered < 0) return false;
          if (ordered > 0) return true;
        }
        return false;
      });
      sliced = afterIndex < 0 ? [] : filtered.slice(afterIndex);
    }
    const limit = this.constraints.find(
      (constraint): constraint is Extract<FakeConstraint, { type: 'limit' }> => constraint.type === 'limit'
    )?.limit;
    const page = limit === undefined ? sliced : sliced.slice(0, limit);
    this.firestore.subjectQueryReads += 1;
    this.firestore.subjectDocsRead += page.length;
    return {
      empty: page.length === 0,
      size: page.length,
      docs: page.map((doc) => new FakeQueryDocumentSnapshot(doc)),
    };
  }
}

class FakeQueryDocumentSnapshot {
  constructor(private readonly doc: FakeDoc) {}

  get id() {
    return this.doc.id;
  }

  get(field: string): unknown {
    return getPath(this.doc.data, field);
  }

  data(): Record<string, unknown> {
    return this.doc.data;
  }
}

class FakeDocumentSnapshot {
  constructor(
    readonly id: string,
    private readonly value: Record<string, unknown> | undefined
  ) {}

  get exists() {
    return this.value !== undefined;
  }

  data(): Record<string, unknown> | undefined {
    return this.value;
  }
}

class FakeDocumentReference {
  constructor(
    private readonly firestore: FakeFirestore,
    readonly collectionName: string,
    readonly id: string
  ) {}

  async get() {
    if (this.collectionName === 'payments') {
      this.firestore.paymentLookupReads += 1;
    } else if (this.collectionName === 'admin_issues') {
      this.firestore.issueLookupReads += 1;
    }
    return new FakeDocumentSnapshot(
      this.id,
      this.firestore.collections.get(this.collectionName)?.get(this.id)?.data
    );
  }
}

class FakeCollection {
  constructor(
    private readonly firestore: FakeFirestore,
    private readonly collectionName: string
  ) {}

  where(field: string, op: string, value: unknown): FakeQuery {
    return new FakeQuery(this.firestore, this.collectionName).where(field, op, value);
  }

  doc(id: string): FakeDocumentReference {
    return new FakeDocumentReference(this.firestore, this.collectionName, id);
  }

  async get(): Promise<never> {
    throw new Error(`Unbounded ${this.collectionName} collection get is forbidden`);
  }
}

class FakeFirestore {
  readonly collections = new Map<string, Map<string, FakeDoc>>();
  readonly queries: Array<{ collectionName: string; constraints: readonly FakeConstraint[] }> = [];
  subjectQueryReads = 0;
  subjectDocsRead = 0;
  paymentLookupReads = 0;
  issueLookupReads = 0;

  collection(name: string): FakeCollection {
    return new FakeCollection(this, name);
  }

  doc(path: string): FakeDocumentReference {
    const normalized = path.startsWith('/') ? path.slice(1) : path;
    const slash = normalized.indexOf('/');
    if (slash < 0) {
      throw new Error(`Invalid document path ${path}`);
    }
    return new FakeDocumentReference(
      this,
      normalized.slice(0, slash),
      normalized.slice(slash + 1)
    );
  }

  async getAll(...refs: FakeDocumentReference[]) {
    return Promise.all(refs.map((ref) => ref.get()));
  }

  put(collectionName: string, id: string, data: Record<string, unknown>) {
    const collection = this.collections.get(collectionName) ?? new Map<string, FakeDoc>();
    collection.set(id, { id, data });
    this.collections.set(collectionName, collection);
  }
}

function timestamp(seconds: number) {
  return { seconds, nanoseconds: 0 };
}

function fundedPayment(input: {
  readonly paymentId: string;
  readonly subjectType: Payment['subjectType'];
  readonly subjectId: string;
}): Payment {
  return PaymentSchema.parse({
    paymentId: input.paymentId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    currency: 'KZT',
    originalPrice: 12_000,
    price: 12_000,
    paidAmount: 12_000,
    refundedAmount: 0,
    retainedAmount: 12_000,
    settledAmount: 12_000,
    writtenOffAmount: 0,
    outstandingAmount: 0,
    paymentStatus: 'paid',
    incrementalRequirements: [],
    revision: 2,
    eventRevision: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
  });
}

function unpaidPayment(input: {
  readonly paymentId: string;
  readonly subjectType: Payment['subjectType'];
  readonly subjectId: string;
}): Payment {
  return PaymentSchema.parse({
    ...fundedPayment(input),
    paidAmount: 0,
    retainedAmount: 0,
    settledAmount: 0,
    outstandingAmount: 12_000,
    paymentStatus: 'unpaid',
    revision: 1,
    eventRevision: 0,
  });
}

function guestBooking(input: {
  readonly bookingId: string;
  readonly paymentId: string;
  readonly status: 'pending' | 'cancelled' | 'confirmed';
  readonly updatedAtSeconds: number;
}) {
  return {
    bookingId: input.bookingId,
    attribution: { bookingOrigin: 'guest' },
    lifecycle: { status: input.status },
    paymentId: input.paymentId,
    updatedAt: timestamp(input.updatedAtSeconds),
  };
}

function accountBooking(input: {
  readonly bookingId: string;
  readonly paymentId: string;
  readonly status: 'confirmed' | 'cancelled';
  readonly updatedAtSeconds: number;
}) {
  return {
    bookingId: input.bookingId,
    attribution: { bookingOrigin: 'account' },
    lifecycle: { status: input.status },
    paymentId: input.paymentId,
    updatedAt: timestamp(input.updatedAtSeconds),
  };
}

function guestEnrollment(input: {
  readonly enrollmentId: string;
  readonly paymentId: string;
  readonly status: 'pending' | 'cancelled' | 'withdrawn';
  readonly updatedAtSeconds: number;
}) {
  return {
    enrollmentId: input.enrollmentId,
    attribution: { bookingOrigin: 'guest' },
    lifecycle: { status: input.status },
    paymentId: input.paymentId,
    updatedAt: timestamp(input.updatedAtSeconds),
  };
}

function guestConfirmationIssue(input: {
  readonly subjectKind: 'booking' | 'course_enrollment';
  readonly subjectId: string;
  readonly status: 'open' | 'resolved';
}): AdminIssue {
  const open = createOpenAdminIssue({
    identity: financialReconciliationMismatchIdentity({
      subjectKind: input.subjectKind,
      subjectId:
        input.subjectKind === 'booking'
          ? BookingIdSchema.parse(input.subjectId)
          : CourseEnrollmentIdSchema.parse(input.subjectId),
      reconciliationScope: 'guest_confirmation_lifecycle',
    }),
    now: decidedAt,
    correlationId: CorrelationIdSchema.parse('correlation_guest_sweep_open_01'),
    commandId: CommandIdSchema.parse('command_guest_sweep_open_01'),
  });
  if (input.status === 'open') return open;
  return AdminIssueSchema.parse({
    ...open,
    lifecycle: {
      status: 'resolved',
      openedAt: decidedAt,
      lastDetectedAt: decidedAt,
      resolvedAt: decidedAt,
      resolution: {
        reason: 'fixture_resolved_without_lifecycle_change',
        resolvedByAccountId: AccountIdSchema.parse('account_admin_fixture_01'),
      },
    },
  });
}

function seedFundedGuestBooking(
  firestore: FakeFirestore,
  input: {
    readonly bookingId: string;
    readonly status: 'pending' | 'cancelled';
    readonly updatedAtSeconds: number;
    readonly issue?: 'open' | 'resolved';
  }
) {
  const paymentId = `payment_${input.bookingId}`;
  firestore.put(
    'bookings',
    input.bookingId,
    guestBooking({
      bookingId: input.bookingId,
      paymentId,
      status: input.status,
      updatedAtSeconds: input.updatedAtSeconds,
    })
  );
  firestore.put(
    'payments',
    paymentId,
    fundedPayment({
      paymentId,
      subjectType: 'booking',
      subjectId: input.bookingId,
    })
  );
  if (input.issue) {
    const issue = guestConfirmationIssue({
      subjectKind: 'booking',
      subjectId: input.bookingId,
      status: input.issue,
    });
    firestore.put('admin_issues', issue.issueId, issue as unknown as Record<string, unknown>);
  }
  return paymentId;
}

function seedFundedGuestEnrollment(
  firestore: FakeFirestore,
  input: {
    readonly enrollmentId: string;
    readonly status: 'pending' | 'cancelled' | 'withdrawn';
    readonly updatedAtSeconds: number;
    readonly issue?: 'open' | 'resolved';
  }
) {
  const paymentId = `payment_${input.enrollmentId}`;
  firestore.put(
    'course_enrollments',
    input.enrollmentId,
    guestEnrollment({
      enrollmentId: input.enrollmentId,
      paymentId,
      status: input.status,
      updatedAtSeconds: input.updatedAtSeconds,
    })
  );
  firestore.put(
    'payments',
    paymentId,
    fundedPayment({
      paymentId,
      subjectType: 'course_enrollment',
      subjectId: input.enrollmentId,
    })
  );
  if (input.issue) {
    const issue = guestConfirmationIssue({
      subjectKind: 'course_enrollment',
      subjectId: input.enrollmentId,
      status: input.issue,
    });
    firestore.put('admin_issues', issue.issueId, issue as unknown as Record<string, unknown>);
  }
  return paymentId;
}

describe('guest confirmation reconciliation sweep discovery', () => {
  it('keeps discovery bounded and does not scan Payment history', () => {
    expect(GUEST_CONFIRMATION_RECONCILIATION_SWEEP_PAGE_SIZE).toBe(25);
    expect(GUEST_CONFIRMATION_RECONCILIATION_SWEEP_MAX_CANDIDATES).toBe(100);
    expect(GUEST_CONFIRMATION_RECONCILIATION_SWEEP_MAX_SCANNED_SUBJECTS).toBe(2_000);
    expect(GUEST_CONFIRMATION_RECONCILIATION_SWEEP_MAX_SCANNED_SUBJECTS).toBeGreaterThan(
      GUEST_CONFIRMATION_RECONCILIATION_SWEEP_MAX_CANDIDATES
    );
    expect(GUEST_CONFIRMATION_RECONCILIATION_BOOKING_STATUSES).toEqual(['pending', 'cancelled']);
    expect(GUEST_CONFIRMATION_RECONCILIATION_ENROLLMENT_STATUSES).toEqual([
      'pending',
      'cancelled',
      'withdrawn',
    ]);
    expect(SWEEP_SOURCE).not.toContain('outstandingAmount');
    expect(SWEEP_SOURCE).toContain("attribution.bookingOrigin', '==', 'guest'");
    expect(SWEEP_SOURCE).toContain('.limit(');
    expect(SWEEP_SOURCE).toContain('.startAfter(');
    expect(SWEEP_SOURCE).toContain('financialReconciliationMismatchIdentity');
    expect(SWEEP_SOURCE).toContain('plannedAdminIssuePath');
  });

  it('excludes historical fully-paid non-guest Payments without reading them', async () => {
    const firestore = new FakeFirestore();
    for (let index = 0; index < 40; index += 1) {
      const bookingId = `booking_account_history_${index}`;
      const paymentId = `payment_account_history_${index}`;
      firestore.put('bookings', bookingId, accountBooking({
        bookingId,
        paymentId,
        status: 'confirmed',
        updatedAtSeconds: 1_000 + index,
      }));
      firestore.put('payments', paymentId, fundedPayment({
        paymentId,
        subjectType: 'booking',
        subjectId: bookingId,
      }));
    }
    const guestBookingId = 'booking_guest_history_mismatch';
    const guestPaymentId = 'payment_guest_history_mismatch';
    firestore.put(
      'bookings',
      guestBookingId,
      guestBooking({
        bookingId: guestBookingId,
        paymentId: guestPaymentId,
        status: 'cancelled',
        updatedAtSeconds: 50,
      })
    );
    firestore.put(
      'payments',
      guestPaymentId,
      fundedPayment({
        paymentId: guestPaymentId,
        subjectType: 'booking',
        subjectId: guestBookingId,
      })
    );

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(
      firestore as never,
      { pageSize: 10 }
    );

    expect(discovered.payments.map((payment) => payment.paymentId)).toEqual([guestPaymentId]);
    expect(discovered.subjectDocsRead).toBe(1);
    expect(discovered.paymentLookupReads).toBe(1);
    expect(discovered.issueLookupReads).toBe(1);
    expect(discovered.alreadyOpenSkipped).toBe(0);
    expect(discovered.workCandidatesSelected).toBe(1);
    expect(firestore.queries.every((query) => query.collectionName !== 'payments')).toBe(true);
    expect(
      firestore.queries.some((query) =>
        query.constraints.some(
          (constraint) => constraint.type === 'where' && constraint.field === 'outstandingAmount'
        )
      )
    ).toBe(false);
  });

  it('does not select already consistent confirmed guest Payments', async () => {
    const firestore = new FakeFirestore();
    firestore.put(
      'bookings',
      'booking_guest_confirmed',
      guestBooking({
        bookingId: 'booking_guest_confirmed',
        paymentId: 'payment_guest_confirmed',
        status: 'confirmed',
        updatedAtSeconds: 200,
      })
    );
    firestore.put(
      'payments',
      'payment_guest_confirmed',
      fundedPayment({
        paymentId: 'payment_guest_confirmed',
        subjectType: 'booking',
        subjectId: 'booking_guest_confirmed',
      })
    );

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(firestore as never);
    expect(discovered.payments).toEqual([]);
    expect(discovered.subjectDocsRead).toBe(0);
    expect(discovered.paymentLookupReads).toBe(0);
    expect(discovered.issueLookupReads).toBe(0);
    expect(discovered.truncated).toBe(false);
  });

  it('does not select unpaid guest cancelled subjects as fully-funded candidates', async () => {
    const firestore = new FakeFirestore();
    firestore.put(
      'bookings',
      'booking_guest_unpaid_cancelled',
      guestBooking({
        bookingId: 'booking_guest_unpaid_cancelled',
        paymentId: 'payment_guest_unpaid_cancelled',
        status: 'cancelled',
        updatedAtSeconds: 200,
      })
    );
    firestore.put(
      'payments',
      'payment_guest_unpaid_cancelled',
      unpaidPayment({
        paymentId: 'payment_guest_unpaid_cancelled',
        subjectType: 'booking',
        subjectId: 'booking_guest_unpaid_cancelled',
      })
    );

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(firestore as never);
    expect(discovered.subjectDocsRead).toBe(1);
    expect(discovered.paymentLookupReads).toBe(1);
    expect(discovered.issueLookupReads).toBe(0);
    expect(discovered.payments).toEqual([]);
  });

  it('keeps a historical funded guest mismatch selectable without a time bound', async () => {
    const firestore = new FakeFirestore();
    firestore.put(
      'course_enrollments',
      'course_enrollment_guest_old',
      {
        enrollmentId: 'course_enrollment_guest_old',
        attribution: { bookingOrigin: 'guest' },
        lifecycle: { status: 'cancelled' },
        paymentId: 'payment_guest_old',
        updatedAt: timestamp(10),
      }
    );
    firestore.put(
      'payments',
      'payment_guest_old',
      fundedPayment({
        paymentId: 'payment_guest_old',
        subjectType: 'course_enrollment',
        subjectId: 'course_enrollment_guest_old',
      })
    );

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(firestore as never);
    expect(discovered.payments.map((payment) => payment.paymentId)).toEqual(['payment_guest_old']);
  });

  it('paginates subject discovery with startAfter and does not reread the previous page', async () => {
    const firestore = new FakeFirestore();
    for (let index = 0; index < 5; index += 1) {
      const bookingId = `booking_guest_page_${index}`;
      const paymentId = `payment_guest_page_${index}`;
      firestore.put(
        'bookings',
        bookingId,
        guestBooking({
          bookingId,
          paymentId,
          status: 'cancelled',
          updatedAtSeconds: 500 - index * 10,
        })
      );
      firestore.put(
        'payments',
        paymentId,
        unpaidPayment({
          paymentId,
          subjectType: 'booking',
          subjectId: bookingId,
        })
      );
    }
    firestore.put(
      'bookings',
      'booking_guest_page_funded',
      guestBooking({
        bookingId: 'booking_guest_page_funded',
        paymentId: 'payment_guest_page_funded',
        status: 'cancelled',
        updatedAtSeconds: 1,
      })
    );
    firestore.put(
      'payments',
      'payment_guest_page_funded',
      fundedPayment({
        paymentId: 'payment_guest_page_funded',
        subjectType: 'booking',
        subjectId: 'booking_guest_page_funded',
      })
    );

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(
      firestore as never,
      { pageSize: 2 }
    );

    const cancelledQueries = firestore.queries.filter(
      (query) =>
        query.collectionName === 'bookings' &&
        query.constraints.some(
          (constraint) =>
            constraint.type === 'where' &&
            constraint.field === 'lifecycle.status' &&
            constraint.value === 'cancelled'
        )
    );
    expect(cancelledQueries.length).toBeGreaterThanOrEqual(3);
    expect(cancelledQueries[0]?.constraints.some((constraint) => constraint.type === 'startAfter')).toBe(
      false
    );
    expect(
      cancelledQueries.slice(1).every((query) =>
        query.constraints.some((constraint) => constraint.type === 'startAfter')
      )
    ).toBe(true);
    expect(discovered.payments.map((payment) => payment.paymentId)).toEqual(['payment_guest_page_funded']);
    expect(discovered.subjectDocsRead).toBe(6);
    expect(discovered.pages).toBeGreaterThanOrEqual(3);
  });

  it('stops after bounded empty subject pages when there are no guest candidates', async () => {
    const firestore = new FakeFirestore();
    for (let index = 0; index < 25; index += 1) {
      const paymentId = `payment_history_only_${index}`;
      firestore.put(
        'payments',
        paymentId,
        fundedPayment({
          paymentId,
          subjectType: 'booking',
          subjectId: `booking_history_only_${index}`,
        })
      );
    }

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(firestore as never);
    expect(discovered.payments).toEqual([]);
    expect(discovered.subjectDocsRead).toBe(0);
    expect(discovered.paymentLookupReads).toBe(0);
    expect(discovered.issueLookupReads).toBe(0);
    expect(discovered.pages).toBe(
      GUEST_CONFIRMATION_RECONCILIATION_BOOKING_STATUSES.length +
        GUEST_CONFIRMATION_RECONCILIATION_ENROLLMENT_STATUSES.length
    );
    expect(discovered.truncated).toBe(false);
  });

  it('does not let >100 newer already-open bookings consume maxCandidates ahead of older work', async () => {
    const firestore = new FakeFirestore();
    for (let index = 0; index < 101; index += 1) {
      seedFundedGuestBooking(firestore, {
        bookingId: `booking_guest_open_${index}`,
        status: 'pending',
        updatedAtSeconds: 2_000 - index,
        issue: 'open',
      });
    }
    const olderWorkPaymentId = seedFundedGuestBooking(firestore, {
      bookingId: 'booking_guest_work_101',
      status: 'pending',
      updatedAtSeconds: 1,
    });

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(
      firestore as never,
      { pageSize: 25 }
    );

    expect(discovered.alreadyOpenSkipped).toBe(101);
    expect(discovered.workCandidatesSelected).toBe(1);
    expect(discovered.payments.map((payment) => payment.paymentId)).toEqual([olderWorkPaymentId]);
    expect(discovered.fullyFundedCandidates).toBe(102);
    expect(discovered.truncated).toBe(false);
    expect(discovered.issueLookupReads).toBe(102);
    expect(discovered.subjectDocsRead).toBe(102);
  });

  it('pages past newer already-open pending bookings to older cancelled booking work', async () => {
    const firestore = new FakeFirestore();
    seedFundedGuestBooking(firestore, {
      bookingId: 'booking_guest_newer_pending_open',
      status: 'pending',
      updatedAtSeconds: 500,
      issue: 'open',
    });
    const olderCancelledPaymentId = seedFundedGuestBooking(firestore, {
      bookingId: 'booking_guest_older_cancelled_work',
      status: 'cancelled',
      updatedAtSeconds: 10,
    });

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(firestore as never);
    expect(discovered.alreadyOpenSkipped).toBe(1);
    expect(discovered.payments.map((payment) => payment.paymentId)).toEqual([
      olderCancelledPaymentId,
    ]);
  });

  it('pages past already-open booking streams to a course-enrollment work candidate', async () => {
    const firestore = new FakeFirestore();
    seedFundedGuestBooking(firestore, {
      bookingId: 'booking_guest_pending_open',
      status: 'pending',
      updatedAtSeconds: 400,
      issue: 'open',
    });
    seedFundedGuestBooking(firestore, {
      bookingId: 'booking_guest_cancelled_open',
      status: 'cancelled',
      updatedAtSeconds: 300,
      issue: 'open',
    });
    const enrollmentPaymentId = seedFundedGuestEnrollment(firestore, {
      enrollmentId: 'course_enrollment_guest_work',
      status: 'cancelled',
      updatedAtSeconds: 20,
    });

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(firestore as never);
    expect(discovered.alreadyOpenSkipped).toBe(2);
    expect(discovered.payments.map((payment) => payment.paymentId)).toEqual([enrollmentPaymentId]);
    expect(discovered.workCandidatesSelected).toBe(1);
  });

  it('selects a subject whose deterministic issue is resolved so reconciliation can reopen it', async () => {
    const firestore = new FakeFirestore();
    const paymentId = seedFundedGuestBooking(firestore, {
      bookingId: 'booking_guest_resolved_issue',
      status: 'cancelled',
      updatedAtSeconds: 100,
      issue: 'resolved',
    });

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(firestore as never);
    expect(discovered.alreadyOpenSkipped).toBe(0);
    expect(discovered.payments.map((payment) => payment.paymentId)).toEqual([paymentId]);
    expect(discovered.issueLookupReads).toBe(1);
  });

  it('does not select an OPEN issue or consume maxCandidates with it', async () => {
    const firestore = new FakeFirestore();
    seedFundedGuestBooking(firestore, {
      bookingId: 'booking_guest_open_only',
      status: 'cancelled',
      updatedAtSeconds: 100,
      issue: 'open',
    });

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(
      firestore as never,
      { maxCandidates: 1 }
    );
    expect(discovered.payments).toEqual([]);
    expect(discovered.alreadyOpenSkipped).toBe(1);
    expect(discovered.workCandidatesSelected).toBe(0);
    expect(discovered.fullyFundedCandidates).toBe(1);
    expect(discovered.truncated).toBe(false);
  });

  it('selects exactly maxCandidates actual unreconciled subjects', async () => {
    const firestore = new FakeFirestore();
    const paymentIds: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      paymentIds.push(
        seedFundedGuestBooking(firestore, {
          bookingId: `booking_guest_work_${index}`,
          status: 'cancelled',
          updatedAtSeconds: 500 - index,
        })
      );
    }

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(
      firestore as never,
      { maxCandidates: 3, pageSize: 2 }
    );
    expect(discovered.workCandidatesSelected).toBe(3);
    expect(discovered.payments.map((payment) => payment.paymentId)).toEqual(paymentIds.slice(0, 3));
    expect(discovered.alreadyOpenSkipped).toBe(0);
    expect(discovered.truncated).toBe(true);
  });

  it('advances startAfter across already-open-only pages without rereading them', async () => {
    const firestore = new FakeFirestore();
    for (let index = 0; index < 4; index += 1) {
      seedFundedGuestBooking(firestore, {
        bookingId: `booking_guest_open_page_${index}`,
        status: 'cancelled',
        updatedAtSeconds: 400 - index * 10,
        issue: 'open',
      });
    }
    const workPaymentId = seedFundedGuestBooking(firestore, {
      bookingId: 'booking_guest_open_page_work',
      status: 'cancelled',
      updatedAtSeconds: 1,
    });

    const discovered = await discoverFullyFundedGuestConfirmationSweepPaymentIds(
      firestore as never,
      { pageSize: 2 }
    );

    const cancelledQueries = firestore.queries.filter(
      (query) =>
        query.collectionName === 'bookings' &&
        query.constraints.some(
          (constraint) =>
            constraint.type === 'where' &&
            constraint.field === 'lifecycle.status' &&
            constraint.value === 'cancelled'
        )
    );
    expect(cancelledQueries.length).toBeGreaterThanOrEqual(3);
    expect(cancelledQueries[0]?.constraints.some((constraint) => constraint.type === 'startAfter')).toBe(
      false
    );
    expect(
      cancelledQueries.slice(1).every((query) =>
        query.constraints.some((constraint) => constraint.type === 'startAfter')
      )
    ).toBe(true);
    expect(discovered.alreadyOpenSkipped).toBe(4);
    expect(discovered.payments.map((payment) => payment.paymentId)).toEqual([workPaymentId]);
    expect(discovered.subjectDocsRead).toBe(5);
  });
});
