import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountIdSchema,
  BookingIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  ParticipantManagementIdSchema,
  timestampFromDate,
  type AdminEligibleParticipantItem,
  type AdminPlannerOccupancyItem,
} from '@ski-academy/shared-domain';
import type { Instructor } from '../../src/types';

const executeAttempt = vi.fn();
const queryLessonDetail = vi.fn();

vi.mock('../../src/features/admin/lesson-bookings/useAdminLessonBookingCommands', () => ({
  executeAdminLessonBookingAttempt: (...args: unknown[]) => executeAttempt(...args),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminIdentityReadModels: vi.fn(),
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonDetail(...args),
}));

import {
  completePlannerLesson,
  reassignPlannerOccupancy,
  selectPlannerSelfParticipantId,
} from '../../src/features/admin/operations/adminPlannerCommands';

function participant(
  suffix: string,
  authority: 'self' | 'parent_guardian'
): AdminEligibleParticipantItem {
  return {
    participantId: ParticipantIdSchema.parse(`participant_planner_${suffix}`),
    participantManagementId: ParticipantManagementIdSchema.parse(`management_planner_${suffix}`),
    displayName: suffix,
    authority,
    revision: 1,
    lifecycle: 'active',
  };
}

const bookingId = BookingIdSchema.parse('booking_planner_revision_01');
const instructorId = InstructorIdSchema.parse('instructor_planner_revision_01');
const nextInstructorId = InstructorIdSchema.parse('instructor_planner_revision_02');
const participantId = ParticipantIdSchema.parse('participant_planner_revision_01');
const adminAccountId = AccountIdSchema.parse('account_planner_admin_01');

const occupancyItem: AdminPlannerOccupancyItem = {
  occupancyKind: 'lesson_booking',
  occupancyId: bookingId,
  bookingId,
  instructorId,
  participantId,
  payerAccountId: AccountIdSchema.parse('account_planner_payer_01'),
  interval: {
    startsAt: timestampFromDate(new Date('2026-09-02T04:00:00.000Z')),
    endsAt: timestampFromDate(new Date('2026-09-02T05:00:00.000Z')),
  },
  timeZone: 'Asia/Almaty',
  localDate: '2026-09-02',
  localTime: '09:00',
  durationMinutes: 60,
  displayTitle: 'Canonical Participant',
  lifecycleStatus: 'confirmed',
  revision: 1,
};

const nextInstructor: Instructor = {
  id: nextInstructorId,
  name: 'Next Instructor',
  specialty: 'ski',
  rating: 0,
  reviewsCount: 0,
  languages: [],
  experienceYears: 0,
  bio: '',
  avatarUrl: '',
  pricePerHour: 12_000,
  isAvailable: true,
};

describe('Admin Planner command preparation', () => {
  it('selects the payer Account self Participant instead of an arbitrary managed dependent', () => {
    const dependent = participant('dependent', 'parent_guardian');
    const self = participant('self', 'self');

    expect(selectPlannerSelfParticipantId([dependent, self])).toBe(self.participantId);
    expect(selectPlannerSelfParticipantId([dependent])).toBeUndefined();
  });
});

describe('Admin Planner sequential revision flow', () => {
  beforeEach(() => {
    executeAttempt.mockReset();
    queryLessonDetail.mockReset();
    executeAttempt.mockResolvedValue(undefined);
  });

  it('refetches a fresh booking revision between combined reschedule and instructor change', async () => {
    queryLessonDetail.mockResolvedValue({
      scope: 'admin_detail',
      items: [{ bookingId, revision: 2 }],
    });

    await reassignPlannerOccupancy({
      adminAccountId,
      occupancy: [occupancyItem],
      occupancyId: bookingId,
      instructor: nextInstructor,
      localDate: '2026-09-02',
      localTime: '11:00',
    });

    expect(executeAttempt).toHaveBeenNthCalledWith(
      1,
      adminAccountId,
      expect.objectContaining({
        kind: 'reschedule_booking',
        target: { bookingId, revision: 1 },
      })
    );
    expect(queryLessonDetail).toHaveBeenCalledWith({
      scope: 'admin_detail',
      bookingId,
    });
    expect(executeAttempt).toHaveBeenNthCalledWith(
      2,
      adminAccountId,
      expect.objectContaining({
        kind: 'change_booking_instructor',
        target: { bookingId, revision: 2 },
        instructorId: nextInstructorId,
      })
    );
    expect(executeAttempt.mock.calls[1]?.[1]?.target?.revision).not.toBe(1);
  });

  it('refetches a fresh booking revision between attendance and completion outcome', async () => {
    queryLessonDetail
      .mockResolvedValueOnce({
        scope: 'admin_detail',
        items: [
          {
            bookingId,
            revision: 4,
            admin: {
              attendance: [{ participantId, attendanceStatus: 'unknown', revision: 1 }],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        scope: 'admin_detail',
        items: [
          {
            bookingId,
            revision: 5,
            admin: {
              attendance: [{ participantId, attendanceStatus: 'present', revision: 2 }],
            },
          },
        ],
      });

    await completePlannerLesson({
      adminAccountId,
      occupancy: [occupancyItem],
      occupancyId: bookingId,
    });

    expect(executeAttempt).toHaveBeenNthCalledWith(
      1,
      adminAccountId,
      expect.objectContaining({
        kind: 'record_booking_attendance',
        target: { bookingId, revision: 4 },
        participantId,
      })
    );
    expect(executeAttempt).toHaveBeenNthCalledWith(
      2,
      adminAccountId,
      expect.objectContaining({
        kind: 'resolve_attendance_outcome',
        target: { bookingId, revision: 5 },
      })
    );
    expect(executeAttempt.mock.calls[1]?.[1]?.target?.revision).not.toBe(4);
  });
});
