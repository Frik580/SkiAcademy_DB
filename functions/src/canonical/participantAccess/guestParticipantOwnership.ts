import {
  CanonicalCommandError,
  compareCanonicalTimestamps,
  guestSubjectIdFromBookingId,
  guestSubjectIdFromCourseEnrollmentId,
  type CanonicalTimestamp,
  type CommandEnvelope,
  type CourseEnrollment,
  type Participant,
} from '@ski-academy/shared-domain';
import { bookingPath, parseBooking } from '../bookings/bookingStore';
import {
  verifyGuestActionCredentialPartsAuthoritative,
  verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative,
} from '../bookings/guestCredentialVerification';
import { courseEnrollmentPath, parseCourseEnrollment } from '../courses/courseEnrollmentStore';
import { coursePath, parseCourse } from '../courses/courseStore';
import type { CanonicalAtomicTransactionSession } from '../transactions';
import { participantManagementActiveOwnerPath } from './participantAccessStore';

type GuestParticipantProof = NonNullable<
  CommandEnvelope<'create_guest_booking_request'>['intent']['guestParticipantProof']
>;

export function courseEnrollmentCreatedGuestParticipant(
  enrollment: CourseEnrollment,
  participant: Participant
): boolean {
  return enrollment.participantId === participant.participantId &&
    enrollment.audit.createdByCommandId === participant.audit.createdByCommandId;
}

export function isUnlinkedGuestCourseEnrollment(enrollment: CourseEnrollment): boolean {
  return enrollment.payerAccountId === undefined &&
    enrollment.guestAccountLink === undefined &&
    enrollment.attribution.bookingOrigin === 'guest' &&
    enrollment.attribution.bookedBy.kind === 'guest' &&
    enrollment.attribution.bookedBy.guestSubjectId ===
      guestSubjectIdFromCourseEnrollmentId(enrollment.enrollmentId);
}

export function rejectGuestParticipantProof(envelope: CommandEnvelope): never {
  throw new CanonicalCommandError('unauthorized', {
    correlationId: envelope.context.correlationId,
    details: { field: 'guestParticipantProof' },
  });
}

export async function assertGuestParticipantReuseProof(
  session: CanonicalAtomicTransactionSession,
  envelope: CommandEnvelope,
  participant: Participant | undefined,
  participantId: Participant['participantId'],
  proof: GuestParticipantProof | undefined,
  secret: string | undefined,
  now: CanonicalTimestamp
): Promise<Participant> {
  if (!proof || !secret || !participant ||
      participant.participantId !== participantId ||
      participant.lifecycle.status !== 'active' ||
      participant.management.kind !== 'unmanaged_guest' ||
      participant.initialManagementEligibleAccountId !== undefined) {
    rejectGuestParticipantProof(envelope);
  }

  if ('bookingId' in proof) {
    const guestSubjectId = guestSubjectIdFromBookingId(proof.bookingId);
    if (!verifyGuestActionCredentialPartsAuthoritative({
      secret,
      ...proof.credential,
      now,
      expectedBookingId: proof.bookingId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'link_guest_booking',
    }).valid) rejectGuestParticipantProof(envelope);
    const path = bookingPath(proof.bookingId);
    session.plan.planRead({ path, category: 'authorization_check' });
    const read = await session.tx.get({ path });
    const booking = parseBooking(read.exists ? read.data : undefined);
    if (!booking || booking.bookingId !== proof.bookingId ||
        booking.archival?.isDeleted === true || booking.payerAccountId !== undefined ||
        booking.attribution.bookingOrigin !== 'guest' ||
        booking.attribution.bookedBy.kind !== 'guest' ||
        booking.attribution.bookedBy.guestSubjectId !== guestSubjectId ||
        booking.party.participantIds.length !== 1 || booking.party.participantIds[0] !== participantId ||
        booking.audit.createdByCommandId !== participant.audit.createdByCommandId) {
      rejectGuestParticipantProof(envelope);
    }
  } else {
    const guestSubjectId = guestSubjectIdFromCourseEnrollmentId(proof.courseEnrollmentId);
    if (!verifyGuestCourseEnrollmentActionCredentialPartsAuthoritative({
      secret,
      ...proof.credential,
      now,
      expectedEnrollmentId: proof.courseEnrollmentId,
      expectedGuestSubjectId: guestSubjectId,
      expectedPurpose: 'link_guest_course_enrollment',
    }).valid) rejectGuestParticipantProof(envelope);
    const path = courseEnrollmentPath(proof.courseEnrollmentId);
    session.plan.planRead({ path, category: 'authorization_check' });
    const read = await session.tx.get({ path });
    const enrollment = parseCourseEnrollment(read.exists ? read.data : undefined);
    if (!enrollment || enrollment.enrollmentId !== proof.courseEnrollmentId ||
        !isUnlinkedGuestCourseEnrollment(enrollment) ||
        !courseEnrollmentCreatedGuestParticipant(enrollment, participant)) {
      rejectGuestParticipantProof(envelope);
    }
    const originCoursePath = coursePath(enrollment.courseId);
    session.plan.planRead({ path: originCoursePath, category: 'authorization_check' });
    const course = parseCourse((await session.tx.get({ path: originCoursePath })).data);
    if (!course || course.courseId !== enrollment.courseId ||
        compareCanonicalTimestamps(course.scheduleProjection.finalCourseDayEndsAt, proof.credential.expiresAt) !== 0) {
      rejectGuestParticipantProof(envelope);
    }
  }
  // Reservation cancellation changes the service, while account linking revokes profile reuse.
  const ownerPath = participantManagementActiveOwnerPath(participantId);
  session.plan.planRead({ path: ownerPath, category: 'authorization_check' });
  if ((await session.tx.get({ path: ownerPath })).exists) rejectGuestParticipantProof(envelope);
  return participant;
}
