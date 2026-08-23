import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AccountIdSchema,
  AggregateRevisionSchema,
  BookingIdSchema,
  CANONICAL_COLLECTIONS,
  COMMAND_ERROR_CODES,
  CanonicalTimestampSchema,
  CanonicalCollectionPathSchema,
  CanonicalCommandError,
  CanonicalDocumentPathSchema,
  CanonicalReferenceSchema,
  CommandErrorTransportSchema,
  CorrelationIdSchema,
  IanaTimeZoneSchema,
  KztMoneySchema,
  ParticipantIdSchema,
  TimeIntervalSchema,
  canonicalPaths,
  canonicalReference,
  compareCanonicalTimestamps,
  intervalsOverlap,
  timestampFromDate,
  toCommandErrorTransport,
  validateCanonical,
  type AccountId,
  type BookingId,
  type ParticipantId,
} from '@ski-academy/shared-domain';

describe('canonical identifiers and references', () => {
  it.each(['', 'has/slash', '.', '..', 'has space', 'a'.repeat(129)])(
    'rejects malformed opaque ID %j',
    (candidate) => {
      expect(BookingIdSchema.safeParse(candidate).success).toBe(false);
    }
  );

  it('accepts bounded URL-safe opaque IDs', () => {
    expect(BookingIdSchema.parse('bkg_01JABCDEFGHJKMNPQRSTVWXYZ')).toBe(
      'bkg_01JABCDEFGHJKMNPQRSTVWXYZ'
    );
  });

  it('keeps aggregate IDs and references nominally distinct', () => {
    const bookingId = BookingIdSchema.parse('bkg_01JABCDEFGHJKMNPQRSTVWXYZ');
    const participantId = ParticipantIdSchema.parse('ptc_01JABCDEFGHJKMNPQRSTVWXYZ');
    const accountId = AccountIdSchema.parse('auth_uid_01');

    expectTypeOf(bookingId).toEqualTypeOf<BookingId>();
    expectTypeOf(participantId).toEqualTypeOf<ParticipantId>();
    expectTypeOf(accountId).toEqualTypeOf<AccountId>();
    expectTypeOf<BookingId>().not.toEqualTypeOf<ParticipantId>();

    expect(canonicalReference('booking', bookingId)).toEqual({
      kind: 'booking',
      id: bookingId,
    });
    expect(CanonicalReferenceSchema.parse({ kind: 'participant', id: participantId })).toEqual({
      kind: 'participant',
      id: participantId,
    });
  });

  it('rejects unknown aggregate-reference kinds and extra fields', () => {
    expect(
      CanonicalReferenceSchema.safeParse({ kind: 'legacy_booking', id: 'booking_1' }).success
    ).toBe(false);
    expect(
      CanonicalReferenceSchema.safeParse({
        kind: 'booking',
        id: 'booking_1',
        userId: 'legacy-user',
      }).success
    ).toBe(false);
  });
});

describe('canonical collections and paths', () => {
  const accountId = AccountIdSchema.parse('auth_uid_01');
  const bookingId = BookingIdSchema.parse('bkg_01JABCDEFGHJKMNPQRSTVWXYZ');

  it('publishes the accepted canonical collection vocabulary', () => {
    expect(CANONICAL_COLLECTIONS).toMatchObject({
      users: 'users',
      participants: 'participants',
      bookings: 'bookings',
      courseEnrollments: 'course_enrollments',
      payments: 'payments',
      attendance: 'attendance',
      resourceClaims: 'resource_claims',
      activityLogs: 'activity_logs',
      commandIdempotency: 'command_idempotency',
      domainOutbox: 'domain_outbox',
    });
    expect(Object.values(CANONICAL_COLLECTIONS)).not.toContain('availability_slots');
    expect(Object.values(CANONICAL_COLLECTIONS)).not.toContain('availability_hour_locks');
  });

  it('builds only absolute canonical document and collection paths', () => {
    expect(canonicalPaths.account(accountId)).toBe('/users/auth_uid_01');
    expect(canonicalPaths.wallet(accountId)).toBe('/users/auth_uid_01/wallet/state');
    expect(canonicalPaths.booking(bookingId)).toBe('/bookings/bkg_01JABCDEFGHJKMNPQRSTVWXYZ');
    expect(CanonicalCollectionPathSchema.parse('/bookings')).toBe('/bookings');
    expect(CanonicalDocumentPathSchema.parse('/bookings/bkg_01JABCDEFGHJKMNPQRSTVWXYZ')).toBe(
      '/bookings/bkg_01JABCDEFGHJKMNPQRSTVWXYZ'
    );
  });

  it.each([
    '',
    'bookings/booking_1',
    '/bookings',
    '/bookings/has/slash',
    '/availability_slots/slot_1',
    '/courses/course_1/enrollments/enrollment_1',
    '/users/user_1/wallet/not-state',
  ])('rejects malformed or noncanonical document path %j', (path) => {
    expect(CanonicalDocumentPathSchema.safeParse(path).success).toBe(false);
  });
});

