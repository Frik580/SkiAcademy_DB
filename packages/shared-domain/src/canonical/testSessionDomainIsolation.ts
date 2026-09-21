import type { CommandKind } from './commands/commandKinds';
import {
  assertSameCanonicalScope,
  PersistedCanonicalScopeError,
  type CanonicalExecutionScope,
} from './canonicalScope';
import type { ParticipantId } from './identifiers';

export const TEST_SESSION_RESOURCE_CLASSIFICATIONS = [
  'SAME_SCOPE_REQUIRED',
  'SHARED_READ_ONLY_REFERENCE_ALLOWED',
  'FORBIDDEN',
] as const;

export type TestSessionResourceClassification =
  (typeof TEST_SESSION_RESOURCE_CLASSIFICATIONS)[number];

/**
 * Mutable aggregates participating in one operation must share compatible scope.
 * Shared read-only references may be read from LIVE while executing TEST.
 */
export const TEST_SESSION_RESOURCE_CLASSIFICATION = {
  Wallet: 'SAME_SCOPE_REQUIRED',
  Payment: 'SAME_SCOPE_REQUIRED',
  MonetaryEvent: 'SAME_SCOPE_REQUIRED',
  Course: 'SAME_SCOPE_REQUIRED',
  CourseDay: 'SAME_SCOPE_REQUIRED',
  CourseEnrollment: 'SAME_SCOPE_REQUIRED',
  CourseCatalogContent: 'SAME_SCOPE_REQUIRED',
  Attendance: 'SAME_SCOPE_REQUIRED',
  ParticipantProgress: 'SAME_SCOPE_REQUIRED',
  ParticipantAchievements: 'SAME_SCOPE_REQUIRED',
  ParticipantLessonFeedback: 'SAME_SCOPE_REQUIRED',
  InstructorReview: 'SAME_SCOPE_REQUIRED',
  InstructorRatingSummary: 'SAME_SCOPE_REQUIRED',
  Booking: 'SAME_SCOPE_REQUIRED',
  BookingProposal: 'SAME_SCOPE_REQUIRED',
  BookingChangeRequest: 'SAME_SCOPE_REQUIRED',
  homeworkForParticipantIds: 'SAME_SCOPE_REQUIRED',
  course_chat_access: 'SAME_SCOPE_REQUIRED',
  Participant: 'SAME_SCOPE_REQUIRED',
  InstructorCatalog: 'SAME_SCOPE_REQUIRED',
  TestActorAccount: 'SAME_SCOPE_REQUIRED',
  skillDefinitions: 'SHARED_READ_ONLY_REFERENCE_ALLOWED',
  achievementDefinitions: 'SHARED_READ_ONLY_REFERENCE_ALLOWED',
  lessonPricingSettingsRead: 'SHARED_READ_ONLY_REFERENCE_ALLOWED',
  resortConfig: 'SHARED_READ_ONLY_REFERENCE_ALLOWED',
  liveCourseCloneTemplate: 'SHARED_READ_ONLY_REFERENCE_ALLOWED',
  settingsStarterCredit: 'FORBIDDEN',
  liveWalletAsTestPayer: 'FORBIDDEN',
  liveCourseCapacity: 'FORBIDDEN',
  liveInstructorOccupancyOrRating: 'FORBIDDEN',
  liveParticipantProgress: 'FORBIDDEN',
  liveHomeworkTarget: 'FORBIDDEN',
} as const satisfies Record<string, TestSessionResourceClassification>;

export const TEST_COMMAND_SUPPORT_STATES = [
  'TEST_SUPPORTED',
  'TEST_FORBIDDEN',
  'T42B-4_DEFERRED',
  'T42B-5_DEFERRED',
  'T42B-8_DEFERRED',
  'T43_DEFERRED',
] as const;

export type TestCommandSupportState = (typeof TEST_COMMAND_SUPPORT_STATES)[number];

/**
 * Exhaustive TEST support matrix. Unknown command kinds cannot default to allowed.
 * T42B-5 has no write commands; read isolation remains deferred.
 */
