import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  CourseEnrollmentIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  ParticipantSchema,
  PaymentIdSchema,
  timestampFromDate,
} from '@ski-academy/shared-domain';
import {
  canonicalCourseDeliveryFixtures,
  canonicalPrimitiveFixtures,
} from '@ski-academy/shared-domain/testing';
import { queryCourseAttendanceReadModels } from './courseAttendanceReadModels';

function nestedValue(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (value, part) =>
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)[part]
        : undefined,
    data
  );
}

function attendanceFirestore(seed: Record<string, Record<string, unknown>>) {
  const reads = new Map<string, number>();
  const recordRead = (key: string) => reads.set(key, (reads.get(key) ?? 0) + 1);
  const collection = (path: string) => {
    const baseEntries = () =>
      Object.entries(seed).filter(([key]) => {
        if (!key.startsWith(`${path}/`)) return false;
        return key.slice(path.length + 1).split('/').length === 1;
      });
    const query = (
      filters: readonly { field: string; operator: string; value: unknown }[] = [],
      maximum?: number
    ): Record<string, unknown> => ({
      where: (field: string, operator: string, value: unknown) =>
        query([...filters, { field, operator, value }], maximum),
      orderBy: () => query(filters, maximum),
      startAfter: () => query(filters, maximum),
      limit: (value: number) => query(filters, value),
      get: async () => {
        recordRead(`query:${path}`);
        const entries = baseEntries().filter(([, data]) =>
          filters.every(({ field, operator, value }) => {
            const actual = nestedValue(data, field);
            if (operator === '==') return Object.is(actual, value);
            if (operator === 'in') return (value as readonly unknown[]).includes(actual);
            return false;
          })
        );
        const selected = maximum === undefined ? entries : entries.slice(0, maximum);
        return {
          docs: selected.map(([key, data]) => ({
            id: key.split('/').at(-1)!,
            data: () => data,
          })),
          empty: selected.length === 0,
          size: selected.length,
        };
      },
    });
    return {
      ...query(),
      doc: (id: string) => ({
        get: async () => {
          recordRead(`doc:${path}/${id}`);
          const data = seed[`${path}/${id}`];
          return { id, exists: data !== undefined, data: () => data };
        },
      }),
    };
  };
  return {
    firestore: { collection } as unknown as Firestore,
    reads,
  };
}

describe('course attendance read models', () => {
  it('loads one complete sparse Course attendance set instead of E x D point gets', async () => {
    const fixture = canonicalCourseDeliveryFixtures;
    const secondEnrollmentId = CourseEnrollmentIdSchema.parse('course_enrollment_fixture_02');
    const secondParticipantId = ParticipantIdSchema.parse('participant_fixture_02');
    const secondPaymentId = PaymentIdSchema.parse('payment_fixture_02');
    const secondEnrollment = {
      ...fixture.confirmedEnrollment,
      enrollmentId: secondEnrollmentId,
      participantId: secondParticipantId,
      paymentId: secondPaymentId,
      attendanceSummary: undefined,
    };
    const participant = (participantId: typeof secondParticipantId, displayName: string) =>
      ParticipantSchema.parse({
        participantId,
        displayName,
        age: { kind: 'age_years', years: 20 },
        skillLevel: 'beginner',
        discipline: 'ski',
        management: {
          kind: 'managed',
          participantManagementId: ParticipantManagementIdSchema.parse(
            `management_${participantId}`
          ),
        },
        lifecycle: { status: 'active' },
        revision: 1,
        createdAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
        updatedAt: timestampFromDate(new Date('2026-01-01T00:00:00.000Z')),
        audit: {
          createdByCommandId: 'seed',
          lastChangedByCommandId: 'seed',
          correlationId: canonicalPrimitiveFixtures.correlationId,
        },
      });

    const seed: Record<string, Record<string, unknown>> = {
      [`courses/${fixture.course.courseId}`]: fixture.course as unknown as Record<string, unknown>,
      ...Object.fromEntries(
        fixture.courseDays.map((day) => [
          `courses/${fixture.course.courseId}/days/${day.courseDayId}`,
          day as unknown as Record<string, unknown>,
        ])
      ),
      [`course_enrollments/${fixture.confirmedEnrollment.enrollmentId}`]:
        fixture.confirmedEnrollment as unknown as Record<string, unknown>,
      [`course_enrollments/${secondEnrollmentId}`]: secondEnrollment as unknown as Record<
        string,
        unknown
      >,
      [`participants/${fixture.confirmedEnrollment.participantId}`]: participant(
        fixture.confirmedEnrollment.participantId,
        'First participant'
      ) as unknown as Record<string, unknown>,
      [`participants/${secondParticipantId}`]: participant(
        secondParticipantId,
        'Second participant'
      ) as unknown as Record<string, unknown>,
      [`attendance/${fixture.presentCourseDayAttendance.attendanceId}`]:
        fixture.presentCourseDayAttendance as unknown as Record<string, unknown>,
      'attendance/other_course_noise': {
        subject: { subjectKind: 'course_enrollment', courseId: 'course_other' },
      },
    };
    const { firestore, reads } = attendanceFirestore(seed);

    const result = await queryCourseAttendanceReadModels(
      firestore,
      { scope: 'instructor_roster', courseId: fixture.course.courseId },
      {
        accountId: canonicalPrimitiveFixtures.accountId,
        instructorId: canonicalPrimitiveFixtures.instructorId,
      }
    );

    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.days.length === 2)).toBe(true);
    expect(result.items[0]?.days.map((day) => day.factualState)).toEqual([
      'present',
      'missing',
    ]);
    expect(result.items[1]?.days.map((day) => day.factualState)).toEqual([
      'missing',
      'missing',
    ]);
    expect(reads.get('query:attendance')).toBe(1);
    expect(
      [...reads.keys()].filter((key) => key.startsWith('doc:attendance/'))
    ).toHaveLength(0);
  });
});
