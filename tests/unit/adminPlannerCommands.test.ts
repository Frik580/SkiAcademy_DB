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
const queryIdentity = vi.fn();
const executeCanonical = vi.fn();

vi.mock('../../src/features/admin/lesson-bookings/useAdminLessonBookingCommands', () => ({
  executeAdminLessonBookingAttempt: (...args: unknown[]) => executeAttempt(...args),
}));

vi.mock('../../src/lib/canonical/canonicalReadModelClient', () => ({
  queryAdminIdentityReadModels: (...args: unknown[]) => queryIdentity(...args),
  queryLessonBookingReadModels: (...args: unknown[]) => queryLessonDetail(...args),
}));

vi.mock('../../src/lib/canonical/canonicalCommandClient', () => ({
  executeAuthenticatedCanonicalCommand: (...args: unknown[]) => executeCanonical(...args),
}));

import {
  changePlannerOccupancyDuration,
  completePlannerLesson,
  createPlannerOccupancyFromLegacyBookingShape,
  reassignPlannerOccupancy,
  reschedulePlannerOccupancy,
  resolvePlannerCreateParticipantChoice,
  selectPlannerSelfParticipantId,
} from '../../src/features/admin/operations/adminPlannerCommands';
import type { Booking } from '../../src/types';

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
const payerAccountId = AccountIdSchema.parse('account_planner_payer_01');
const adminAccountId = AccountIdSchema.parse('account_planner_admin_01');

const occupancyItem: AdminPlannerOccupancyItem = {
  occupancyKind: 'lesson_booking',
  occupancyId: bookingId,
  bookingId,
  instructorId,
  participantId,
  payerAccountId,
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

  it('does not guess the first Participant when an Account manages several people', () => {
    const dependent = participant('dependent', 'parent_guardian');
    const self = participant('self', 'self');

    expect(
      resolvePlannerCreateParticipantChoice({
        eligible: [dependent, self],
      })
    ).toEqual({ status: 'needs_explicit_selection' });
    expect(
      resolvePlannerCreateParticipantChoice({
        eligible: [dependent],
      })
    ).toEqual({ status: 'needs_explicit_selection' });
    expect(
      resolvePlannerCreateParticipantChoice({
        eligible: [self],
      })
    ).toEqual({ status: 'unique_self', participantId: self.participantId });
    expect(
      resolvePlannerCreateParticipantChoice({
        eligible: [dependent, self],
        selectedParticipantId: dependent.participantId,
      })
    ).toEqual({ status: 'selected', participantId: dependent.participantId });
  });
});