export const TEST_SESSION_COMMAND_SUPPORT = {
  create_confirmed_booking: 'TEST_SUPPORTED',
  create_guest_booking_request: 'T43_DEFERRED',
  confirm_guest_booking: 'T43_DEFERRED',
  confirm_guest_course_enrollment: 'T43_DEFERRED',
  link_guest_booking_to_account: 'T43_DEFERRED',
  link_guest_booking_to_account_as_administrator: 'T43_DEFERRED',
  request_booking_cancellation: 'TEST_SUPPORTED',
  withdraw_booking_cancellation_request: 'TEST_SUPPORTED',
  resolve_booking_cancellation: 'TEST_SUPPORTED',
  reschedule_booking: 'TEST_SUPPORTED',
  change_booking_instructor: 'TEST_SUPPORTED',
  change_booking_duration: 'TEST_SUPPORTED',
  change_booking_party: 'TEST_SUPPORTED',
  rollback_unpaid_booking_party_additions: 'TEST_SUPPORTED',
  record_booking_attendance: 'TEST_SUPPORTED',
  record_course_day_attendance: 'TEST_SUPPORTED',
  complete_booking: 'TEST_SUPPORTED',
  record_booking_no_show: 'TEST_SUPPORTED',
  create_instructor_review: 'TEST_SUPPORTED',
  update_participant_progress: 'TEST_SUPPORTED',
  record_participant_achievements: 'TEST_SUPPORTED',
  save_participant_lesson_feedback: 'TEST_SUPPORTED',
  set_participant_lesson_feedback_item_completion: 'TEST_SUPPORTED',
  create_course_enrollments: 'TEST_SUPPORTED',
  transfer_course_enrollment: 'TEST_SUPPORTED',
  withdraw_course_enrollment: 'TEST_SUPPORTED',
  request_course_enrollment_cancellation: 'TEST_SUPPORTED',
  resolve_course_enrollment_cancellation: 'TEST_SUPPORTED',
  create_booking_proposal: 'TEST_SUPPORTED',
  accept_booking_proposal: 'TEST_SUPPORTED',
  cancel_booking_proposal: 'TEST_SUPPORTED',
  expire_booking_proposal: 'TEST_SUPPORTED',
  create_booking_change_request: 'TEST_SUPPORTED',
  withdraw_booking_change_request: 'TEST_SUPPORTED',
  resolve_booking_change_request: 'TEST_SUPPORTED',
  expire_guest_reservation: 'T43_DEFERRED',
  finalize_booking_attendance: 'TEST_SUPPORTED',
  enforce_payment_start_gate: 'TEST_SUPPORTED',
  resolve_attendance_outcome: 'TEST_SUPPORTED',
  provision_self_participant: 'T42B-8_DEFERRED',
  create_participant: 'T42B-8_DEFERRED',
  update_participant_profile: 'T42B-8_DEFERRED',
  assign_participant_management: 'T42B-8_DEFERRED',
  revoke_participant_management: 'T42B-8_DEFERRED',
  create_instructor_relationship: 'T42B-8_DEFERRED',
  revoke_instructor_relationship: 'T42B-8_DEFERRED',
  block_participant: 'T42B-8_DEFERRED',
  unblock_participant: 'T42B-8_DEFERRED',
  disable_account: 'T42B-8_DEFERRED',
  enable_account: 'T42B-8_DEFERRED',
  archive_participant: 'T42B-8_DEFERRED',
  reactivate_participant: 'T42B-8_DEFERRED',
  assign_participant_management_as_administrator: 'T42B-8_DEFERRED',
  create_managed_dependent_participant: 'T42B-8_DEFERRED',
  provision_self_participant_for_account: 'T42B-8_DEFERRED',
  change_account_role: 'T42B-8_DEFERRED',
  update_lesson_pricing_settings: 'TEST_FORBIDDEN',
  update_account_contact_as_administrator: 'T42B-8_DEFERRED',
  update_own_account_contact: 'T42B-8_DEFERRED',
  create_instructor_catalog_entry: 'T42B-8_DEFERRED',
  update_instructor_catalog_profile: 'T42B-8_DEFERRED',
  deactivate_instructor_catalog: 'T42B-8_DEFERRED',
  reactivate_instructor_catalog: 'T42B-8_DEFERRED',
  link_account_instructor_catalog: 'T42B-8_DEFERRED',
  unlink_account_instructor_catalog: 'T42B-8_DEFERRED',
  delete_instructor_catalog_entry: 'T42B-8_DEFERRED',
  repair_participant_management_owner_guard: 'T42B-8_DEFERRED',
  record_provider_payment_event: 'TEST_SUPPORTED',
  pay_service_from_wallet_as_administrator: 'TEST_SUPPORTED',
  record_manual_wallet_funding: 'TEST_SUPPORTED',
  grant_starter_credit: 'TEST_FORBIDDEN',
  adjust_service_price: 'TEST_SUPPORTED',
  record_financial_correction: 'TEST_SUPPORTED',
  record_audit_correction: 'TEST_FORBIDDEN',
  create_course_day: 'TEST_SUPPORTED',
  reassign_course_day_instructor: 'TEST_SUPPORTED',
  provision_canonical_course: 'TEST_FORBIDDEN',
  apply_canonical_course_provisioning_manifest: 'TEST_FORBIDDEN',
  change_course_title: 'TEST_SUPPORTED',
  change_course_price: 'TEST_SUPPORTED',
  change_course_capacity: 'TEST_SUPPORTED',
  archive_course: 'TEST_SUPPORTED',
  reactivate_course: 'TEST_SUPPORTED',
  add_course_roster_instructor: 'TEST_SUPPORTED',
  remove_course_roster_instructor: 'TEST_SUPPORTED',
  reschedule_course_day: 'TEST_SUPPORTED',
  remove_course_day: 'TEST_SUPPORTED',
  update_course_catalog_content: 'TEST_SUPPORTED',
  create_administrative_availability_block: 'TEST_SUPPORTED',
  reschedule_administrative_availability_block: 'TEST_SUPPORTED',
  release_administrative_availability_block: 'TEST_SUPPORTED',
  reconcile_course_enrollment: 'TEST_SUPPORTED',
  link_guest_course_enrollment_to_account: 'T43_DEFERRED',
  link_guest_course_enrollment_to_account_as_administrator: 'T43_DEFERRED',
} as const satisfies Record<CommandKind, TestCommandSupportState>;

