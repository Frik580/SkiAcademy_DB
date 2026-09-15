import { describe, expect, it } from 'vitest';
import type { AdminCourseEnrollmentRosterItem } from '@ski-academy/shared-domain';
import { courseEnrollmentListCardInput } from '../../src/features/admin/training-records/adminTrainingRecordPresentation';
import { resolveCourseEnrollmentInstructorLabel } from '../../src/features/admin/course-enrollments/adminCourseEnrollmentUtils';

const item: AdminCourseEnrollmentRosterItem = {
  enrollmentId: 'course_enrollment_card_01',
  revision: 1,
  course: {
    courseId: 'course_card_01',
    title: 'CARVE — Clean Carving',
    lifecycle: 'active',
    revision: 1,
  },
  participant: { participantId: 'participant_card_01', displayName: 'Тура' },
  lifecycleStatus: 'pending',
  guestState: 'pending_unlinked',
  payment: {
    paymentId: 'payment_card_01',
    status: 'unpaid',
    revision: 1,
    price: 10_000,
    paid: 0,
    refunded: 0,
    retained: 0,
    settled: 0,
    writtenOff: 0,
    outstanding: 10_000,
  },
  relatedIssues: [],
  authorizedActions: {
    canRecordPayment: true,
    canResolveCancellation: false,
    canTransfer: false,
    canReconcile: false,
    canResolveAttendanceOutcome: false,
    canCancelUnpaidGuest: false,
    canApproveGuest: false,
    canLinkGuest: false,
    canWithdraw: false,
  },
  updatedAt: { seconds: 1_788_000_000, nanoseconds: 0 },
};

describe('course enrollment list card presentation', () => {
  it('puts the course title in the subtitle and keeps raw lifecycle out of the row', () => {
    const row = courseEnrollmentListCardInput({
      item,
      kindLabel: 'Курс',
      primaryStatusLabel: 'Ожидает оплаты',
      originLabel: 'Гость',
      paymentStatusLabel: 'Не оплачено',
      instructor: 'Арсений',
    });
    expect(row.participantNames).toBe('Тура');
    expect(row.subtitle).toBe('CARVE — Clean Carving');
    expect(row.instructor).toBe('Арсений');
    expect(row.kindLabel).toBe('Курс');
    expect(row.primaryStatus).toBe('awaiting_payment');
    expect(row.time).toBeUndefined();
    expect(row.date).toBeUndefined();
    expect(JSON.stringify(row)).not.toMatch(/pending_unlinked|"pending"/);
  });
});

describe('resolveCourseEnrollmentInstructorLabel', () => {
  it('prefers catalog roster names over attendance ids', () => {
    expect(
      resolveCourseEnrollmentInstructorLabel({
        courseId: 'course_card_01',
        courses: [
          {
            courseId: 'course_card_01',
            title: 'CARVE — Clean Carving',
            revision: 1,
            availableSeats: 3,
            lifecycle: 'active',
            instructorNames: ['Арсений', 'Елена'],
          },
        ],
        instructorDirectory: [{ instructorId: 'instructor_other', displayName: 'Other Coach' }],
        attendanceInstructorIds: ['instructor_other'],
      })
    ).toBe('Арсений, Елена');
  });
});