describe('canonical validation results', () => {
  it('normalizes validation failures without copying rejected input', () => {
    const rejected = validateCanonical(KztMoneySchema, {
      currency: 'USD',
      minorUnits: -1,
      secret: 'do-not-echo',
    });

    expect(rejected.ok).toBe(false);
    if (rejected.ok) throw new Error('Expected validation to fail');

    expect(rejected.issues.length).toBeGreaterThan(0);
    expect(JSON.stringify(rejected)).not.toContain('do-not-echo');
    expect(rejected.issues).toEqual(
      [...rejected.issues].sort((left, right) => {
        const byPath = JSON.stringify(left.path).localeCompare(JSON.stringify(right.path));
        return byPath || left.code.localeCompare(right.code);
      })
    );
  });

  it('returns branded canonical values on success', () => {
    expect(validateCanonical(BookingIdSchema, 'booking_valid')).toEqual({
      ok: true,
      value: 'booking_valid',
    });
  });
});

describe('stable command errors', () => {
  const correlationId = CorrelationIdSchema.parse('corr_01JABCDEFGHJKMNPQRSTVWXYZ');

  it('serializes known errors deterministically from closed policy', () => {
    const error = new CanonicalCommandError('stale_version', {
      correlationId,
      currentRevision: AggregateRevisionSchema.parse(4),
    });

    const first = toCommandErrorTransport(error, correlationId);
    const second = toCommandErrorTransport(error, correlationId);

    expect(first).toEqual(second);
    expect(first).toEqual({
      code: 'stale_version',
      message: 'The record changed; refresh it before retrying.',
      retryable: false,
      correlationId,
      currentRevision: 4,
    });
    expect(CommandErrorTransportSchema.parse(first)).toEqual(first);
  });

  it('maps unknown failures to a retryable internal error without leaking internals', () => {
    const transport = toCommandErrorTransport(
      new Error('secret token at /payments/payment_1'),
      correlationId
    );

    expect(transport).toEqual({
      code: 'internal',
      message: 'The operation could not be completed.',
      retryable: true,
      correlationId,
    });
    expect(JSON.stringify(transport)).not.toContain('secret');
    expect(JSON.stringify(transport)).not.toContain('/payments');
  });

  it('rejects unknown codes, policy mismatches, and arbitrary detail fields', () => {
    expect(COMMAND_ERROR_CODES).not.toContain('unknown_code');
    expect(
      CommandErrorTransportSchema.safeParse({
        code: 'unknown_code',
        message: 'Anything',
        retryable: false,
        correlationId,
      }).success
    ).toBe(false);
    expect(
      CommandErrorTransportSchema.safeParse({
        code: 'forbidden',
        message: 'raw SDK message',
        retryable: true,
        correlationId,
        stack: 'internal stack',
      }).success
    ).toBe(false);
  });
});

