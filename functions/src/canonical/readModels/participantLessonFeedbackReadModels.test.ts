import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  AccountIdSchema,
  AttendanceSchema,
  BookingIdSchema,
  BookingSchema,
  InstructorIdSchema,
  OccurrenceIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  attendanceIdFromBookingIdentity,
  participantLessonFeedbackIdFromLessonParticipant,
  paymentIdFromBookingId,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  ParticipantLessonFeedbackReadDeniedError,
  queryParticipantLessonFeedbackReadModels,
} from './participantLessonFeedbackReadModels';

const accountId = AccountIdSchema.parse('account_feedback_read_01');
const otherAccountId = AccountIdSchema.parse('account_feedback_read_02');
const instructorAccountId = AccountIdSchema.parse('account_feedback_read_instructor');
const selfParticipantId = ParticipantIdSchema.parse('participant_feedback_read_self');
const childParticipantId = ParticipantIdSchema.parse('participant_feedback_read_child');
const otherParticipantId = ParticipantIdSchema.parse('participant_feedback_read_other');
const selfManagementId = ParticipantManagementIdSchema.parse('management_feedback_read_self');
const childManagementId = ParticipantManagementIdSchema.parse('management_feedback_read_child');
const otherManagementId = ParticipantManagementIdSchema.parse('management_feedback_read_other');
const instructorId = InstructorIdSchema.parse('instructor_feedback_read_01');
const lessonX = BookingIdSchema.parse('booking_feedback_read_x');
const lessonY = BookingIdSchema.parse('booking_feedback_read_y');
const occurrenceX = OccurrenceIdSchema.parse('occurrence_feedback_read_x');
const occurrenceY = OccurrenceIdSchema.parse('occurrence_feedback_read_y');
const decidedAt = timestampFromDate(new Date('2026-01-15T12:00:00.000Z'));
const lessonXStarts = timestampFromDate(new Date('2026-01-10T10:00:00.000Z'));
const lessonYStarts = timestampFromDate(new Date('2026-01-14T10:00:00.000Z'));
const metadata = {
  revision: 1,
  createdAt: decidedAt,
  updatedAt: decidedAt,
  audit: {
    createdByCommandId: 'command_feedback_read_fixture',
    lastChangedByCommandId: 'command_feedback_read_fixture',
    correlationId: 'correlation_feedback_read_fixture',
  },
};

function attendanceDoc(
  occurrenceId: typeof occurrenceX,
  bookingId: typeof lessonX,
  participant: ParticipantId,
  status: 'present' | 'absent'
) {
  const attendanceId = attendanceIdFromBookingIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'booking',
    occurrenceId,
    participantId: participant,
  });
  return [
    `attendance/${attendanceId}`,
    AttendanceSchema.parse({
      attendanceId,
      subject: {
        subjectKind: 'booking',
        bookingId,
        occurrenceId,
        participantId: participant,
      },
      attendanceStatus: status,
      recordedBy: { kind: 'instructor', instructorId },
      recordedAt: decidedAt,
      lastChangedBy: { kind: 'instructor', instructorId },
      updatedAt: decidedAt,
      revision: 1,
      correlationId: 'correlation_feedback_read_fixture',
    }),
  ] as const;
}

function feedbackDoc(
  participant: ParticipantId,
  lessonBookingId: typeof lessonX,
  startsAt: typeof lessonXStarts,
  text: string,
  updatedAt = decidedAt
) {
  const feedbackId = participantLessonFeedbackIdFromLessonParticipant({
    participantId: participant,
    lessonBookingId,
  });
  return [
    `participant_lesson_feedback/${feedbackId}`,
    {
      feedbackId,
      participantId: participant,
      lessonBookingId,
      instructorId,
      items: [{ itemId: 'item_a', text }],
      completedItemIds: [],
      revision: 1,
      createdAt: decidedAt,
      updatedAt,
      lessonStartsAt: startsAt,
      lessonDate: '2026-01-10',
      audit: metadata.audit,
    },
  ] as const;
}

function nestedValue(data: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, data);
}

