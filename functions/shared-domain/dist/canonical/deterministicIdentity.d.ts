import { z } from 'zod';
import { type AccountId, type ActivityLogId, type BookingId, type BookingProposalId, type CommandId, type CourseDayId, type CourseEnrollmentId, type DomainOutboxId, type GuestSubjectId, type InstructorId, type InstructorRelationshipId, type MonetaryEventId, type OccurrenceId, type ParticipantBlockId, type ParticipantId, type ParticipantManagementId, type PaymentId } from './identifiers';
export declare function canonicalDeterministicHash(parts: readonly string[]): string;
export declare function activityLogIdFromCommandId(commandId: CommandId): ActivityLogId;
export declare function domainOutboxIdFromCommand(commandId: CommandId, deliveryEffectOrdinal: number): DomainOutboxId;
export declare function monetaryEventIdFromCommandEffect(commandId: CommandId, effectOrdinal: number): MonetaryEventId;
export declare function participantBlockIdFromDirection(input: {
    readonly participantId: ParticipantId;
    readonly instructorId: InstructorId;
    readonly createdByKind: 'participant_manager' | 'instructor';
}): ParticipantBlockId;
export declare function instructorRelationshipIdFromPair(input: {
    readonly participantId: ParticipantId;
    readonly instructorId: InstructorId;
}): InstructorRelationshipId;
export declare function bookingIdFromAcceptedProposal(proposalId: BookingProposalId): BookingId;
export declare function paymentIdFromBookingId(bookingId: BookingId): PaymentId;
export declare function courseEnrollmentIdFromCommandParticipant(input: {
    readonly commandId: CommandId;
    readonly participantId: ParticipantId;
}): CourseEnrollmentId;
export declare function paymentIdFromCourseEnrollmentId(enrollmentId: CourseEnrollmentId): PaymentId;
export declare function courseEnrollmentSeatOccurrenceId(enrollmentId: CourseEnrollmentId): OccurrenceId;
export declare function guestSubjectIdFromBookingId(bookingId: BookingId): GuestSubjectId;
export declare function guestSubjectIdFromCourseEnrollmentId(enrollmentId: CourseEnrollmentId): GuestSubjectId;
export declare function participantManagementIdFromGuestLink(input: {
    readonly participantId: ParticipantId;
    readonly accountId: AccountId;
}): ParticipantManagementId;
export declare function bookingOccurrenceIdFromScheduleRevision(bookingId: BookingId, scheduleRevision: number): OccurrenceId;
export declare function initialBookingOccurrenceIdFromBookingId(bookingId: BookingId): OccurrenceId;
export declare function courseDayOccurrenceIdFromRevision(courseDayId: CourseDayId, revision: number): OccurrenceId;
export declare function initialCourseDayOccurrenceId(courseDayId: CourseDayId): OccurrenceId;
export declare function nextBookingScheduleRevision(currentScheduleRevision: number): number;
export declare function validateDeterministicIdentityInputs(inputs: Readonly<Record<string, string>>, context: z.RefinementCtx): void;
