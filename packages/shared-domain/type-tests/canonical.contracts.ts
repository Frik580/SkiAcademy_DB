import {
  AccountIdSchema,
  BookingIdSchema,
  CourseIdSchema,
  GuestSubjectIdSchema,
  ParticipantIdSchema,
  accountActorRef,
  activeCourseEnrollmentGuardKey,
  canonicalPaths,
  canonicalReference,
  type BookingId,
} from '../src';
import { canonicalPrimitiveFixtures } from '../src/testing';

const bookingId = BookingIdSchema.parse('booking_contract_01');
const participantId = ParticipantIdSchema.parse('participant_contract_01');
const accountId = AccountIdSchema.parse('account_contract_01');
const guestSubjectId = GuestSubjectIdSchema.parse('guest_contract_01');
const courseId = CourseIdSchema.parse('course_contract_01');

canonicalReference('booking', bookingId);
canonicalPaths.booking(bookingId);
accountActorRef(accountId);
activeCourseEnrollmentGuardKey(participantId, courseId);

// @ts-expect-error A Participant ID cannot cross the Booking reference boundary.
canonicalReference('booking', participantId);

// @ts-expect-error A Participant ID cannot address a Booking document.
canonicalPaths.booking(participantId);

// @ts-expect-error Branded aggregate IDs are not structurally interchangeable.
const crossTypeId: BookingId = participantId;

// @ts-expect-error A guest subject cannot be substituted for an Account actor.
accountActorRef(guestSubjectId);

// @ts-expect-error The active Enrollment guard must be keyed by Participant and Course.
activeCourseEnrollmentGuardKey(bookingId, courseId);

void crossTypeId;
void canonicalPrimitiveFixtures;
