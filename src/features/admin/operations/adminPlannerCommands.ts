import {
  AccountIdSchema,
  AdministrativeAvailabilityBlockIdSchema,
  AggregateRevisionSchema,
  CourseDayIdSchema,
  CourseIdSchema,
  InstructorIdSchema,
  ParticipantIdSchema,
  type AdminEligibleParticipantItem,
  type AdminPlannerOccupancyItem,
  type BookingId,
  type CommandKind,
  type CommandResult,
} from '@ski-academy/shared-domain';
import { executeAuthenticatedCanonicalCommand } from '../../../lib/canonical/canonicalCommandClient';
import { queryAdminIdentityReadModels } from '../../../lib/canonical/canonicalReadModelClient';
import { mapCanonicalCommandResultError } from '../../../lib/canonical/mapCanonicalCommandError';
import {
  createAdminLessonBookingAttemptId,
  createAdminLogicalBookingId,
} from '../lesson-bookings/lessonBookingAdminUtils';
import { occupancyForId } from './adminPlannerMapping';
import { resolveAdminTimeZone } from './adminTimeZone';
import { executeAdminLessonBookingAttempt } from '../lesson-bookings/useAdminLessonBookingCommands';
import type { Booking, Instructor } from '../../../types';

async function assertSucceeded<Kind extends CommandKind>(
  command: Promise<CommandResult<Kind>>
): Promise<void> {
  const result = await command;
  const error = mapCanonicalCommandResultError(result);
  if (error) throw error;
}

function plannerIdempotency(action: string) {
  return createAdminLessonBookingAttemptId(action);
}

async function loadPlannerLessonDetail(bookingId: BookingId) {
  const { queryLessonBookingReadModels } =
    await import('../../../lib/canonical/canonicalReadModelClient');
  const detail = await queryLessonBookingReadModels({
    scope: 'admin_detail',
    bookingId,
  });
  return detail.scope === 'admin_detail' ? detail.items[0] : undefined;
}

function blockIdFromBooking(booking: Booking) {
  return AdministrativeAvailabilityBlockIdSchema.parse(
    booking.id.startsWith('block_') ? booking.id : `block_admin_${booking.id}`
  );
}

export function selectPlannerSelfParticipantId(
  items: readonly AdminEligibleParticipantItem[]
): string | undefined {
  return items.find((item) => item.authority === 'self')?.participantId;
}

export type PlannerCreateParticipantResolution =
  | { readonly status: 'selected'; readonly participantId: string }
  | { readonly status: 'unique_self'; readonly participantId: string }
  | { readonly status: 'provision_self' }
  | { readonly status: 'needs_explicit_selection' };

export function resolvePlannerCreateParticipantChoice(input: {
  readonly eligible: readonly AdminEligibleParticipantItem[];
  readonly selectedParticipantId?: string;
}): PlannerCreateParticipantResolution {
  if (input.selectedParticipantId) {
    const match = input.eligible.find((item) => item.participantId === input.selectedParticipantId);
    return match
      ? { status: 'selected', participantId: match.participantId }
      : { status: 'needs_explicit_selection' };
  }
  if (input.eligible.length === 0) return { status: 'provision_self' };
  const only = input.eligible[0];
  if (input.eligible.length === 1 && only?.authority === 'self') {
    return { status: 'unique_self', participantId: only.participantId };
  }
  return { status: 'needs_explicit_selection' };
}

async function loadEligibleParticipants(accountId: string) {
  const parsedAccountId = AccountIdSchema.parse(accountId);
  const result = await queryAdminIdentityReadModels({
    scope: 'admin_eligible_participants',
    accountId: parsedAccountId,
  });
  return result.scope === 'admin_eligible_participants' ? result.items : [];
}

async function provisionSelfParticipant(adminAccountId: string, accountId: string): Promise<string> {
  const parsedAccountId = AccountIdSchema.parse(accountId);
  await assertSucceeded(
    executeAuthenticatedCanonicalCommand(adminAccountId, {
      kind: 'provision_self_participant_for_account',
      intent: {
        accountId: parsedAccountId,
        reasonExplanation: 'Admin planner lesson creation requires a managed participant',
      },
      idempotencyKey: plannerIdempotency('provision_self'),
      administratorContext: true,
    })
  );
  const provisionedSelf = selectPlannerSelfParticipantId(await loadEligibleParticipants(accountId));
  if (!provisionedSelf) {
    throw new Error('No self Participant is available for the selected payer Account');
  }
  return provisionedSelf;
}

