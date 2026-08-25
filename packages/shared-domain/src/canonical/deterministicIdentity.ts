import { z } from 'zod';
import { sha256Hex } from './sha256Hex';
import {
  ActivityLogIdSchema,
  BookingIdSchema,
  CourseEnrollmentIdSchema,
  DomainOutboxIdSchema,
  GuestSubjectIdSchema,
  InstructorRelationshipIdSchema,
  MonetaryEventIdSchema,
  OccurrenceIdSchema,
  ParticipantBlockIdSchema,
  ParticipantManagementIdSchema,
  PaymentIdSchema,
  type AccountId,
  type ActivityLogId,
  type BookingId,
  type BookingProposalId,
  type CommandId,
  type CourseDayId,
  type CourseEnrollmentId,
  type DomainOutboxId,
  type GuestSubjectId,
  type InstructorId,
  type InstructorRelationshipId,
  type MonetaryEventId,
  type OccurrenceId,
  type ParticipantBlockId,
  type ParticipantId,
  type ParticipantManagementId,
  type PaymentId,
} from './identifiers';

const DETERMINISTIC_ID_PART_SEPARATOR = '\u001f';

export function canonicalDeterministicHash(parts: readonly string[]): string {
  const payload = parts.join(DETERMINISTIC_ID_PART_SEPARATOR);
  return sha256Hex(payload);
}

export function activityLogIdFromCommandId(commandId: CommandId): ActivityLogId {
  return ActivityLogIdSchema.parse(canonicalDeterministicHash(['audit:v1', commandId]));
}

export function domainOutboxIdFromCommand(
  commandId: CommandId,
  deliveryEffectOrdinal: number
): DomainOutboxId {
  return DomainOutboxIdSchema.parse(
    canonicalDeterministicHash(['outbox:v1', commandId, String(deliveryEffectOrdinal)])
  );
}

export function monetaryEventIdFromCommandEffect(
  commandId: CommandId,
  effectOrdinal: number
): MonetaryEventId {
  return MonetaryEventIdSchema.parse(
    canonicalDeterministicHash(['monetary:v1', commandId, String(effectOrdinal)])
  );
}

export function participantBlockIdFromDirection(input: {
  readonly participantId: ParticipantId;
  readonly instructorId: InstructorId;
  readonly createdByKind: 'participant_manager' | 'instructor';
}): ParticipantBlockId {
  return ParticipantBlockIdSchema.parse(
    canonicalDeterministicHash([
      'participant_block:v1',
      input.createdByKind,
      input.participantId,
      input.instructorId,
    ])
  );
}

export function instructorRelationshipIdFromPair(input: {
  readonly participantId: ParticipantId;
  readonly instructorId: InstructorId;
}): InstructorRelationshipId {
  return InstructorRelationshipIdSchema.parse(
    canonicalDeterministicHash([
      'instructor_relationship:v1',
      input.participantId,
      input.instructorId,
    ])
  );
}

export function bookingIdFromAcceptedProposal(proposalId: BookingProposalId): BookingId {
  return BookingIdSchema.parse(
    canonicalDeterministicHash(['booking:v1', 'proposal_acceptance', proposalId])
  );
}

export function paymentIdFromBookingId(bookingId: BookingId): PaymentId {
  return PaymentIdSchema.parse(
    canonicalDeterministicHash(['payment:v1', 'booking', bookingId])
  );
}

export function courseEnrollmentIdFromCommandParticipant(input: {
  readonly commandId: CommandId;
  readonly participantId: ParticipantId;
}): CourseEnrollmentId {
  return CourseEnrollmentIdSchema.parse(
    canonicalDeterministicHash([
      'course_enrollment:v1',
      input.commandId,
      input.participantId,
    ])
  );
}

export function paymentIdFromCourseEnrollmentId(
  enrollmentId: CourseEnrollmentId
): PaymentId {
  return PaymentIdSchema.parse(
    canonicalDeterministicHash(['payment:v1', 'course_enrollment', enrollmentId])
  );
}

export function courseEnrollmentSeatOccurrenceId(
  enrollmentId: CourseEnrollmentId
): OccurrenceId {
  return OccurrenceIdSchema.parse(
    canonicalDeterministicHash(['occurrence:v1', 'course_seat', enrollmentId])
  );
}

export function guestSubjectIdFromBookingId(bookingId: BookingId): GuestSubjectId {
  return GuestSubjectIdSchema.parse(
    canonicalDeterministicHash(['guest_subject:v1', 'booking', bookingId])
  );
}

export function participantManagementIdFromGuestLink(input: {
  readonly participantId: ParticipantId;
  readonly accountId: AccountId;
}): ParticipantManagementId {
  return ParticipantManagementIdSchema.parse(
    canonicalDeterministicHash([
      'participant_management:v1',
      'guest_link',
      input.participantId,
      input.accountId,
    ])
  );
}

export function bookingOccurrenceIdFromScheduleRevision(
  bookingId: BookingId,
  scheduleRevision: number
): OccurrenceId {
  if (!Number.isInteger(scheduleRevision) || scheduleRevision < 1) {
    throw new Error('scheduleRevision must be a positive integer');
  }
  return OccurrenceIdSchema.parse(
    canonicalDeterministicHash(['occurrence:v1', 'booking', bookingId, String(scheduleRevision)])
  );
}

export function initialBookingOccurrenceIdFromBookingId(bookingId: BookingId): OccurrenceId {
  return bookingOccurrenceIdFromScheduleRevision(bookingId, 1);
}

export function courseDayOccurrenceIdFromRevision(
  courseDayId: CourseDayId,
  revision: number
): OccurrenceId {
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error('revision must be a positive integer');
  }
  return OccurrenceIdSchema.parse(
    canonicalDeterministicHash(['occurrence:v1', 'course_day', courseDayId, String(revision)])
  );
}

export function initialCourseDayOccurrenceId(courseDayId: CourseDayId): OccurrenceId {
  return courseDayOccurrenceIdFromRevision(courseDayId, 1);
}

export function nextBookingScheduleRevision(
  currentScheduleRevision: number
): number {
  if (!Number.isInteger(currentScheduleRevision) || currentScheduleRevision < 1) {
    throw new Error('currentScheduleRevision must be a positive integer');
  }
  return currentScheduleRevision + 1;
}

const PERSONAL_DATA_PATTERNS = [
  /@/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\+?\d[\d\s().-]{7,}\d\b/,
  /\b\d{3}-\d{2}-\d{4}\b/,
] as const;

export function validateDeterministicIdentityInputs(
  inputs: Readonly<Record<string, string>>,
  context: z.RefinementCtx
): void {
  for (const [key, value] of Object.entries(inputs)) {
    for (const pattern of PERSONAL_DATA_PATTERNS) {
      if (pattern.test(value)) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: 'Deterministic identity inputs must not contain personal data',
        });
      }
    }
  }
}