function createFixtureFirestore(
  options: Readonly<{ omitFeedback?: boolean; omitSelfAttendance?: boolean }> = {}
): Firestore {
  const selfAttendance = attendanceDoc(occurrenceX, lessonX, selfParticipantId, 'present');
  const childAttendance = attendanceDoc(occurrenceX, lessonX, childParticipantId, 'absent');
  const selfFeedbackX = feedbackDoc(selfParticipantId, lessonX, lessonXStarts, 'Self X');
  const selfFeedbackY = feedbackDoc(selfParticipantId, lessonY, lessonYStarts, 'Self Y latest');
  const childFeedbackX = feedbackDoc(childParticipantId, lessonX, lessonXStarts, 'Child X');
  const otherFeedbackX = feedbackDoc(otherParticipantId, lessonX, lessonXStarts, 'Other X');

  const docs = new Map<string, Record<string, unknown>>([
    [`users/${accountId}`, { accountId, lifecycle: { status: 'active' }, ...metadata }],
    [
      `users/${otherAccountId}`,
      { accountId: otherAccountId, lifecycle: { status: 'active' }, ...metadata },
    ],
    [
      `users/${instructorAccountId}`,
      {
        accountId: instructorAccountId,
        lifecycle: { status: 'active' },
        instructorId,
        ...metadata,
      },
    ],
    [
      `participants/${selfParticipantId}`,
      {
        participantId: selfParticipantId,
        displayName: 'Self',
        age: { kind: 'age_years', years: 30 },
        skillLevel: 'intermediate',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: selfManagementId },
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
    [
      `participants/${childParticipantId}`,
      {
        participantId: childParticipantId,
        displayName: 'Child',
        age: { kind: 'age_years', years: 8 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: { kind: 'managed', participantManagementId: childManagementId },
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
    [
      `participants/${otherParticipantId}`,
      {
        participantId: otherParticipantId,
        displayName: 'Other',
        age: { kind: 'age_years', years: 22 },
        skillLevel: 'advanced',
        discipline: 'snowboard',
        management: { kind: 'managed', participantManagementId: otherManagementId },
        lifecycle: { status: 'active' },
        ...metadata,
      },
    ],
    [
      `participant_management/${selfManagementId}`,
      {
        participantManagementId: selfManagementId,
        accountId,
        participantId: selfParticipantId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        ...metadata,
      },
    ],
    [
      `participant_management/${childManagementId}`,
      {
        participantManagementId: childManagementId,
        accountId,
        participantId: childParticipantId,
        role: 'owner',
        authority: 'parent_guardian',
        status: 'active',
        ...metadata,
      },
    ],
    [
      `participant_management/${otherManagementId}`,
      {
        participantManagementId: otherManagementId,
        accountId: otherAccountId,
        participantId: otherParticipantId,
        role: 'owner',
        authority: 'self',
        status: 'active',
        ...metadata,
      },
    ],
    [
      `bookings/${lessonX}`,
      BookingSchema.parse({
        bookingId: lessonX,
        attribution: {
          bookingOrigin: 'admin',
          bookedBy: { kind: 'account', accountId },
        },
        party: {
          kind: 'family_group',
          participantIds: [selfParticipantId, childParticipantId],
        },
        occurrence: {
          occurrenceId: occurrenceX,
          instructorId,
          interval: {
            startsAt: lessonXStarts,
            endsAt: timestampFromDate(new Date('2026-01-10T11:00:00.000Z')),
          },
          timeZone: 'Asia/Almaty',
          scheduleRevision: 1,
          serviceParty: {
            participantIds: [selfParticipantId, childParticipantId],
            frozenAt: lessonXStarts,
          },
        },
        lifecycle: { status: 'completed', completedAt: decidedAt },
        paymentId: paymentIdFromBookingId(lessonX),
        ...metadata,
      }) as unknown as Record<string, unknown>,
    ],
    [
      `bookings/${lessonY}`,
      BookingSchema.parse({
        bookingId: lessonY,
        attribution: {
          bookingOrigin: 'admin',
          bookedBy: { kind: 'account', accountId },
        },
        party: { kind: 'individual', participantIds: [selfParticipantId] },
        occurrence: {
          occurrenceId: occurrenceY,
          instructorId,
          interval: {
            startsAt: lessonYStarts,
            endsAt: timestampFromDate(new Date('2026-01-14T11:00:00.000Z')),
          },
          timeZone: 'Asia/Almaty',
          scheduleRevision: 1,
          serviceParty: { participantIds: [selfParticipantId], frozenAt: lessonYStarts },
        },
        lifecycle: { status: 'completed', completedAt: decidedAt },
        paymentId: paymentIdFromBookingId(lessonY),
        ...metadata,
      }) as unknown as Record<string, unknown>,
    ],
    [selfAttendance[0], selfAttendance[1] as unknown as Record<string, unknown>],
    [childAttendance[0], childAttendance[1] as unknown as Record<string, unknown>],
    [selfFeedbackX[0], selfFeedbackX[1]],
    [selfFeedbackY[0], selfFeedbackY[1]],
    [childFeedbackX[0], childFeedbackX[1]],
    [otherFeedbackX[0], otherFeedbackX[1]],
  ]);

  if (options.omitFeedback) {
    docs.delete(selfFeedbackX[0]);
    docs.delete(selfFeedbackY[0]);
    docs.delete(childFeedbackX[0]);
    docs.delete(otherFeedbackX[0]);
  }
  if (options.omitSelfAttendance) {
    docs.delete(selfAttendance[0]);
  }

  const documentRef = (path: string) => ({
    id: path.split('/')[1],
    path,
    get: async () => {
      const data = docs.get(path);
      return {
        exists: data !== undefined,
        id: path.split('/')[1],
        data: () => data,
      };
    },
  });

  const query = (collectionName: string, filters: Array<{ field: string; value: unknown }>) => {
    const chain = {
      where: (field: string, _op: string, value: unknown) =>
        query(collectionName, [...filters, { field, value }]),
      orderBy: () => chain,
      limit: (count: number) => ({
        get: async () => {
          const matched = [...docs.entries()]
            .filter(([path]) => path.startsWith(`${collectionName}/`))
            .map(([path, data]) => ({ path, data }))
            .filter(({ data }) =>
              filters.every((filter) => nestedValue(data, filter.field) === filter.value)
            )
            .sort((left, right) => {
              const leftSeconds = Number(nestedValue(left.data, 'lessonStartsAt.seconds') ?? 0);
              const rightSeconds = Number(nestedValue(right.data, 'lessonStartsAt.seconds') ?? 0);
              return rightSeconds - leftSeconds;
            });
          return {
            docs: matched.slice(0, count).map(({ path, data }) => ({
              id: path.split('/')[1],
              data: () => data,
            })),
          };
        },
      }),
    };
    return chain;
  };

  return {
    getAll: async (...documentRefs: Array<{ get: () => Promise<unknown> }>) =>
      Promise.all(documentRefs.map((documentRefItem) => documentRefItem.get())),
    doc: (path: string) => documentRef(path),
    collection: (name: string) => ({
      doc: (id: string) => documentRef(`${name}/${id}`),
      where: (field: string, _op: string, value: unknown) => query(name, [{ field, value }]),
    }),
  } as unknown as Firestore;
}

describe('participant lesson feedback read models', () => {
  it('returns instructor_lesson feedback for the exact present Participant only', async () => {
    const result = await queryParticipantLessonFeedbackReadModels(
      createFixtureFirestore(),
      {
        scope: 'instructor_lesson',
        participantId: selfParticipantId,
        lessonBookingId: lessonX,
      },
      { accountId: instructorAccountId, instructorId }
    );
    expect(result.scope).toBe('instructor_lesson');
    if (result.scope === 'instructor_lesson') {
      expect(result.item?.participantId).toBe(selfParticipantId);
      expect(result.item?.lessonBookingId).toBe(lessonX);
      expect(result.item?.items[0]?.text).toBe('Self X');
      expect(result.item?.items[0]?.text).not.toBe('Child X');
    }
  });

  it('returns managed_participant history for self', async () => {
    const result = await queryParticipantLessonFeedbackReadModels(
      createFixtureFirestore(),
      { scope: 'managed_participant', participantIds: [selfParticipantId] },
      { accountId }
    );
    expect(result.scope).toBe('managed_participant');
    if (result.scope === 'managed_participant') {
      expect(result.items.map((item) => item.participantId)).toEqual([
        selfParticipantId,
        selfParticipantId,
      ]);
      expect(result.items.some((item) => item.participantId === childParticipantId)).toBe(false);
    }
  });

  it('returns managed_participant history for a dependent', async () => {
    const result = await queryParticipantLessonFeedbackReadModels(
      createFixtureFirestore(),
      { scope: 'managed_participant', participantIds: [childParticipantId] },
      { accountId }
    );
    expect(result.scope).toBe('managed_participant');
    if (result.scope === 'managed_participant') {
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.participantId).toBe(childParticipantId);
      expect(result.items[0]?.items[0]?.text).toBe('Child X');
    }
  });

  it('denies an unmanaged Account', async () => {
    await expect(
      queryParticipantLessonFeedbackReadModels(
        createFixtureFirestore(),
        { scope: 'managed_participant', participantIds: [selfParticipantId] },
        { accountId: otherAccountId }
      )
    ).rejects.toBeInstanceOf(ParticipantLessonFeedbackReadDeniedError);
  });

  it('returns managed_latest for the selected Participant only', async () => {
    const result = await queryParticipantLessonFeedbackReadModels(
      createFixtureFirestore(),
      { scope: 'managed_latest', participantId: selfParticipantId },
      { accountId }
    );
    expect(result.scope).toBe('managed_latest');
    if (result.scope === 'managed_latest') {
      expect(result.item?.lessonBookingId).toBe(lessonY);
      expect(result.item?.items[0]?.text).toBe('Self Y latest');
      expect(result.item?.participantId).toBe(selfParticipantId);
    }
  });

  it('never includes sibling B in A history', async () => {
    const result = await queryParticipantLessonFeedbackReadModels(
      createFixtureFirestore(),
      { scope: 'managed_participant', participantIds: [selfParticipantId] },
      { accountId }
    );
    if (result.scope === 'managed_participant') {
      expect(result.items.every((item) => item.participantId === selfParticipantId)).toBe(true);
      expect(result.items.some((item) => item.items[0]?.text === 'Child X')).toBe(false);
      expect(result.items.some((item) => item.items[0]?.text === 'Other X')).toBe(false);
    }
  });

  it('does not leak group-booking sibling feedback to instructor_lesson', async () => {
    await expect(
      queryParticipantLessonFeedbackReadModels(
        createFixtureFirestore(),
        {
          scope: 'instructor_lesson',
          participantId: childParticipantId,
          lessonBookingId: lessonX,
        },
        { accountId: instructorAccountId, instructorId }
      )
    ).rejects.toBeInstanceOf(ParticipantLessonFeedbackReadDeniedError);
  });

  it('does not fall back to leftover Booking recommendation fields', async () => {
    const result = await queryParticipantLessonFeedbackReadModels(
      createFixtureFirestore({ omitFeedback: true }),
      {
        scope: 'instructor_lesson',
        participantId: selfParticipantId,
        lessonBookingId: lessonX,
      },
      { accountId: instructorAccountId, instructorId }
    );
    if (result.scope === 'instructor_lesson') {
      expect(result.item?.items).toEqual([]);
      expect(result.item?.revision).toBe(0);
      expect(result.item).not.toHaveProperty('recommendations');
      expect(JSON.stringify(result.item)).not.toContain('Do not copy');
    }
  });

  it('returns a valid empty canonical start when no feedback exists', async () => {
    const result = await queryParticipantLessonFeedbackReadModels(
      createFixtureFirestore({ omitFeedback: true }),
      {
        scope: 'instructor_lesson',
        participantId: selfParticipantId,
        lessonBookingId: lessonX,
      },
      { accountId: instructorAccountId, instructorId }
    );
    if (result.scope === 'instructor_lesson') {
      expect(result.item).toMatchObject({
        participantId: selfParticipantId,
        lessonBookingId: lessonX,
        items: [],
        revision: 0,
      });
    }
  });

  it('denies instructor_lesson without present attendance', async () => {
    await expect(
      queryParticipantLessonFeedbackReadModels(
        createFixtureFirestore({ omitSelfAttendance: true }),
        {
          scope: 'instructor_lesson',
          participantId: selfParticipantId,
          lessonBookingId: lessonX,
        },
        { accountId: instructorAccountId, instructorId }
      )
    ).rejects.toBeInstanceOf(ParticipantLessonFeedbackReadDeniedError);
  });
});
