import {
  bookingScopedEvidenceFromQualifyingProgressBooking,
  timestampFromDate,
  type BookingScopedParticipantAccessEvidence,
  type InstructorId,
  type ParticipantId,
} from '@ski-academy/shared-domain';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
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
    const scoped = bookingScopedEvidenceFromQualifyingProgressBooking({
      booking,
      instructorId: input.instructorId,
      participantId: input.participantId,
      at: input.at,
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
  const bookingQuery = firestore
    .collection('bookings')
    .where('party.participantIds', 'array-contains', input.participantId)
    .where('occurrence.instructorId', '==', input.instructorId)
    .where('lifecycle.status', 'in', ['confirmed', 'completed'])
    .where('occurrence.interval.startsAt.seconds', '<=', input.at.seconds)
    .orderBy('occurrence.interval.startsAt.seconds', 'asc');

  let cursor: QueryDocumentSnapshot | undefined;
  while (true) {
    const page = await (cursor ? bookingQuery.startAfter(cursor) : bookingQuery).limit(50).get();
    for (const doc of page.docs) {
      const booking = parseBooking(doc.data() as Record<string, unknown>);
      if (!booking) continue;
      const scoped = bookingScopedEvidenceFromQualifyingProgressBooking({
        booking,
        instructorId: input.instructorId,
        participantId: input.participantId,
        at: input.at,
      });
      if (scoped) return [scoped];
    }
    if (page.docs.length < 50) return [];
    cursor = page.docs[page.docs.length - 1];
  }
}
