import {
  bookingScopedEvidenceFromQualifyingProgressBooking,
  bookingScopedEvidenceFromQualifyingProgressReadBooking,
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
  // Existential evidence: server-filtered pages, stop at the first valid Booking.
  for (const status of ['confirmed', 'completed'] as const) {
    let startAfter: { path: string; orderValue: number } | undefined;
    while (true) {
      const page = await session.tx.query({
        collection: 'bookings',
        where: { field: 'party.participantIds', op: 'array-contains', value: input.participantId },
        additionalWhere: [
          { field: 'occurrence.instructorId', op: '==', value: input.instructorId },
          { field: 'lifecycle.status', op: '==', value: status },
          { field: 'occurrence.interval.startsAt.seconds', op: '<=', value: input.at.seconds },
        ],
        orderBy: 'occurrence.interval.startsAt.seconds',
        limit: 25,
        ...(startAfter ? { startAfter } : {}),
      });
      for (const document of page) {
        session.plan.planRead({ path: document.path, category: 'authorization_check' });
      }
      session.assertWithinBudget();
      for (const document of page) {
        const booking = parseBooking(document.data);
        if (!booking) continue;
        const scoped = bookingScopedEvidenceFromQualifyingProgressBooking({
          booking,
          instructorId: input.instructorId,
          participantId: input.participantId,
          at: input.at,
        });
        if (scoped) return [scoped];
      }
      if (page.length < 25) break;
      const last = page[page.length - 1]!;
      const startsAt = (last.data!.occurrence as { interval: { startsAt: { seconds: number } } })
        .interval.startsAt;
      startAfter = { path: last.path, orderValue: startsAt.seconds };
    }
  }
  return [];
}

export async function loadInstructorProgressReadBookingScopedEvidence(
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
    .orderBy('occurrence.interval.startsAt.seconds', 'asc');

  let cursor: QueryDocumentSnapshot | undefined;
  while (true) {
    const page = await (cursor ? bookingQuery.startAfter(cursor) : bookingQuery).limit(50).get();
    for (const doc of page.docs) {
      const booking = parseBooking(doc.data() as Record<string, unknown>);
      if (!booking) continue;
      const scoped = bookingScopedEvidenceFromQualifyingProgressReadBooking({
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