async function resolveCreateParticipant(input: {
  readonly adminAccountId: string;
  readonly accountId: string;
  readonly selectedParticipantId?: string;
}): Promise<string> {
  const eligible = await loadEligibleParticipants(input.accountId);
  const choice = resolvePlannerCreateParticipantChoice({
    eligible,
    ...(input.selectedParticipantId ? { selectedParticipantId: input.selectedParticipantId } : {}),
  });
  if (choice.status === 'selected' || choice.status === 'unique_self') {
    return choice.participantId;
  }
  if (choice.status === 'provision_self') {
    return provisionSelfParticipant(input.adminAccountId, input.accountId);
  }
  throw new Error('Select the Participant for this lesson');
}

async function resolvePayerParticipant(adminAccountId: string, accountId: string): Promise<string> {
  const existingSelf = selectPlannerSelfParticipantId(await loadEligibleParticipants(accountId));
  if (existingSelf) return existingSelf;
  return provisionSelfParticipant(adminAccountId, accountId);
}

export async function createPlannerOccupancyFromLegacyBookingShape(input: {
  readonly adminAccountId: string;
  readonly booking: Booking & { readonly participantId?: string };
}): Promise<void> {
  const timezone = resolveAdminTimeZone();
  const durationMinutes = Math.max(1, Math.round(input.booking.durationHours * 60));
  if (
    input.booking.userId === 'system_block_break' ||
    input.booking.userId === 'system_block_day_off'
  ) {
    await assertSucceeded(
      executeAuthenticatedCanonicalCommand(input.adminAccountId, {
        kind: 'create_administrative_availability_block',
        intent: {
          blockId: blockIdFromBooking(input.booking),
          instructorId: InstructorIdSchema.parse(input.booking.instructorId),
          kind: input.booking.userId === 'system_block_day_off' ? 'day_off' : 'break',
          ...(input.booking.notes ? { notes: input.booking.notes } : {}),
          reasonExplanation: 'Admin planner availability block',
        },
        idempotencyKey: plannerIdempotency('create_block'),
        calendarInput: {
          localDate: input.booking.date,
          localTime: input.booking.time,
          durationMinutes,
        },
        timezone,
        administratorContext: true,
      })
    );
    return;
  }

  const participantId = await resolveCreateParticipant({
    adminAccountId: input.adminAccountId,
    accountId: input.booking.userId,
    ...(input.booking.participantId ? { selectedParticipantId: input.booking.participantId } : {}),
  });
  await executeAdminLessonBookingAttempt(input.adminAccountId, {
    kind: 'create_confirmed_booking',
    idempotencyKey: plannerIdempotency('create_lesson'),
    bookingId: createAdminLogicalBookingId(),
    instructorId: input.booking.instructorId,
    participantIds: [participantId],
    payerAccountId: input.booking.userId,
    localDate: input.booking.date,
    localTime: input.booking.time,
    durationMinutes,
    timezone,
    reasonExplanation: 'Admin planner confirmed lesson',
    ...(input.booking.difficulty ? { difficulty: input.booking.difficulty } : {}),
    ...(input.booking.notes?.trim() ? { notes: input.booking.notes.trim() } : {}),
  });
}

export async function reschedulePlannerOccupancy(input: {
  readonly adminAccountId: string;
  readonly occupancy: readonly AdminPlannerOccupancyItem[];
  readonly occupancyId: string;
  readonly localDate: string;
  readonly localTime: string;
}): Promise<void> {
  const item = occupancyForId(input.occupancy, input.occupancyId);
  if (!item || item.revision === undefined) {
    throw new Error('Planner occupancy is stale or missing');
  }
  const timezone = item.timeZone || resolveAdminTimeZone();
  if (item.occupancyKind === 'availability_block' && item.blockId) {
    await assertSucceeded(
      executeAuthenticatedCanonicalCommand(input.adminAccountId, {
        kind: 'reschedule_administrative_availability_block',
        intent: {
          blockId: AdministrativeAvailabilityBlockIdSchema.parse(item.blockId),
          reasonExplanation: 'Admin planner reschedule availability block',
        },
        idempotencyKey: plannerIdempotency('reschedule_block'),
        expectedRevision: AggregateRevisionSchema.parse(item.revision),
        calendarInput: {
          localDate: input.localDate,
          localTime: input.localTime,
          durationMinutes: item.durationMinutes,
        },
        timezone,
        administratorContext: true,
      })
    );
    return;
  }
  if (item.occupancyKind === 'course_day' && item.courseId && item.courseDayId) {
    await assertSucceeded(
      executeAuthenticatedCanonicalCommand(input.adminAccountId, {
        kind: 'reschedule_course_day',
        intent: {
          courseId: CourseIdSchema.parse(item.courseId),
          courseDayId: CourseDayIdSchema.parse(item.courseDayId),
          expectedCourseDayRevision: AggregateRevisionSchema.parse(item.revision),
          reasonExplanation: 'Admin planner reschedule CourseDay',
        },
        idempotencyKey: plannerIdempotency('reschedule_course_day'),
        expectedRevision: AggregateRevisionSchema.parse(item.courseRevision ?? item.revision),
        calendarInput: {
          localDate: input.localDate,
          localTime: input.localTime,
          durationMinutes: item.durationMinutes,
        },
        timezone,
        administratorContext: true,
      })
    );
    return;
  }
  if (!item.bookingId) throw new Error('Lesson occupancy is missing a booking id');
  const booking = await loadPlannerLessonDetail(item.bookingId);
  if (!booking) throw new Error('Lesson detail is required to reschedule');
  await executeAdminLessonBookingAttempt(input.adminAccountId, {
    kind: 'reschedule_booking',
    idempotencyKey: plannerIdempotency('reschedule_lesson'),
    target: { bookingId: item.bookingId, revision: booking.revision },
    localDate: input.localDate,
    localTime: input.localTime,
    durationMinutes: booking.occurrence.durationMinutes,
    timezone,
    reasonExplanation: 'Admin planner reschedule lesson',
  });
}