describe('canonical time, revision, and money primitives', () => {
  const ten = { seconds: 10, nanoseconds: 0 };
  const eleven = { seconds: 11, nanoseconds: 0 };

  it('accepts Firestore-compatible UTC timestamp values and preserves ordering', () => {
    expect(CanonicalTimestampSchema.parse(ten)).toEqual(ten);
    expect(compareCanonicalTimestamps(ten, eleven)).toBe(-1);
    expect(timestampFromDate(new Date('2026-08-23T12:34:56.789Z'))).toEqual({
      seconds: 1_787_488_496,
      nanoseconds: 789_000_000,
    });
  });

  it.each([
    { seconds: Number.NaN, nanoseconds: 0 },
    { seconds: 1.5, nanoseconds: 0 },
    { seconds: 253_402_300_800, nanoseconds: 0 },
    { seconds: 10, nanoseconds: -1 },
    { seconds: 10, nanoseconds: 1_000_000_000 },
    { seconds: 10, nanoseconds: 0, timezone: 'local' },
  ])('rejects invalid timestamp value %#', (candidate) => {
    expect(CanonicalTimestampSchema.safeParse(candidate).success).toBe(false);
  });

  it('enforces ordered half-open intervals and permits adjacency', () => {
    expect(TimeIntervalSchema.safeParse({ startsAt: ten, endsAt: ten }).success).toBe(false);
    expect(TimeIntervalSchema.safeParse({ startsAt: eleven, endsAt: ten }).success).toBe(false);
    expect(TimeIntervalSchema.safeParse({ startsAt: ten, endsAt: eleven }).success).toBe(true);

    expect(
      intervalsOverlap(
        { startsAt: ten, endsAt: eleven },
        { startsAt: eleven, endsAt: { seconds: 12, nanoseconds: 0 } }
      )
    ).toBe(false);
    expect(
      intervalsOverlap(
        { startsAt: ten, endsAt: { seconds: 12, nanoseconds: 0 } },
        { startsAt: eleven, endsAt: { seconds: 13, nanoseconds: 0 } }
      )
    ).toBe(true);
  });

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid aggregate revision %j',
    (revision) => {
      expect(AggregateRevisionSchema.safeParse(revision).success).toBe(false);
    }
  );

  it('allows zero and positive safe-integer aggregate revisions', () => {
    expect(AggregateRevisionSchema.parse(0)).toBe(0);
    expect(AggregateRevisionSchema.parse(42)).toBe(42);
  });

  it.each([
    { currency: 'USD', minorUnits: 10 },
    { currency: 'KZT', minorUnits: -1 },
    { currency: 'KZT', minorUnits: 1.5 },
    { currency: 'KZT', minorUnits: Number.MAX_SAFE_INTEGER + 1 },
    { currency: 'KZT', minorUnits: 10, amount: 10 },
  ])('rejects non-canonical money %#', (candidate) => {
    expect(KztMoneySchema.safeParse(candidate).success).toBe(false);
  });

  it('accepts non-negative safe-integer KZT minor units', () => {
    expect(KztMoneySchema.parse({ currency: 'KZT', minorUnits: 25_000 })).toEqual({
      currency: 'KZT',
      minorUnits: 25_000,
    });
  });

  it('requires an IANA timezone rather than server-local calendar semantics', () => {
    expect(IanaTimeZoneSchema.parse('Asia/Almaty')).toBe('Asia/Almaty');
    expect(IanaTimeZoneSchema.safeParse('GMT+6').success).toBe(false);
  });

  it('preserves overlap symmetry across generated valid intervals', () => {
    for (let index = 0; index < 100; index += 1) {
      const left = TimeIntervalSchema.parse({
        startsAt: { seconds: index * 3, nanoseconds: index * 1_000 },
        endsAt: { seconds: index * 3 + 2, nanoseconds: index * 1_000 },
      });
      const right = TimeIntervalSchema.parse({
        startsAt: { seconds: index * 2, nanoseconds: 0 },
        endsAt: { seconds: index * 2 + 1, nanoseconds: 0 },
      });

      expect(intervalsOverlap(left, right)).toBe(intervalsOverlap(right, left));
    }
  });

  it('round-trips generated safe non-negative KZT amounts', () => {
    for (let index = 0; index < 100; index += 1) {
      const minorUnits = index * 97_531;
      expect(KztMoneySchema.parse({ currency: 'KZT', minorUnits })).toEqual({
        currency: 'KZT',
        minorUnits,
      });
    }
  });
});
