import {
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  InstructorIdSchema,
  attendanceIdFromBookingIdentity,
  bookingProvidesInstructorLessonFeedbackEvidence,
  timestampFromDate,
  type AccountId,
  type AttendanceStatus,
  type Booking,
  type BookingId,
  type InstructorId,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { attendancePath, parseAttendance } from '../bookings/attendanceStore';
import { bookingPath, parseBooking } from '../bookings/bookingStore';
import type { CanonicalAtomicTransactionSession } from '../transactions/firestoreTransactionExecutor';

export function resolveInstructorIdFromActorAccount(
  data: Record<string, unknown> | undefined
): InstructorId | undefined {
  if (typeof data?.instructorId !== 'string') return undefined;
  const parsed = InstructorIdSchema.safeParse(data.instructorId);
  return parsed.success ? parsed.data : undefined;
}

export function resolveCatalogLinkedAccountId(
  data: Record<string, unknown> | undefined
): AccountId | undefined {
  if (typeof data?.linkedAccountId !== 'string') return undefined;
  return data.linkedAccountId as AccountId;
}

function evidenceFromBooking(
  booking: Booking | undefined,
  input: Readonly<{
    instructorId: InstructorId;
    participantId: ParticipantId;
    at: ReturnType<typeof timestampFromDate>;
    attendanceStatus?: AttendanceStatus;
  }>
): Booking | undefined {
  if (!booking) return undefined;
  const allowed = bookingProvidesInstructorLessonFeedbackEvidence({
    booking,
    instructorId: input.instructorId,
    participantId: input.participantId,
    at: input.at,
    ...(input.attendanceStatus ? { attendanceStatus: input.attendanceStatus } : {}),
  });
  return allowed ? booking : undefined;
}

export async function readAuthorizedInstructorLessonFeedbackBooking(
  session: CanonicalAtomicTransactionSession,
  input: Readonly<{
    instructorId: InstructorId;
    participantId: ParticipantId;
    lessonBookingId: BookingId;
    at: ReturnType<typeof timestampFromDate>;
  }>
): Promise<Booking | undefined> {
  const bookingDocumentPath = bookingPath(input.lessonBookingId);
  const bookingRead = await session.tx.get({ path: bookingDocumentPath });
  session.plan.planRead({
    path: bookingDocumentPath,
    category: 'authorization_check',
  });
  const booking = parseBooking(bookingRead.exists ? bookingRead.data : undefined);
  if (!booking) return undefined;

  const attendanceId = attendanceIdFromBookingIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'booking',
    occurrenceId: booking.occurrence.occurrenceId,
    participantId: input.participantId,
  });
  const attendanceDocumentPath = attendancePath(attendanceId);
  const attendanceRead = await session.tx.get({ path: attendanceDocumentPath });
  session.plan.planRead({ path: attendanceDocumentPath, category: 'authorization_check' });
  const attendance = parseAttendance(attendanceRead.exists ? attendanceRead.data : undefined);

  return evidenceFromBooking(booking, {
    instructorId: input.instructorId,
    participantId: input.participantId,
    at: input.at,
    ...(attendance?.attendanceStatus ? { attendanceStatus: attendance.attendanceStatus } : {}),
  });
}

export async function loadAuthorizedInstructorLessonFeedbackBooking(
  firestore: Firestore,
  input: Readonly<{
    instructorId: InstructorId;
    participantId: ParticipantId;
    lessonBookingId: BookingId;
    at: ReturnType<typeof timestampFromDate>;
  }>
): Promise<Booking | undefined> {
  const bookingSnap = await firestore.collection('bookings').doc(input.lessonBookingId).get();
  const booking = parseBooking(bookingSnap.data() as Record<string, unknown> | undefined);
  if (!booking) return undefined;

  const attendanceId = attendanceIdFromBookingIdentity({
    strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
    subjectKind: 'booking',
    occurrenceId: booking.occurrence.occurrenceId,
    participantId: input.participantId,
  });
  const attendanceSnap = await firestore.doc(attendancePath(attendanceId)).get();
  const attendance = parseAttendance(attendanceSnap.data() as Record<string, unknown> | undefined);

  return evidenceFromBooking(booking, {
    instructorId: input.instructorId,
    participantId: input.participantId,
    at: input.at,
    ...(attendance?.attendanceStatus ? { attendanceStatus: attendance.attendanceStatus } : {}),
  });
}