export async function reassignPlannerOccupancy(input: {
  readonly adminAccountId: string;
  readonly occupancy: readonly AdminPlannerOccupancyItem[];
  readonly occupancyId: string;
  readonly instructor: Instructor;
  readonly localDate?: string;
  readonly localTime?: string;
}): Promise<void> {
  const item = occupancyForId(input.occupancy, input.occupancyId);
  if (!item || item.revision === undefined) {
    throw new Error('Planner occupancy is stale or missing');
  }
  const scheduleChanged =
    (input.localDate !== undefined && input.localDate !== item.localDate) ||
    (input.localTime !== undefined && input.localTime !== item.localTime);
  if (scheduleChanged) {
    await reschedulePlannerOccupancy({
      adminAccountId: input.adminAccountId,
      occupancy: input.occupancy,
      occupancyId: input.occupancyId,
      localDate: input.localDate ?? item.localDate,
      localTime: input.localTime ?? item.localTime,
    });
  }
  if (item.occupancyKind === 'course_day' && item.courseId && item.courseDayId) {
    await assertSucceeded(
      executeAuthenticatedCanonicalCommand(input.adminAccountId, {
        kind: 'reassign_course_day_instructor',
        intent: {
          courseId: CourseIdSchema.parse(item.courseId),
          courseDayId: CourseDayIdSchema.parse(item.courseDayId),
          instructorId: InstructorIdSchema.parse(input.instructor.id),
          reasonExplanation: 'Admin planner reassign CourseDay instructor',
        },
        idempotencyKey: plannerIdempotency('reassign_course_day'),
        expectedRevision: AggregateRevisionSchema.parse(item.revision),
        administratorContext: true,
      })
    );
    return;
  }
  if (item.occupancyKind === 'availability_block') {
    return;
  }
  if (!item.bookingId) throw new Error('Lesson occupancy is missing a booking id');
  let bookingRevision = item.revision;
  if (scheduleChanged) {
    const refreshedBooking = await loadPlannerLessonDetail(item.bookingId);
    if (!refreshedBooking) {
      throw new Error('Lesson detail is unavailable after rescheduling');
    }
    bookingRevision = refreshedBooking.revision;
  }
  await executeAdminLessonBookingAttempt(input.adminAccountId, {
    kind: 'change_booking_instructor',
    idempotencyKey: plannerIdempotency('reassign_lesson'),
    target: { bookingId: item.bookingId, revision: bookingRevision },
    instructorId: input.instructor.id,
    reasonExplanation: 'Admin planner reassign lesson instructor',
  });
}

export async function changePlannerOccupancyDuration(input: {
  readonly adminAccountId: string;
  readonly occupancy: readonly AdminPlannerOccupancyItem[];
  readonly occupancyId: string;
  readonly durationMinutes: number;
}): Promise<void> {
  const item = occupancyForId(input.occupancy, input.occupancyId);
  if (!item?.bookingId || item.occupancyKind !== 'lesson_booking') {
    throw new Error('Only lesson bookings can change duration from the planner');
  }
  const booking = await loadPlannerLessonDetail(item.bookingId);
  if (!booking) {
    throw new Error('Lesson detail is required to change duration');
  }
  if (booking.occurrence.durationMinutes === input.durationMinutes) return;
  await executeAdminLessonBookingAttempt(input.adminAccountId, {
    kind: 'change_booking_duration',
    idempotencyKey: plannerIdempotency('duration_lesson'),
    target: { bookingId: item.bookingId, revision: booking.revision },
    durationMinutes: input.durationMinutes,
    reasonExplanation: 'Admin planner change lesson duration',
  });
}