export function resolveTestSessionCommandSupport(kind: CommandKind): TestCommandSupportState {
  return TEST_SESSION_COMMAND_SUPPORT[kind];
}

export function isTestSessionCommandSupported(kind: CommandKind): boolean {
  return TEST_SESSION_COMMAND_SUPPORT[kind] === 'TEST_SUPPORTED';
}

/** Client booking-message homework writes stay unreachable until Rules (T42B-8) / Storage (T42B-4). */
export const TEST_CHAT_CLIENT_REACHABILITY = 'deferred_until_rules_and_storage' as const;

export type HomeworkTargetErrorCode =
  | 'CROSS_SCOPE_FORBIDDEN'
  | 'TARGET_NOT_IN_PARTY'
  | 'HOMEWORK_USER_IDS_FORBIDDEN';

export class HomeworkTargetError extends Error {
  constructor(readonly code: HomeworkTargetErrorCode) {
    super(code);
    this.name = 'HomeworkTargetError';
  }
}

export function assertHomeworkTargetsSameScope(input: {
  readonly executionScope: CanonicalExecutionScope;
  readonly bookingPartyParticipantIds: readonly ParticipantId[];
  readonly targetParticipantIds: readonly ParticipantId[];
  readonly targetParticipantRecords: readonly Record<string, unknown>[];
}): void {
  const party = new Set(input.bookingPartyParticipantIds);
  if (input.targetParticipantIds.length !== input.targetParticipantRecords.length) {
    throw new HomeworkTargetError('TARGET_NOT_IN_PARTY');
  }

  for (const [index, participantId] of input.targetParticipantIds.entries()) {
    if (!party.has(participantId)) {
      throw new HomeworkTargetError('TARGET_NOT_IN_PARTY');
    }
    const record = input.targetParticipantRecords[index];
    if (!record || record.participantId !== participantId) {
      throw new HomeworkTargetError('TARGET_NOT_IN_PARTY');
    }
    try {
      assertSameCanonicalScope(input.executionScope, record);
    } catch (error) {
      if (error instanceof PersistedCanonicalScopeError) {
        throw new HomeworkTargetError('CROSS_SCOPE_FORBIDDEN');
      }
      throw error;
    }
  }
}

export function assertNoHomeworkForUserIds(payload: Readonly<Record<string, unknown>>): void {
  if ('homeworkForUserIds' in payload && payload.homeworkForUserIds !== undefined) {
    throw new HomeworkTargetError('HOMEWORK_USER_IDS_FORBIDDEN');
  }
}

/**
 * Persistent TestActor wallet/progress/achievement/summary documents reuse a stable path.
 * A previous-session TEST record must not be accepted until reset/reseed rebinds it.
 */
export function assertTestSessionBoundRecord(input: {
  readonly executionScope: CanonicalExecutionScope;
  readonly persisted: unknown;
}): CanonicalExecutionScope {
  return assertSameCanonicalScope(input.executionScope, input.persisted);
}
