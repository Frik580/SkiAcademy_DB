import {
  ATTENDANCE_IDENTITY_STRATEGY_VERSION,
  attendanceIdFromBookingIdentity,
  bookingScopedEvidenceFromQualifyingProgressBooking,
  timestampFromDate,
  type BookingScopedParticipantAccessEvidence,
  type InstructorId,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import type { Firestore } from 'firebase-admin/firestore';
import { attendancePath, parseAttendance } from '../bookings/attendanceStore';
import { parseBooking } from '../bookings/bookingStore';
import type { CanonicalAtomicTransactionSession } from '../transactions/firestoreTransactionExecutor';

export async function readInstructorProgressBookingScopedEvidence(
  session: CanonicalAtomicTransactionSession,
  input: Readonly<{
    instructorId: InstructorId;
    participantId: ParticipantId;
    at: ReturnType<typeof timestampFromDate>;
  }>
): Promise<readonly BookingScopedParticipantAccessEvidence[]> {
  const bookingReads = await session.tx.query({
    collection: 'bookings',
    where: {
      field: 'party.participantIds',
      op: 'array-contains',
      value: input.participantId,
    },
  });

  const evidence: BookingScopedParticipantAccessEvidence[] = [];
  for (const document of bookingReads) {
    session.plan.planRead({ path: document.path, category: 'authorization_check' });
    const booking = parseBooking(document.data);
    if (!booking) continue;
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId: booking.occurrence.occurrenceId,
      participantId: input.participantId,
    });
    const attendanceDocumentPath = attendancePath(attendanceId);
    const attendanceRead = await session.tx.get({ path: attendanceDocumentPath });
    session.plan.planRead({ path: attendanceDocumentPath, category: 'authorization_check' });
    const attendance = parseAttendance(
      attendanceRead.exists ? attendanceRead.data : undefined
    );
    const scoped = bookingScopedEvidenceFromQualifyingProgressBooking({
      booking,
      instructorId: input.instructorId,
      participantId: input.participantId,
      at: input.at,
      ...(attendance?.attendanceStatus
        ? { attendanceStatus: attendance.attendanceStatus }
        : {}),
    });
    if (scoped) evidence.push(scoped);
  }
  return evidence;
}

export async function loadInstructorProgressBookingScopedEvidence(
  firestore: Firestore,
  input: Readonly<{
    instructorId: InstructorId;
    participantId: ParticipantId;
    at: ReturnType<typeof timestampFromDate>;
  }>
): Promise<readonly BookingScopedParticipantAccessEvidence[]> {
  const bookingSnap = await firestore
    .collection('bookings')
    .where('party.participantIds', 'array-contains', input.participantId)
    .limit(50)
    .get();

  const evidence: BookingScopedParticipantAccessEvidence[] = [];
  for (const doc of bookingSnap.docs) {
    const booking = parseBooking(doc.data() as Record<string, unknown>);
    if (!booking) continue;
    const attendanceId = attendanceIdFromBookingIdentity({
      strategyVersion: ATTENDANCE_IDENTITY_STRATEGY_VERSION,
      subjectKind: 'booking',
      occurrenceId: booking.occurrence.occurrenceId,
      participantId: input.participantId,
    });
    const attendanceSnap = await firestore.doc(attendancePath(attendanceId)).get();
    const attendance = parseAttendance(
      attendanceSnap.data() as Record<string, unknown> | undefined
    );
    const scoped = bookingScopedEvidenceFromQualifyingProgressBooking({
      booking,
      instructorId: input.instructorId,
      participantId: input.participantId,
      at: input.at,
      ...(attendance?.attendanceStatus
        ? { attendanceStatus: attendance.attendanceStatus }
        : {}),
    });
    if (scoped) evidence.push(scoped);
  }
  return evidence;
}
