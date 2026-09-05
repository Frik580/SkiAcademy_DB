import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AccountIdSchema,
  CourseEnrollmentIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  PaymentIdSchema,
} from '@ski-academy/shared-domain';
import { createReadModelRequestContext } from './readModelRequestContext';

const ATTENDANCES_FOR_ENROLLMENTS_CONTRACT_VIOLATION =
  'ReadModelRequestContext.attendancesForEnrollments internal contract violation: enrollmentIds must be non-empty and at most 30';

function enrollmentId(suffix: string) {
  return CourseEnrollmentIdSchema.parse(`course_enrollment_${suffix}`);
}

function countingFirestore() {
  const reads = new Map<string, number>();
  const count = (key: string) => reads.set(key, (reads.get(key) ?? 0) + 1);

  const collection = (path: string) => {
    const query = {
      where: () => query,
      limit: () => query,
      get: async () => {
        count(`query:${path}`);
        await Promise.resolve();
        return { docs: [], empty: true, size: 0 };
      },
    };
    return {
      ...query,
      doc: (id: string) => ({
        get: async () => {
          count(`doc:${path}/${id}`);
          await Promise.resolve();
          return { id, exists: true, data: () => ({ id }) };
        },
      }),
    };
  };

  const firestore = {
    collection,
    doc: (path: string) => ({
      get: async () => {
        count(`doc:${path}`);
        await Promise.resolve();
        return { id: path.split('/').at(-1), exists: true, data: () => ({}) };
      },
    }),
  } as unknown as Firestore;

  return { firestore, reads };
}

describe('ReadModelRequestContext', () => {
  it('memoizes concurrent semantic document and CourseDays reads by exact id', async () => {
    const { firestore, reads } = countingFirestore();
    const context = createReadModelRequestContext(firestore);
    const instructorId = InstructorIdSchema.parse('instructor_request_memo_same');
    const actorId = AccountIdSchema.parse('account_request_memo_actor');
    const payerId = AccountIdSchema.parse('account_request_memo_payer');
    const courseId = CourseIdSchema.parse('course_request_memo_same');

    await Promise.all(Array.from({ length: 10 }, () => context.instructor(instructorId)));
    await Promise.all(Array.from({ length: 20 }, () => context.account(actorId)));
    await Promise.all(Array.from({ length: 6 }, () => context.course(courseId)));
    await Promise.all(Array.from({ length: 6 }, () => context.courseDays(courseId)));
    await Promise.all(Array.from({ length: 8 }, () => context.account(payerId)));

    expect(reads.get(`doc:instructors/${instructorId}`)).toBe(1);
    expect(reads.get(`doc:users/${actorId}`)).toBe(1);
    expect(reads.get(`doc:courses/${courseId}`)).toBe(1);
    expect(reads.get(`query:courses/${courseId}/days`)).toBe(1);
    expect(reads.get(`doc:users/${payerId}`)).toBe(1);
  });

  it('keeps different ids separate and discards memoized Promises between requests', async () => {
    const { firestore, reads } = countingFirestore();
    const firstInstructorId = InstructorIdSchema.parse('instructor_request_memo_first');
    const secondInstructorId = InstructorIdSchema.parse('instructor_request_memo_second');
    const paymentId = PaymentIdSchema.parse('payment_request_memo_same');

    const requestOne = createReadModelRequestContext(firestore);
    await Promise.all([
      requestOne.instructor(firstInstructorId),
      requestOne.instructor(secondInstructorId),
      requestOne.payment(paymentId),
      requestOne.payment(paymentId),
    ]);

    const requestTwo = createReadModelRequestContext(firestore);
    await requestTwo.instructor(firstInstructorId);
    await requestTwo.payment(paymentId);

    expect(reads.get(`doc:instructors/${firstInstructorId}`)).toBe(2);
    expect(reads.get(`doc:instructors/${secondInstructorId}`)).toBe(1);
    expect(reads.get(`doc:payments/${paymentId}`)).toBe(2);
  });

  it('rejects empty and oversized enrollment id batches for attendancesForEnrollments', async () => {
    const { firestore, reads } = countingFirestore();
    const context = createReadModelRequestContext(firestore);
    const thirty = Array.from({ length: 30 }, (_, index) =>
      enrollmentId(`batch_${String(index).padStart(2, '0')}`)
    );
    const thirtyOne = [...thirty, enrollmentId('batch_30')];

    expect(() => context.attendancesForEnrollments([])).toThrow(
      ATTENDANCES_FOR_ENROLLMENTS_CONTRACT_VIOLATION
    );
    expect(() => context.attendancesForEnrollments(thirtyOne)).toThrow(
      ATTENDANCES_FOR_ENROLLMENTS_CONTRACT_VIOLATION
    );

    await context.attendancesForEnrollments(thirty);
    expect(reads.get('query:attendance')).toBe(1);
  });

  it('reuses request-local attendance batch memo for the same id set in any order', async () => {
    const { firestore, reads } = countingFirestore();
    const context = createReadModelRequestContext(firestore);
    const a = enrollmentId('memo_a');
    const b = enrollmentId('memo_b');
    const c = enrollmentId('memo_c');

    await context.attendancesForEnrollments([a, b, c]);
    await context.attendancesForEnrollments([c, a, b]);

    expect(reads.get('query:attendance')).toBe(1);
  });

  it('does not reuse attendance batch memo across request contexts', async () => {
    const { firestore, reads } = countingFirestore();
    const a = enrollmentId('cross_a');
    const b = enrollmentId('cross_b');
    const c = enrollmentId('cross_c');

    const requestOne = createReadModelRequestContext(firestore);
    await requestOne.attendancesForEnrollments([a, b, c]);

    const requestTwo = createReadModelRequestContext(firestore);
    await requestTwo.attendancesForEnrollments([c, a, b]);

    expect(reads.get('query:attendance')).toBe(2);
  });
});