describe('Admin Planner sequential revision flow', () => {
  beforeEach(() => {
    executeAttempt.mockReset();
    queryLessonDetail.mockReset();
    queryIdentity.mockReset();
    executeCanonical.mockReset();
    executeAttempt.mockResolvedValue(undefined);
    executeCanonical.mockResolvedValue({ status: 'success' });
  });

  it('refetches a fresh booking revision between combined reschedule and instructor change', async () => {
    queryLessonDetail
      .mockResolvedValueOnce({
        scope: 'admin_detail',
        items: [{ bookingId, revision: 1, occurrence: { durationMinutes: 60 } }],
      })
      .mockResolvedValueOnce({
        scope: 'admin_detail',
        items: [{ bookingId, revision: 2, occurrence: { durationMinutes: 60 } }],
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
        durationMinutes: 60,
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

  it('reschedules a lesson using the duration from fresh detail, not a stale occupancy snapshot', async () => {
    queryLessonDetail.mockResolvedValue({
      scope: 'admin_detail',
      items: [{ bookingId, revision: 4, occurrence: { durationMinutes: 120 } }],
    });

    await reschedulePlannerOccupancy({
      adminAccountId,
      occupancy: [occupancyItem],
      occupancyId: bookingId,
      localDate: '2026-09-02',
      localTime: '11:00',
    });

    expect(executeAttempt).toHaveBeenCalledWith(
      adminAccountId,
      expect.objectContaining({
        kind: 'reschedule_booking',
        target: { bookingId, revision: 4 },
        durationMinutes: 120,
      })
    );
    expect(executeAttempt.mock.calls[0]?.[1]?.durationMinutes).not.toBe(
      occupancyItem.durationMinutes
    );
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

  it('loads a fresh revision before changing duration', async () => {
    queryLessonDetail.mockResolvedValue({
      scope: 'admin_detail',
      items: [
        {
          bookingId,
          revision: 7,
          occurrence: { durationMinutes: 60 },
        },
      ],
    });

    await changePlannerOccupancyDuration({
      adminAccountId,
      occupancy: [occupancyItem],
      occupancyId: bookingId,
      durationMinutes: 120,
    });

    expect(queryLessonDetail).toHaveBeenCalledWith({
      scope: 'admin_detail',
      bookingId,
    });
    expect(executeAttempt).toHaveBeenCalledWith(
      adminAccountId,
      expect.objectContaining({
        kind: 'change_booking_duration',
        target: { bookingId, revision: 7 },
        durationMinutes: 120,
      })
    );
  });

  it('uses a fresh revision for duration after a combined move and instructor change', async () => {
    queryLessonDetail
      .mockResolvedValueOnce({
        scope: 'admin_detail',
        items: [{ bookingId, revision: 1, occurrence: { durationMinutes: 60 } }],
      })
      .mockResolvedValueOnce({
        scope: 'admin_detail',
        items: [{ bookingId, revision: 2 }],
      })
      .mockResolvedValueOnce({
        scope: 'admin_detail',
        items: [{ bookingId, revision: 3, occurrence: { durationMinutes: 60 } }],
      });

    await reassignPlannerOccupancy({
      adminAccountId,
      occupancy: [occupancyItem],
      occupancyId: bookingId,
      instructor: nextInstructor,
      localDate: '2026-09-02',
      localTime: '11:00',
    });
    await changePlannerOccupancyDuration({
      adminAccountId,
      occupancy: [occupancyItem],
      occupancyId: bookingId,
      durationMinutes: 120,
    });

    expect(executeAttempt).toHaveBeenNthCalledWith(
      1,
      adminAccountId,
      expect.objectContaining({ kind: 'reschedule_booking', target: { bookingId, revision: 1 } })
    );
    expect(executeAttempt).toHaveBeenNthCalledWith(
      2,
      adminAccountId,
      expect.objectContaining({
        kind: 'change_booking_instructor',
        target: { bookingId, revision: 2 },
      })
    );
    expect(executeAttempt).toHaveBeenNthCalledWith(
      3,
      adminAccountId,
      expect.objectContaining({
        kind: 'change_booking_duration',
        target: { bookingId, revision: 3 },
        durationMinutes: 120,
      })
    );
  });
});

function lessonCreateBooking(
  overrides: Partial<Booking> & { participantId?: string } = {}
): Booking & { participantId?: string } {
  return {
    id: 'booking_planner_create_ui',
    userId: payerAccountId,
    instructorId,
    instructorName: 'Planner Instructor',
    instructorAvatar: '',
    date: '2026-09-02',
    time: '09:00',
    durationHours: 1,
    totalPrice: 0,
    status: 'confirmed',
    difficulty: 'beginner',
    ...overrides,
  };
}

describe('Admin Planner create participant selection', () => {
  beforeEach(() => {
    executeAttempt.mockReset();
    queryIdentity.mockReset();
    executeCanonical.mockReset();
    executeAttempt.mockResolvedValue(undefined);
    executeCanonical.mockResolvedValue({ status: 'success' });
  });

  it('creates with the Account self Participant when that is the selected identity', async () => {
    const self = participant('self', 'self');
    queryIdentity.mockResolvedValue({
      scope: 'admin_eligible_participants',
      items: [self],
    });

    await createPlannerOccupancyFromLegacyBookingShape({
      adminAccountId,
      booking: lessonCreateBooking({ participantId: self.participantId }),
    });

    expect(executeAttempt).toHaveBeenCalledWith(
      adminAccountId,
      expect.objectContaining({
        kind: 'create_confirmed_booking',
        participantIds: [self.participantId],
        payerAccountId,
        instructorId,
        localDate: '2026-09-02',
        localTime: '09:00',
        durationMinutes: 60,
      })
    );
  });

  it('creates with the selected managed Participant and the Account as payer', async () => {
    const dependent = participant('dependent', 'parent_guardian');
    const self = participant('self', 'self');
    queryIdentity.mockResolvedValue({
      scope: 'admin_eligible_participants',
      items: [dependent, self],
    });

    await createPlannerOccupancyFromLegacyBookingShape({
      adminAccountId,
      booking: lessonCreateBooking({ participantId: dependent.participantId }),
    });

    expect(executeAttempt).toHaveBeenCalledWith(
      adminAccountId,
      expect.objectContaining({
        kind: 'create_confirmed_booking',
        participantIds: [dependent.participantId],
        payerAccountId,
      })
    );
    expect(executeAttempt.mock.calls[0]?.[1]?.participantIds).not.toContain(self.participantId);
  });

  it('passes selected difficulty and notes through Planner create', async () => {
    const self = participant('self', 'self');
    queryIdentity.mockResolvedValue({
      scope: 'admin_eligible_participants',
      items: [self],
    });

    await createPlannerOccupancyFromLegacyBookingShape({
      adminAccountId,
      booking: lessonCreateBooking({
        participantId: self.participantId,
        difficulty: 'intermediate',
        notes: '  Carve on blue  ',
      }),
    });

    expect(executeAttempt).toHaveBeenCalledWith(
      adminAccountId,
      expect.objectContaining({
        kind: 'create_confirmed_booking',
        participantIds: [self.participantId],
        payerAccountId,
        difficulty: 'intermediate',
        notes: 'Carve on blue',
      })
    );
  });

  it('refuses to guess a Participant when several eligible people exist and none was selected', async () => {
    const dependent = participant('dependent', 'parent_guardian');
    const self = participant('self', 'self');
    queryIdentity.mockResolvedValue({
      scope: 'admin_eligible_participants',
      items: [dependent, self],
    });

    await expect(
      createPlannerOccupancyFromLegacyBookingShape({
        adminAccountId,
        booking: lessonCreateBooking(),
      })
    ).rejects.toThrow(/Select the Participant/);
    expect(executeAttempt).not.toHaveBeenCalled();
  });

  it('provisions a self Participant when the Account has no eligible people yet', async () => {
    const self = participant('self', 'self');
    queryIdentity
      .mockResolvedValueOnce({
        scope: 'admin_eligible_participants',
        items: [],
      })
      .mockResolvedValueOnce({
        scope: 'admin_eligible_participants',
        items: [self],
      });

    await createPlannerOccupancyFromLegacyBookingShape({
      adminAccountId,
      booking: lessonCreateBooking(),
    });

    expect(executeCanonical).toHaveBeenCalledWith(
      adminAccountId,
      expect.objectContaining({
        kind: 'provision_self_participant_for_account',
        intent: expect.objectContaining({ accountId: payerAccountId }),
      })
    );
    expect(executeAttempt).toHaveBeenCalledWith(
      adminAccountId,
      expect.objectContaining({
        kind: 'create_confirmed_booking',
        participantIds: [self.participantId],
        payerAccountId,
      })
    );
  });
});