export async function releasePlannerOccupancy(input: {
  readonly adminAccountId: string;
  readonly occupancy: readonly AdminPlannerOccupancyItem[];
  readonly occupancyId: string;
}): Promise<void> {
  const item = occupancyForId(input.occupancy, input.occupancyId);
  if (!item || item.revision === undefined) {
    throw new Error('Planner occupancy is stale or missing');
  }
  if (item.occupancyKind === 'availability_block' && item.blockId) {
    await assertSucceeded(
      executeAuthenticatedCanonicalCommand(input.adminAccountId, {
        kind: 'release_administrative_availability_block',
        intent: {
          blockId: AdministrativeAvailabilityBlockIdSchema.parse(item.blockId),
          reasonExplanation: 'Admin planner release availability block',
        },
        idempotencyKey: plannerIdempotency('release_block'),
        expectedRevision: AggregateRevisionSchema.parse(item.revision),
        administratorContext: true,
      })
    );
    return;
  }
  if (item.occupancyKind === 'course_day') {
    throw new Error('CourseDay occupancy is not deleted from the planner');
  }
  if (!item.bookingId) throw new Error('Lesson occupancy is missing a booking id');
  const booking = await loadPlannerLessonDetail(item.bookingId);
  const payment = booking?.admin?.payment;
  await executeAdminLessonBookingAttempt(input.adminAccountId, {
    kind: 'resolve_booking_cancellation',
    idempotencyKey: plannerIdempotency('cancel_lesson'),
    target: { bookingId: item.bookingId, revision: booking?.revision ?? item.revision },
    paymentId: payment?.paymentId ?? 'payment_unknown',
    paymentRevision: payment?.revision,
    decision: 'direct_cancel',
    refundAmount: booking?.admin?.cancellationFinancial.maximumRefund ?? 0,
    reasonExplanation: 'Admin planner cancellation',
  });
}

export async function completePlannerLesson(input: {
  readonly adminAccountId: string;
  readonly occupancy: readonly AdminPlannerOccupancyItem[];
  readonly occupancyId: string;
}): Promise<void> {
  const item = occupancyForId(input.occupancy, input.occupancyId);
  if (!item?.bookingId || item.revision === undefined) {
    throw new Error('Only lesson bookings can be completed from the planner');
  }
  let booking = await loadPlannerLessonDetail(item.bookingId);
  if (!booking?.admin) {
    throw new Error('Lesson detail is required for attendance-driven completion');
  }
  const pendingAttendance = booking.admin.attendance.filter(
    (attendance) => attendance.attendanceStatus !== 'present'
  );
  for (const attendance of pendingAttendance) {
    await executeAdminLessonBookingAttempt(input.adminAccountId, {
      kind: 'record_booking_attendance',
      idempotencyKey: plannerIdempotency(`attendance_${attendance.participantId}`),
      target: { bookingId: booking.bookingId, revision: booking.revision },
      participantId: ParticipantIdSchema.parse(attendance.participantId),
      attendanceStatus: 'present',
      ...(attendance.revision === undefined
        ? {}
        : { expectedAttendanceRevision: attendance.revision }),
      reasonExplanation: 'Admin planner attendance completion',
    });
    const refreshed = await loadPlannerLessonDetail(item.bookingId);
    if (!refreshed?.admin) {
      throw new Error('Lesson detail is unavailable after recording attendance');
    }
    booking = refreshed;
  }
  await executeAdminLessonBookingAttempt(input.adminAccountId, {
    kind: 'resolve_attendance_outcome',
    idempotencyKey: plannerIdempotency('complete_lesson'),
    target: { bookingId: booking.bookingId, revision: booking.revision },
  });
}

export async function linkPlannerGuestBooking(input: {
  readonly adminAccountId: string;
  readonly occupancy: readonly AdminPlannerOccupancyItem[];
  readonly occupancyId: string;
  readonly targetAccountId: string;
}): Promise<void> {
  const item = occupancyForId(input.occupancy, input.occupancyId);
  if (!item?.bookingId || item.revision === undefined) {
    throw new Error('Guest linking is only available for lesson bookings');
  }
  const participantId = await resolvePayerParticipant(input.adminAccountId, input.targetAccountId);
  await executeAdminLessonBookingAttempt(input.adminAccountId, {
    kind: 'link_guest_booking_to_account_as_administrator',
    idempotencyKey: plannerIdempotency('link_guest'),
    target: { bookingId: item.bookingId, revision: item.revision },
    targetAccountId: input.targetAccountId,
    targetParticipantId: ParticipantIdSchema.parse(participantId),
    targetParticipantDisplayName: input.targetAccountId,
    reasonExplanation: 'Admin planner guest identity link',
  });
}
